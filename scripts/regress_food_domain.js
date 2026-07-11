#!/usr/bin/env node
/*
 * regress_food_domain.js — 食品ドメインの回帰テスト（SPEC-014/015 受け入れ条件）
 * app.html の全スクリプト（モジュール+inline）を DOM スタブ付き vm で実行し、
 * 純ロジック（カタログ変換・レシピ按分・キュー・eufy変換 等）を検証する。
 * 使い方: node scripts/regress_food_domain.js   （push 前に check_build.js と併せて実行）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
process.on('unhandledRejection', () => {}); // supabase-js CDN import は node では失敗して良い（アプリ側で捕捉済み設計）

// ---- DOM/ブラウザ環境スタブ（セレクタごとに別インスタンスを返す） ----
function makeElement() {
  const el = {
    style: {}, dataset: {}, classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { (f === undefined ? !this._s.has(c) : f) ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    appendChild() {}, remove() {}, click() {}, focus() {}, closest() { return null; },
    querySelector() { return makeElement(); }, querySelectorAll() { return []; },
    setAttribute() {}, getBoundingClientRect() { return { width: 0, height: 0 }; }
  };
  return el;
}
const elements = new Map();
function getEl(key) {
  if (!elements.has(key)) elements.set(key, makeElement());
  return elements.get(key);
}
const storageMap = new Map();
const localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k)
};
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage,
  navigator: { onLine: true, serviceWorker: undefined },
  document: {
    querySelector: (s) => getEl(s), getElementById: (s) => getEl(`#${s}`),
    querySelectorAll: () => [], createElement: () => makeElement(),
    addEventListener() {}, body: makeElement(), documentElement: makeElement(),
    readyState: 'complete', visibilityState: 'visible'
  },
  crypto: require('crypto').webcrypto,
  fetch: () => Promise.reject(new Error('offline (test)')),
  CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } },
  URL, URLSearchParams,
  location: { origin: 'https://example.test', pathname: '/app.html', search: '' },
  history: { replaceState() {} }
};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => {};
sandbox.scrollTo = () => {};
sandbox.open = () => {};
sandbox.confirm = () => false;
sandbox.prompt = () => '';
sandbox.alert = () => {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

// ---- app.html のスクリプトを実行順に読み込み ----
const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const moduleSrcs = [...html.matchAll(/<script\s+src="((?:js\/)?[^"]+\.js)"\s*><\/script>/g)].map((m) => m[1]);
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
for (const src of moduleSrcs) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), context, { filename: src });
}
for (const [i, code] of inline.entries()) {
  vm.runInContext(code, context, { filename: `app.html#inline${i}` });
}

// ---- アサーション ----
let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) console.log(`✅ ${name}`);
  else { failed++; console.log(`❌ ${name} ${detail}`); }
}
const g = sandbox;

// 1) カタログが構築されている（埋め込み278件前後。let宣言のためコンテキスト内で評価）
const catalogLen = vm.runInContext('allFoods.length', context);
ok('カタログ構築', catalogLen > 200, `(${catalogLen}件)`);

// 2) レシピ按分: 白米300g + 概算たれ60kcal を3食分 → (168*3+60)/3 = 188kcal/食
const calc = g.computeRecipeNutrition([
  { foodId: 'rice', name: '白米', qty: 300, unit: 'g', free: false },
  { free: true, name: 'たれ', estKcal: 60, estProteinG: 1, estFatG: 0, estCarbG: 14 }
], 3);
ok('レシピ按分（手計算一致）', calc.macrosPerServing.kcal === 188, `(${calc.macrosPerServing.kcal})`);

// 3) foods行 ⇄ カタログ食品 の往復
const cat = g.serverFoodToCatalog({ id: 'u1', legacy_key: 'hakutei-01001', name: 'アマランサス 玄穀', kind: 'ingredient', mode: 'per100g', kcal_per_100g: 343, protein_g: 12.7, fat_g: 6, carb_g: 64.9, units: { g: 1 }, micros: { K: 600 }, meta: { category: '穀類' } });
ok('foods行→カタログ(per100g)', cat.macros.kcal === 343 && cat.units[0].label === 'g' && cat.micros.K === 600);
const row = g.catalogFoodToRow({ id: 'prod-x', kind: 'product', name: 'テスト', mode: 'perUnit', unitLabel: '袋', macrosPerUnit: { kcal: 250, p: 3, f: 12, c: 32 }, source: 'label', verified: true });
ok('カタログ→foods行(perUnit)', row.per_unit.kcal === 250 && row.unit_label === '袋' && row.kind === 'product');

// 4) 検索ランキングの前提: 八訂行は使用実績なし+1文字クエリで除外される想定のガード関数
//    （renderSearch はDOM依存のため、ここでは hakutei プレフィクス判定の存在だけ確認）
ok('八訂ガード（renderSearchに実装）', /hakutei-/.test(inline.join('')), '');

// 5) キュー: 同キー置換・discard・冪等
g.HSSbQueue.save([]);
g.HSSbQueue.enqueue('food_save', 'food_save:x', { a: 1 });
g.HSSbQueue.enqueue('food_save', 'food_save:x', { a: 2 });
ok('キュー同キー置換', g.HSSbQueue.count() === 1 && g.HSSbQueue.load()[0].data.a === 2);
g.HSSbQueue.discard('food_save:x');
ok('キューdiscard', g.HSSbQueue.count() === 0);

// 6) 食事payload: 外食noteに店名のみ・URL禁止（★7）
const payload = g.sbMealPayload({
  id: 'rec-1', date: '2026-07-11', timingKey: 'lunch', timing: '昼', kcal: 500, protein: 30, fat: 10, carb: 60,
  diningOut: true, restaurantName: '店A', googleMapUrl: 'https://maps.example/x', diningText: '定食',
  structuredItems: [{ foodId: 'rice', foodName: '白米', qty: 1, unit: '膳', grams: 150, nutrients: { energy: 252 } }]
});
ok('★7: payloadにURL非混入', !JSON.stringify(payload).includes('maps.example') && payload.dining.note === '店名: 店A / 定食');

// 7) eufy CSV 変換（列番号契約）
const rows2 = g.eufyCsvToRows('h\n2026/7/1 7:00:00,x,67.2,22.9,17.8,x,53.1,x,1580,58,12,55,2.9,x,x,18,30.5,15.2');
ok('eufy変換', rows2.length === 1 && rows2[0].weight_kg === 67.2 && rows2[0].measured_at === '2026-07-01T07:00:00+09:00');

// 8) 週次丸め
ok('週次丸め', g.wkInt(155.6) === '156' && g.wkDec1(6.75) === '6.8' && g.wkPct(0.857) === '86%');

// 9) 漢字→かなエイリアス（SPEC-017 E2）
const v1 = g.buildQueryVariants('豚バラ');
ok('エイリアス: 豚バラ→ぶた分割展開', v1.length >= 2 && /ぶた/.test(v1[1]), JSON.stringify(v1));
const v2 = g.buildQueryVariants('鶏もも');
ok('エイリアス: 鶏の両読み(にわとり/とり)', v2.some((x) => x.includes('にわとり')) && v2.some((x) => / とり /.test(x)), JSON.stringify(v2));
// バリアントAND一致の実地: 八訂様の名前に「豚肉」が当たる
const hay = g.normalizeForSearch('ぶた 大型種肉 ばら 脂身つき 生 畜肉類');
const vt = g.buildQueryVariants('豚肉').map((s) => s.split(/\s+/).map(g.normalizeForSearch).filter(Boolean));
ok('エイリアス: 「豚肉」が八訂名にヒット', vt.some((t) => t.every((tok) => hay.includes(tok))));
const vd = g.buildQueryVariants('大根').map((s) => s.split(/\s+/).map(g.normalizeForSearch).filter(Boolean));
ok('エイリアス: 「大根」→だいこんヒット', vd.some((t) => t.every((tok) => g.normalizeForSearch('だいこん 根 皮つき 生 だいこん類').includes(tok))));

// 10) AIコピペ取り込みパーサ（SPEC-016）
const clean = g.parseAiFoodResult('{"name":"テスト菓子","brand":"A社","basis":"perUnit","unit_label":"袋","kcal":250,"protein_g":3,"fat_g":12,"carb_g":32,"salt_g":0.4,"estimate":false,"source":"a-sha.co.jp"}');
ok('AIパーサ: 素のJSON', clean.kcal === 250 && clean.unitLabel === '袋' && clean.source === 'a-sha.co.jp');
const fenced = g.parseAiFoodResult('以下が結果です:\n```json\n{"name":"X","basis":"per100g","kcal":100,"protein_g":5,"fat_g":2,"carb_g":12,"estimate":true,"source":"類似品"}\n```\n以上です。');
ok('AIパーサ: フェンス+前後文章', fenced.kcal === 100 && fenced.basis === 'per100g' && fenced.estimate === true);
const quotes = g.parseAiFoodResult('{“name”: “Y”, “kcal”: 88, “protein_g”: 1, “fat_g”: 2, “carb_g”: 3,}');
ok('AIパーサ: 全角引用符+末尾カンマ', quotes.kcal === 88);
const bad = g.parseAiFoodResult('すみません、見つかりませんでした。');
ok('AIパーサ: 不正入力はエラー', Boolean(bad.error));
const noKcal = g.parseAiFoodResult('{"name":"Z","kcal":"不明"}');
ok('AIパーサ: kcal非数値はエラー', Boolean(noKcal.error));

// 11) 栄養分析（SPEC-013）: カタログ食品→栄養エントリ変換で micros が失われないこと
const entry = vm.runInContext(`NUTRITION_DB.convertFoodToNutritionEntry(serverFoodToCatalog({
  id: 'u9', legacy_key: 'hakutei-06267', name: 'ほうれんそう 葉 生', kind: 'ingredient', mode: 'per100g',
  kcal_per_100g: 18, protein_g: 2.2, fat_g: 0.4, carb_g: 3.1, fiber_g: 2.8, salt_g: 0,
  units: { g: 1 }, micros: { Fe: 2.0, K: 690, folate: 210, vitC: 35 }, meta: {} }))`, context);
ok('栄養変換: 八訂microsが分析に届く', entry.per100g.Fe === 2 && entry.per100g.folate === 210 && entry.per100g.fiber === 2.8, JSON.stringify({Fe: entry.per100g.Fe, fiber: entry.per100g.fiber}));

// 11b) E9: 脂肪酸成分表編の追補キー（saturatedFat/n3/n6）が分析に届くこと
const fattyEntry = vm.runInContext(`NUTRITION_DB.convertFoodToNutritionEntry(serverFoodToCatalog({
  id: 'u10', legacy_key: 'hakutei-10136', name: '鮭 焼き', kind: 'ingredient', mode: 'per100g',
  kcal_per_100g: 161, protein_g: 29.1, fat_g: 5.1, carb_g: 0.1,
  units: { g: 1 }, micros: { saturatedFat: 1.01, n3: 1.12, n6: 0.09, vitD: 39 }, meta: {} }))`, context);
ok('栄養変換: E9脂肪酸(saturatedFat/n3/n6)が分析に届く',
  fattyEntry.per100g.saturatedFat === 1.01 && fattyEntry.per100g.n3 === 1.12 && fattyEntry.per100g.n6 === 0.09,
  JSON.stringify({sat: fattyEntry.per100g.saturatedFat, n3: fattyEntry.per100g.n3}));

// 12) 栄養集計と判定（レコード投入→state→judgement）
vm.runInContext(`
  localStorage.setItem('meal_recs_v3', JSON.stringify([{
    id: 'rec-t1', date: '2026-07-09', timingKey: 'lunch', timing: '昼', synced: true,
    items: [{foodId: 'rice', qty: 1, unit: '膳'}],
    structuredItems: [{ foodId: 'rice', foodName: '白米', qty: 1, unit: '膳', nutrients: { energy: 252, protein: 3.8, fat: 0.5, carb: 55.7 } }]
  }]));
`, context);
const nt = vm.runInContext(`(() => { const s = buildNutritionState('2026-07-09'); const j = buildNtJudgement(s); return { meals: s.totals.meals, kcal: Math.round(s.nutrients.energy), K: Math.round(s.nutrients.K || 0), score: j.score, pri: j.priorities.length }; })()`, context);
ok('栄養集計: 記録→state→判定', nt.meals === 1 && nt.kcal > 200 && nt.score > 0 && nt.pri > 0, JSON.stringify(nt));
ok('栄養集計: microsが再構築で補完される', nt.K > 0, `(K=${nt.K}mg ※スナップショットはマクロのみ)`);

// 13) 同期カウントの差分検知（マネージャー指摘 2026-07-11: 毎回「更新9」と出るバグの回帰）
const mergeTest = vm.runInContext(`(() => {
  const rec = { id: 'rec-m1', date: '2026-07-08', timingKey: 'lunch', timing: '昼', synced: true, kcal: 500,
    items: [], structuredItems: [{ foodId: 'rice', qty: 1, unit: '膳', nutrients: { energy: 500 } }] };
  localStorage.setItem('meal_recs_v3', JSON.stringify([rec]));
  const same = mergeServerMealRecords([JSON.parse(JSON.stringify(rec))]);
  const changed = mergeServerMealRecords([{ ...JSON.parse(JSON.stringify(rec)), kcal: 600,
    structuredItems: [{ foodId: 'rice', qty: 2, unit: '膳', nutrients: { energy: 600 } }] }]);
  localStorage.removeItem('meal_recs_v3');
  return { sameUnchanged: same.unchanged, sameUpdated: same.updated, changedUpdated: changed.updated };
})()`, context);
ok('同期カウント: 同一内容はunchanged', mergeTest.sameUnchanged === 1 && mergeTest.sameUpdated === 0, JSON.stringify(mergeTest));
ok('同期カウント: 変更時のみupdated', mergeTest.changedUpdated === 1, '');

console.log(failed ? `\n判定: FAIL（${failed}件）` : '\n判定: PASS（食品ドメイン回帰 全項目合格）');
process.exit(failed ? 1 : 0);
