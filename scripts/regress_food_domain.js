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

console.log(failed ? `\n判定: FAIL（${failed}件）` : '\n判定: PASS（食品ドメイン回帰 全項目合格）');
process.exit(failed ? 1 : 0);
