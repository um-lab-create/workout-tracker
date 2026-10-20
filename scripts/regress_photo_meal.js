'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/photo-meal.js'), 'utf8'), sandbox);
const api = sandbox.window.HSPhotoMeal;
const row = { name: 'キーマカレー', portion: '1皿', kcal: 600, protein_g: 30, fat_g: 20, carb_g: 75, assumptions: '油の量は不明' };
const json = (item = row) => JSON.stringify({ version: 1, items: [item] });
test('料理の全量とPFCを取り込み、量と仮定を保持', () => {
  const result = api.parse(json())[0];
  assert.equal(result.kcal, 600); assert.equal(result.p, 30);
  assert.equal(result.portion, '1皿'); assert.equal(result.assumptions, '油の量は不明');
});
test('コードフェンス付き回答を受け入れる', () => assert.equal(api.parse('```json\n' + json() + '\n```').length, 1));
test('JSON以外・壊れたJSON・スキーマ違いを拒否', () => {
  for (const text of ['', '料理です', '{', '[]', '{"version":2,"items":[]}', '{"version":1,"items":[]}']) assert.throws(() => api.parse(text));
});
test('過剰な件数と長い回答を拒否', () => {
  assert.throws(() => api.parse(JSON.stringify({version:1,items:Array(31).fill(row)})));
  assert.throws(() => api.parse('x'.repeat(60001)));
});
test('未取得・空・負値・文字列・真偽値を栄養ゼロにすり替えない', () => {
  for (const key of ['kcal','protein_g','fat_g','carb_g']) {
    for (const value of [null, undefined, '', '30', true, -1, 999999]) assert.throws(() => api.parse(json({...row,[key]:value})));
  }
});
test('名前・量の欠落やURL・座標の流入を拒否', () => {
  for (const field of ['name','portion']) for (const value of ['',null, 'https://example.com', '35.1234,139.5678']) {
    assert.throws(() => api.parse(json({...row,[field]:value})));
  }
  assert.throws(() => api.parse(json({...row,assumptions:'www.example.com'})));
});
test('未知の栄養素・店名・任意フィールドは取り込まない', () => {
  const result=api.parse(json({...row,restaurant:'店名',micros:{vitC:100},source:'https://example.com'}))[0];
  assert.equal(result.restaurant,undefined);assert.equal(result.micros,undefined);assert.equal(result.source,undefined);
});
test('半分食べた量を栄養とスナップショットに反映・常に未検証の推定', () => {
  const item=api.toItem(api.parse(json())[0],0.5,'photo:qa');
  assert.equal(item.kcal,300);assert.equal(item.p,15);assert.equal(item.f,10);assert.equal(item.c,37.5);
  assert.equal(item.nutrients.energy,300);assert.equal(item.pendingReview,true);assert.equal(item.verified,false);
  assert.equal(item.coverage,'macro-only');assert.equal(item.grams,null);
});
test('写真量の倍率の異常値を拒否', () => {
  for(const ratio of [0,-1,0.001,NaN,Infinity,5.1]) assert.throws(()=>api.toItem(api.parse(json())[0],ratio,'photo:qa'));
});
test('プロンプトは写真の全量と不確実性を指定、個人の健康データを含めない', () => {
  const prompt=api.prompt();assert.ok(prompt.includes('100gあたりではない'));assert.ok(prompt.includes('人物・場所・店名'));
  assert.ok(!prompt.includes('supabase'));assert.ok(!prompt.includes('体重'));
});
