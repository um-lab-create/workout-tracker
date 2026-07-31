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
// 10b) 微量栄養素の取り込み（SPEC-023: サプリ・強化食品）。未知キー・0・文字列は捨てる
const supp = g.parseAiFoodResult('{"name":"マルチビタミン","brand":"D社","basis":"perUnit","unit_label":"粒",'
  + '"kcal":1.2,"protein_g":0,"fat_g":0,"carb_g":0.3,'
  + '"micros":{"vitB1":1.2,"Zn":6.0,"vitC":100,"unknownKey":9,"vitD":0,"vitE":"不明"},'
  + '"estimate":false,"source":"公式"}');
ok('AIパーサ: microsを取り込む', supp.micros.vitB1 === 1.2 && supp.micros.Zn === 6 && supp.micros.vitC === 100,
  JSON.stringify(supp.micros));
ok('AIパーサ: 未知キー/0/文字列のmicrosは捨てる',
  !('unknownKey' in supp.micros) && !('vitD' in supp.micros) && !('vitE' in supp.micros));

// 10c) E5: 八訂食材の常用単位テンプレ（g だけでは 卵1個・のり1枚 が入力できなかった）
const eggCat = g.serverFoodToCatalog({ id: 'e1', legacy_key: 'hakutei-12004', name: '卵', kind: 'ingredient',
  mode: 'per100g', kcal_per_100g: 142, protein_g: 12.2, fat_g: 10.2, carb_g: 0.3, units: { g: 1 }, meta: {} });
const eggPortion = g.calcFoodPortion(eggCat, 1, '個');
ok('E5: 卵に「個」単位が付く（1個=50g→71kcal）',
  eggCat.units[0].label === '個' && eggCat.units[0].grams === 50 && Math.round(eggPortion.kcal) === 71,
  JSON.stringify({ units: eggCat.units.map((u) => u.label), kcal: eggPortion.kcal }));
const noriCat = g.serverFoodToCatalog({ id: 'n1', legacy_key: 'hakutei-09004', name: 'のり', kind: 'ingredient',
  mode: 'per100g', kcal_per_100g: 297, protein_g: 41.4, fat_g: 3.7, carb_g: 44.3, units: { g: 1 }, meta: {} });
ok('E5: のりに「枚」単位（1枚=3g）', noriCat.units[0].label === '枚' && noriCat.units[0].grams === 3);
ok('E5: g は必ず末尾に残る', eggCat.units[eggCat.units.length - 1].label === 'g');
// 既に人間向け単位を持つ食品（埋め込み・市販品）は書き換えない
const breadCat = g.serverFoodToCatalog({ id: 'b1', legacy_key: 'bread', name: '食パン', kind: 'ingredient',
  mode: 'per100g', kcal_per_100g: 248, protein_g: 8.9, fat_g: 4.1, carb_g: 46.7,
  units: [{ label: '枚', grams: 80, step: 0.5, defaultQty: 1 }, { label: 'g', grams: 1, step: 10, defaultQty: 100 }], meta: {} });
ok('E5: 既存の人間向け単位は上書きしない（食パン1枚=80gのまま）', breadCat.units[0].grams === 80);

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
// [perf] 監査#18: 記録の投入・撤去はアプリの書込API saveRecords 経由に統一
// （getRecords がキャッシュを持つため、素の localStorage.setItem では反映されない）
vm.runInContext(`
  saveRecords([{
    id: 'rec-t1', date: '2026-07-09', timingKey: 'lunch', timing: '昼', synced: true,
    items: [{foodId: 'rice', qty: 1, unit: '膳'}],
    structuredItems: [{ foodId: 'rice', foodName: '白米', qty: 1, unit: '膳', nutrients: { energy: 252, protein: 3.8, fat: 0.5, carb: 55.7 } }]
  }]);
`, context);
const nt = vm.runInContext(`(() => { const s = buildNutritionState('2026-07-09'); const j = buildNtJudgement(s); return { meals: s.totals.meals, kcal: Math.round(s.nutrients.energy), K: Math.round(s.nutrients.K || 0), score: j.score, pri: j.priorities.length }; })()`, context);
ok('栄養集計: 記録→state→判定', nt.meals === 1 && nt.kcal > 200 && nt.score > 0 && nt.pri > 0, JSON.stringify(nt));
ok('栄養集計: microsが再構築で補完される', nt.K > 0, `(K=${nt.K}mg ※スナップショットはマクロのみ)`);

// 13) 同期カウントの差分検知（マネージャー指摘 2026-07-11: 毎回「更新9」と出るバグの回帰）
const mergeTest = vm.runInContext(`(() => {
  const rec = { id: 'rec-m1', date: '2026-07-08', timingKey: 'lunch', timing: '昼', synced: true, kcal: 500,
    items: [], structuredItems: [{ foodId: 'rice', qty: 1, unit: '膳', nutrients: { energy: 500 } }] };
  saveRecords([rec]);
  const same = mergeServerMealRecords([JSON.parse(JSON.stringify(rec))]);
  const changed = mergeServerMealRecords([{ ...JSON.parse(JSON.stringify(rec)), kcal: 600,
    structuredItems: [{ foodId: 'rice', qty: 2, unit: '膳', nutrients: { energy: 600 } }] }]);
  saveRecords([]);
  return { sameUnchanged: same.unchanged, sameUpdated: same.updated, changedUpdated: changed.updated };
})()`, context);
ok('同期カウント: 同一内容はunchanged', mergeTest.sameUnchanged === 1 && mergeTest.sameUpdated === 0, JSON.stringify(mergeTest));
ok('同期カウント: 変更時のみupdated', mergeTest.changedUpdated === 1, '');

// 14) 「いつもの」学習（記録継続の打ち手 2026-07-13）: 同曜日を優先し、2回以上の常習構成を採用
const usualTest = vm.runInContext(`(() => {
  // 2026-07-13 は月曜。過去の月曜の昼 = A構成×2 / 他曜日の昼 = B構成×3
  const mk = (id, date, ids, kcal) => ({ id, date, timingKey: 'lunch', timing: '昼', synced: true, kcal,
    items: ids.map((f) => ({ foodId: f, qty: 1, unit: 'g' })), structuredItems: [] });
  saveRecords([
    mk('r1', '2026-07-06', ['rice', 'egg'], 500),        // 月
    mk('r2', '2026-06-29', ['rice', 'egg'], 510),        // 月
    mk('r3', '2026-07-07', ['bread', 'milk'], 300),      // 火
    mk('r4', '2026-07-08', ['bread', 'milk'], 300),      // 水
    mk('r5', '2026-07-09', ['bread', 'milk'], 300)       // 木
  ]);
  const dow = usualMealFor('lunch', '2026-07-13');       // 月曜
  const other = usualMealFor('lunch', '2026-07-14');     // 火曜（同曜日の常習が無い→全体の最頻）
  const none = usualMealFor('dinner', '2026-07-13');     // 記録なし
  saveRecords([]);
  return {
    dowIds: dow ? dow.record.items.map((i) => i.foodId).sort().join(',') : null,
    dowSame: dow ? dow.sameDow : null, dowCount: dow ? dow.count : 0,
    otherIds: other ? other.record.items.map((i) => i.foodId).sort().join(',') : null,
    none: none === null
  };
})()`, context);
ok('いつもの: 同曜日の常習構成を優先（月曜の昼=rice+egg・2回）',
  usualTest.dowIds === 'egg,rice' && usualTest.dowSame === true && usualTest.dowCount === 2, JSON.stringify(usualTest));
ok('いつもの: 同曜日に常習が無ければ全体の最頻（bread+milk）', usualTest.otherIds === 'bread,milk');
ok('いつもの: 記録が足りなければ null', usualTest.none === true);
// 14b) 完全一致でなく「6割似ていれば同じ構成」とみなす（実測: 朝食は核3品+日替わり1〜2品）
const simTest = vm.runInContext(`(() => {
  const mk = (id, date, ids) => ({ id, date, timingKey: 'morning', timing: '朝', synced: true, kcal: 400,
    items: ids.map((f) => ({ foodId: f, qty: 1, unit: 'g' })), structuredItems: [] });
  saveRecords([
    mk('a', '2026-07-10', ['bihidas', 'banana', 'soy-protein', 'bread']),
    mk('b', '2026-07-09', ['bihidas', 'banana', 'soy-protein', 'mix-nuts', 'raisin']),
    mk('c', '2026-07-08', ['bihidas', 'banana', 'soy-protein', 'mix-nuts'])
  ]);
  const u = usualMealFor('morning', '2026-07-13');
  const sim = mealSimilarity([{foodId:'a'},{foodId:'b'},{foodId:'c'}], [{foodId:'a'},{foodId:'b'},{foodId:'d'}]);
  saveRecords([]);
  return { count: u ? u.count : 0, date: u ? u.record.date : null, sim: Math.round(sim * 100) };
})()`, context);
ok('いつもの: 6割類似で常習と判定（核3品が共通・最新を採用）',
  simTest.count >= 2 && simTest.date === '2026-07-10', JSON.stringify(simTest));
ok('いつもの: 類似度が計算できる（2/4=50%）', simTest.sim === 50, JSON.stringify(simTest));

// 15) 名寄せ（2026-07-13）: 埋め込みと同名の八訂行は検索・候補から隠す（非破壊・使用実績があれば残す）
const dupTest = vm.runInContext(`(() => {
  const emb = allFoods.find((f) => f.id === 'egg');                 // 埋め込みの「卵」
  const hak = allFoods.filter((f) => String(f.id).startsWith('hakutei-') && f.name === '卵');
  return {
    hasEmbedded: Boolean(emb),
    hakuteiTwins: hak.length,
    twinsHidden: hak.every((f) => f.duplicateOfEmbedded === true),
    embeddedVisible: emb ? emb.duplicateOfEmbedded !== true : false
  };
})()`, context);
ok('名寄せ: 埋め込みと同名の八訂行に重複マークが付く',
  !dupTest.hakuteiTwins || dupTest.twinsHidden, JSON.stringify(dupTest));
ok('名寄せ: 埋め込み側は隠さない', dupTest.embeddedVisible, JSON.stringify(dupTest));

// ---- SPEC-024: 運動種目のAI登録（privacy-auditor [R-1][R-3] の担保をテストで固定する）----
const exoOk = vm.runInContext(`parseAiExerciseResult(JSON.stringify({
  name: 'バスケットボール(3on3)', short: 'バスケ3on3', kanji: '球', kind: 'sport',
  mets: 6.0, fields: ['minutes'], defaults: { minutes: 60 },
  source: '国立健康・栄養研究所 身体活動のメッツ表'
}))`, context);
ok('SPEC-024: 正常なAI出力を取り込める',
  !exoOk.error && exoOk.mets === 6 && exoOk.fields.join() === 'minutes' && exoOk.kanji === '球',
  JSON.stringify(exoOk));

// [R-1] URL を含む名前は拒否（★7・DB CHECK の手前でフロントも弾く）
const exoUrl = vm.runInContext(`parseAiExerciseResult(JSON.stringify({
  name: 'バスケ https://maps.example.com/x', kind: 'sport', mets: 6, fields: ['minutes']
}))`, context);
ok('SPEC-024: 名前にURLがあれば拒否（★7）', Boolean(exoUrl.error), JSON.stringify(exoUrl));

// [R-1] 固有地名・施設名は拒否
const exoPlace = vm.runInContext(`parseAiExerciseResult(JSON.stringify({
  name: '〇〇スポーツクラブでバスケ', kind: 'sport', mets: 6, fields: ['minutes']
}))`, context);
ok('SPEC-024: 施設名らしい語があれば拒否（[R-1]）', Boolean(exoPlace.error), JSON.stringify(exoPlace));

// source に URL が来たら source だけ捨てて登録は通す（DB CHECK に到達させない）
const exoSrcUrl = vm.runInContext(`parseAiExerciseResult(JSON.stringify({
  name: 'バスケットボール(1on1)', kind: 'sport', mets: 8, fields: ['minutes'],
  source: 'https://example.com/mets'
}))`, context);
ok('SPEC-024: 出典のURLは捨てて登録は通る',
  !exoSrcUrl.error && exoSrcUrl.source === '', JSON.stringify(exoSrcUrl));

// [R-3] 未知フィールドはホワイトリストで落ちる / 範囲外METsは拒否
const exoField = vm.runInContext(`parseAiExerciseResult(JSON.stringify({
  name: '家トレ ダンベルカール', kind: 'strength', mets: 3.5,
  fields: ['weight', 'reps', 'sets', 'evilField'], defaults: { weight: 10, reps: 12, sets: 3 }
}))`, context);
ok('SPEC-024: 未知フィールドは捨てる（[R-3]）',
  !exoField.error && exoField.fields.join() === 'weight,reps,sets', JSON.stringify(exoField));
const exoMets = vm.runInContext(`parseAiExerciseResult(JSON.stringify({
  name: 'テスト', kind: 'sport', mets: 99, fields: ['minutes']
}))`, context);
ok('SPEC-024: METs範囲外は拒否', Boolean(exoMets.error), JSON.stringify(exoMets));

// スポーツ/有酸素は minutes を必ず含める（消費kcal計算に必要）
const exoMin = vm.runInContext(`parseAiExerciseResult(JSON.stringify({
  name: 'ランニング', kind: 'cardio', mets: 8, fields: ['distance'], defaults: { distance: 5 }
}))`, context);
ok('SPEC-024: 有酸素はminutesを補う', !exoMin.error && exoMin.fields.includes('minutes'), JSON.stringify(exoMin));

// 消費kcal: METs × 体重 × 時間 × 1.05（体重が無ければ null＝架空値を出さない）
const exoKcal = vm.runInContext(`(() => {
  const exo = { mets: 6, fields: ['minutes'] };
  const before = estimateWorkoutKcal(exo, { minutes: 60 });   // 体重データなし
  return { before };
})()`, context);
ok('SPEC-024: 体重未同期なら消費kcalは出さない', exoKcal.before === null, JSON.stringify(exoKcal));

// ★ プロンプトに健康データが混ざらない（SPEC-024 受け入れ基準・交渉不可）
const exoPrompt = vm.runInContext(`(() => {
  // 体重・体組成の控えを入れた状態でプロンプトを作っても、本文に数値が出ないこと
  localStorage.setItem('hs:body-server-cache:v1', JSON.stringify({
    fetchedAt: '2026-07-21T00:00:00Z',
    rows: [{ measured_on: '2026-07-20', weight_kg: 68.4, body_fat_pct: 17.5, bmr: 1560 }]
  }));
  const p = buildExerciseAiPrompt('屋外のハーフコートでバスケ3対3');
  localStorage.removeItem('hs:body-server-cache:v1');
  return { p, leaks: ['68.4', '17.5', '1560', '体重', '体脂肪', '基礎代謝'].filter((s) => p.includes(s)) };
})()`, context);
ok('SPEC-024: プロンプトに健康データが入らない',
  exoPrompt.leaks.length === 0 && exoPrompt.p.includes('バスケ3対3'),
  `leaks=${JSON.stringify(exoPrompt.leaks)}`);

// マージ: 組み込み8種は不変のまま、AI登録分が末尾に足される
const exoMerge = vm.runInContext(`(() => {
  const extra = applyExerciseTypes([{ client_key: 'basketball-3on3', name: 'バスケ(3on3)',
    short: 'バスケ', kanji: '球', kind: 'sport', fields: ['minutes'], mets: 6,
    load_params: { default_minutes: 60 } }]);
  const builtinIntact = BUILTIN_EXERCISES.every((b, i) => EXERCISES[i] && EXERCISES[i].id === b.id);
  const added = EXERCISES[EXERCISES.length - 1];
  const kcal = estimateWorkoutKcal(added, { minutes: 60 });
  applyExerciseTypes([]);   // 後続テストに影響させない
  return { n: extra.length, builtinIntact, id: added.id, def: added.defaults.minutes, kcal,
    restored: EXERCISES.length === BUILTIN_EXERCISES.length };
})()`, context);
ok('SPEC-024: 組み込み8種を壊さずAI登録分を統合',
  exoMerge.builtinIntact && exoMerge.n === 1 && exoMerge.id === 'exo:basketball-3on3'
    && exoMerge.def === 60 && exoMerge.restored, JSON.stringify(exoMerge));

// 画面描画: 種目一覧の末尾に「＋運動を追加」が出る / AI登録種目がチップとして並ぶ
const exoRender = vm.runInContext(`(() => {
  applyExerciseTypes([{ client_key: 'basketball-3on3', name: 'バスケ(3on3)', short: 'バスケ',
    kanji: '球', kind: 'sport', fields: ['minutes'], mets: 6, load_params: { default_minutes: 60 } }]);
  renderExoGrid();
  const html = document.querySelector('#exoGrid').innerHTML;
  applyExerciseTypes([]);
  renderExoGrid();
  const htmlAfter = document.querySelector('#exoGrid').innerHTML;
  return {
    hasAdd: html.includes('data-exo-add'),
    hasCustom: html.includes('data-exo="exo:basketball-3on3"') && html.includes('球'),
    builtinCount: (html.match(/data-exo="/g) || []).length,        // 組み込み8 + カスタム1
    addStillThere: htmlAfter.includes('data-exo-add')
  };
})()`, context);
ok('SPEC-024: 種目一覧に「＋運動を追加」とAI登録種目が出る',
  exoRender.hasAdd && exoRender.hasCustom && exoRender.builtinCount === 9 && exoRender.addStillThere,
  JSON.stringify(exoRender));

// 保存レコード: AI登録種目は exercise_key と est_kcal を持ち、組み込み種目は null のまま（既存互換）
const exoRecord = vm.runInContext(`(() => {
  lsSet(LS_KEYS.BODY_RECORDS, [{ date: '2026-07-20', weight: 68.4 }]);
  applyExerciseTypes([{ client_key: 'basketball-3on3', name: 'バスケ(3on3)', short: 'バスケ',
    kanji: '球', kind: 'sport', fields: ['minutes'], mets: 6, load_params: { default_minutes: 60 } }]);
  state.exoId = 'exo:basketball-3on3';
  state.exoValues = { minutes: 60 };
  const custom = buildWorkoutRecord();
  const customRow = sbWorkoutRow(custom);
  state.exoId = 'shoulder';
  state.exoValues = { weight: 30, reps: 10, sets: 3 };
  const builtin = buildWorkoutRecord();
  const builtinRow = sbWorkoutRow(builtin);
  applyExerciseTypes([]);
  return { key: customRow.exercise_key, kcal: customRow.est_kcal,
    bKey: builtinRow.exercise_key, bKcal: builtinRow.est_kcal };
})()`, context);
// 6 METs × 68.4kg × 1h × 1.05 = 430.9 → 431
ok('SPEC-024: AI種目は exercise_key と est_kcal を送る / 組み込みは従来どおり null',
  exoRecord.key === 'basketball-3on3' && exoRecord.kcal === 431
    && exoRecord.bKey === null && exoRecord.bKcal === null, JSON.stringify(exoRecord));

// ---- 見やすさ改修（2026-07-24 ホーム4ゾーン化）: 描画が例外なく動く + タイル状態 ----
const homeSmoke = vm.runInContext(`(() => {
  try { renderHome(); return { ok: true }; }
  catch (e) { return { ok: false, err: String(e && e.message || e) }; }
})()`, context);
ok('見やすさ改修: renderHome が例外なく動く', homeSmoke.ok, homeSmoke.err || '');

const tileTest = vm.runInContext(`(() => {
  renderTodayTiles({ energy: 1300 });
  const meal = document.querySelector('#tileMeal');
  const doneWhenEaten = meal.classList.contains('done');
  renderTodayTiles({ energy: 0 });
  const undoneWhenEmpty = !meal.classList.contains('done');
  return { doneWhenEaten, undoneWhenEmpty };
})()`, context);
ok('見やすさ改修: 食事タイルが摂取有無で済み/未を切替',
  tileTest.doneWhenEaten && tileTest.undoneWhenEmpty, JSON.stringify(tileTest));

// ---- 見やすさ改修 第2弾（栄養タブ）: 描画が落ちず、要点が #ntPriorities に出る ----
const ntSmoke = vm.runInContext(`(() => {
  try {
    renderNutrition();
    const pri = document.querySelector('#ntPriorities').innerHTML || '';
    const judge = document.querySelector('#ntJudge').innerHTML || '';
    return { ok: true, hasPri: pri.length > 0, judgeNoUl: !judge.includes('nt-pri') };
  } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
})()`, context);
ok('見やすさ改修2: renderNutrition が例外なく動く', ntSmoke.ok, ntSmoke.err || '');
ok('見やすさ改修2: 要点が #ntPriorities に出る / スコアカードから要点ulを分離',
  ntSmoke.hasPri && ntSmoke.judgeNoUl, JSON.stringify(ntSmoke));

// ---- 過去日の記録（実機指摘 2026-07-24）: 日付を戻しても各タイル・保存先が追従する ----
const pastDate = vm.runInContext(`(() => {
  const past = shiftDate(todayStr(), -6);
  // 過去日に「からだ」と「運動」の記録がある状態を作る
  lsSet(LS_KEYS.BODY_RECORDS, [{ date: past, weight: 70.2, fat: 17.4 }]);
  lsSet(LS_KEYS.WT_HISTORY, [{ '日付': past, '種目': 'バスケットボール(3on3)', '時間': 60, _ts: 1 }]);
  state.workoutDrafts = [];
  state.date = past;
  renderHome();
  const bannerShown = document.querySelector('#pastBanner').style.display !== 'none';
  const bannerDate = document.querySelector('#pastBannerDate').textContent;
  const bodyDone = document.querySelector('#tileBody').classList.contains('done');
  // 過去日を離れると「済み」が外れる（= 日付追従の裏返し）ことも確認する。
  // ※ .st の文字は DOM スタブが子要素を毎回新規生成するため検証対象にしない
  state.date = shiftDate(todayStr(), -5);
  renderHome();
  const bodyUndoneOtherDay = !document.querySelector('#tileBody').classList.contains('done');
  state.date = past;
  renderHome();
  const wkDone = document.querySelector('#tileWorkout').classList.contains('done');
  // 保存先が過去日になる（＝先週末のバスケが正しくその日に入る）
  applyExerciseTypes([{ client_key: 'basketball-3on3', name: 'バスケットボール(3on3)', short: 'バスケ',
    kanji: '球', kind: 'sport', fields: ['minutes'], mets: 6, load_params: { default_minutes: 60 } }]);
  state.exoId = 'exo:basketball-3on3';
  state.exoValues = { minutes: 60 };
  const savedDate = buildWorkoutRecord()['日付'];
  // 運動画面の「記録する日」行が過去日表示になる
  renderWorkoutToday();
  const rowPast = document.querySelector('#workoutDateRow').classList.contains('is-past');
  // 後片付け（後続テスト・実行間の汚染防止）
  applyExerciseTypes([]);
  lsSet(LS_KEYS.BODY_RECORDS, []); lsSet(LS_KEYS.WT_HISTORY, []);
  state.date = todayStr();
  renderHome();
  const bannerHiddenToday = document.querySelector('#pastBanner').style.display === 'none';
  return { bannerShown, bannerDate, bodyDone, bodyUndoneOtherDay, wkDone, savedDate, past, rowPast, bannerHiddenToday };
})()`, context);
ok('過去日: バナーが出て日付が入る / 今日に戻すと消える',
  pastDate.bannerShown && pastDate.bannerDate.length > 0 && pastDate.bannerHiddenToday,
  JSON.stringify(pastDate));
ok('過去日: からだタイルが見ている日の記録に追従（[fix] 旧実装は過去日で常に未記録）',
  pastDate.bodyDone && pastDate.bodyUndoneOtherDay, JSON.stringify(pastDate));
ok('過去日: 運動タイルがその日の記録を拾う', pastDate.wkDone, JSON.stringify(pastDate));
ok('過去日: 保存先の日付が見ている日になる（先週末のバスケが正しく入る）',
  pastDate.savedDate === pastDate.past, JSON.stringify(pastDate));
ok('過去日: 運動画面の「記録する日」が過去日表示になる', pastDate.rowPast, JSON.stringify(pastDate));

// ---- シートの出口（実機指摘 2026-07-24「この画面から戻れない」）----
// closeAllSheets が id ハードコードだったため新設シートが閉じ残っていた回帰を防ぐ。
// ※ DOM スタブは querySelectorAll('.modal-back') を返さないため、HTML と実装の突合で検証する
const fsMod = require('fs');
const appHtml = fsMod.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const modalIds = [...appHtml.matchAll(/class="modal-back" id="([A-Za-z]+)"/g)].map((m) => m[1]);
const closeAllSrc = (appHtml.match(/function closeAllSheets\(\)[\s\S]*?\n\}/) || [''])[0];
ok('シートの出口: closeAllSheets が全 .modal-back を対象にしている（id列挙にしない）',
  /querySelectorAll\('\.modal-back'\)/.test(closeAllSrc) && /KEEP_OPEN/.test(closeAllSrc),
  closeAllSrc.slice(0, 120));
ok('シートの出口: ログインシートだけは閉じない（未ログインの必須ゲート）',
  /KEEP_OPEN\s*=\s*\['loginBack'\]/.test(closeAllSrc), '');
ok('シートの出口: 新設シート exoAddBack が .modal-back として存在する',
  modalIds.includes('exoAddBack'), modalIds.join(','));
// × が sticky（絶対配置のままだと長いシートでスクロール時に画面外へ消える）
const sheetXCss = (appHtml.match(/\.sheet-x \{[\s\S]*?\}/) || [''])[0];
ok('シートの出口: ×ボタンが sticky で常時表示', /position:\s*sticky/.test(sheetXCss), sheetXCss.slice(0, 90));
// 背景タップでも閉じられる（出口を複数持たせる）
ok('シートの出口: 背景タップで閉じるハンドラが全シートに付く',
  /back\.addEventListener\('click',\s*\(e\)\s*=>\s*\{\s*if\s*\(e\.target === back\)\s*trySheetClose/.test(appHtml), '');

// ---- 横展開（2026-07-31）: 日付まわりが全画面で state.date 基準になっているか ----
const spread = vm.runInContext(`(() => {
  const past = shiftDate(todayStr(), -6);
  // 過去日に昼の記録がある状態を作る（「編集」項目が出る条件）
  const recs = [{ date: past, timing: '昼', timingKey: 'lunch', kcal: 700,
    items: [{ name: 'テスト', kcal: 700 }], structuredItems: [], updatedAt: '2026-07-25T12:00:00Z' }];
  saveRecords(recs);   // getRecords はキャッシュするため専用セッター経由で入れる
  state.date = past;
  const past_ = mealShortcuts('lunch');
  state.date = todayStr();
  const today_ = mealShortcuts('lunch');
  saveRecords([]);
  return {
    pastHasEdit: past_.some((i) => i.key === 'edit'),   // 過去日の記録を編集として認識
    todayNoEdit: !today_.some((i) => i.key === 'edit')  // 今日は未記録なので編集は出ない
  };
})()`, context);
ok('横展開: 食事の長押しメニューが「見ている日」を対象にする（旧: 常に今日）',
  spread.pastHasEdit && spread.todayNoEdit, JSON.stringify(spread));

// 3つの記録画面すべてに「記録する日」行があり、共通関数で更新される
const dateRows = vm.runInContext(`(() => {
  state.date = shiftDate(todayStr(), -6);
  renderRecordDateRows();
  const past = ['#mealDateRow', '#workoutDateRow', '#bodyDateRow']
    .every((s) => document.querySelector(s).classList.contains('is-past'));
  state.date = todayStr();
  renderRecordDateRows();
  const today = ['#mealDateRow', '#workoutDateRow', '#bodyDateRow']
    .every((s) => !document.querySelector(s).classList.contains('is-past'));
  return { past, today };
})()`, context);
ok('横展開: 食事・運動・からだの「記録する日」が3画面とも過去日で強調される',
  dateRows.past && dateRows.today, JSON.stringify(dateRows));

const spreadHtml = fsMod.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
ok('横展開: 3つの記録画面に rec-date-row がある',
  ['mealDateRow', 'workoutDateRow', 'bodyDateRow'].every((id) => spreadHtml.includes(`id="${id}"`)), '');
ok('横展開: カレンダーがラベル専用 wrapper 内にある（隣の矢印を覆わない）',
  /<span class="date-label-wrap">[\s\S]*?id="datePicker"[\s\S]*?<\/span>/.test(spreadHtml), '');
ok('横展開: 運動追加シートに未保存確認がある',
  /exoAddBack:\s*\(\)\s*=>/.test(spreadHtml), '');

// ---- AI登録運動が分析タブで正しく扱われるか（2026-07-31 横展開で発見）----
const analysisFix = vm.runInContext(`(() => {
  applyExerciseTypes([
    { client_key: 'basketball-3on3', name: 'バスケットボール(3on3)', short: 'バスケ', kanji: '球',
      kind: 'sport', fields: ['minutes'], mets: 6, load_params: { default_minutes: 60 } },
    { client_key: 'home-curl', name: 'ダンベルカール', short: 'カール', kanji: '腕',
      kind: 'strength', fields: ['weight','reps','sets'], mets: 3.5, load_params: {} }
  ]);
  const sport = wtMetricFor('バスケットボール(3on3)');
  const strength = wtMetricFor('ダンベルカール');
  const builtin = wtMetricFor('ショルダープレス');
  const sportVol = sport.vol({ minutes: 60 });
  applyExerciseTypes([]);
  return { sportKey: sport.key, sportVol, strengthKey: strength.key, builtinKey: builtin.key };
})()`, context);
ok('AI運動: スポーツは「時間」を主指標にする（旧: 常に0回のグラフ）',
  analysisFix.sportKey === 'minutes' && analysisFix.sportVol === 60, JSON.stringify(analysisFix));
ok('AI運動: 筋力系は従来どおり重量・組み込み種目も不変',
  analysisFix.strengthKey === 'weight' && analysisFix.builtinKey === 'weight', JSON.stringify(analysisFix));

// AI登録の筋トレが「筋トレ日」に数えられる（旧: 組み込み6種の固定リストのみ）
const strengthCount = vm.runInContext(`(() => {
  applyExerciseTypes([
    { client_key: 'home-curl', name: 'ダンベルカール', short: 'カール', kanji: '腕',
      kind: 'strength', fields: ['weight','reps','sets'], mets: 3.5, load_params: {} },
    { client_key: 'basketball-3on3', name: 'バスケットボール(3on3)', short: 'バスケ', kanji: '球',
      kind: 'sport', fields: ['minutes'], mets: 6, load_params: {} }
  ]);
  const r = {
    aiStrength: isStrengthExercise('ダンベルカール'),      // 数えたい
    aiSport: isStrengthExercise('バスケットボール(3on3)'), // 筋トレではない
    builtin: isStrengthExercise('レッグプレス'),           // 従来どおり
    treadmill: isStrengthExercise('トレッドミル')          // 従来どおり除外
  };
  applyExerciseTypes([]);
  return r;
})()`, context);
ok('AI運動: 家トレ等の筋トレが「筋トレ日」に数えられる（スポーツ・有酸素は除外）',
  strengthCount.aiStrength && !strengthCount.aiSport && strengthCount.builtin && !strengthCount.treadmill,
  JSON.stringify(strengthCount));

console.log(failed ? `\n判定: FAIL（${failed}件）` : '\n判定: PASS（食品ドメイン回帰 全項目合格）');
process.exit(failed ? 1 : 0);
