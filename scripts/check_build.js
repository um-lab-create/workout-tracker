#!/usr/bin/env node
/*
 * check_build.js — フロントの結合シンタックスチェック（回帰防止）
 * 2026-05-27 Cowork 作成。
 *
 * 目的: 各 HTML が読み込む js/ モジュールと inline <script> を「ブラウザと同じ順序」で
 *       連結し、まとめて構文コンパイルする。これにより、モジュールと inline で
 *       同名 const を二重宣言する等のクロスファイル SyntaxError を検出する。
 *       （各ファイル単体の node --check では見抜けないクラスのバグ。実際に
 *        2026-05-27 に GAS_URL 二重宣言で day/meal が起動不能になった。）
 *
 * 使い方: node scripts/check_build.js   （CIや push 前に実行。終了コード 0=OK / 1=NG）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// 旧4ページ（workout/meal/day/body.html）は SPEC-012 Step6.5 で退役・削除済み
const PAGES = ['index.html', 'health-import.html', 'app.html'];

let failed = 0;
for (const page of PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) { console.log(`SKIP ${page} (not found)`); continue; }
  const html = fs.readFileSync(file, 'utf8');

  // ローカル js/ モジュール（読み込み順を保持）
  const moduleSrcs = [...html.matchAll(/<script\s+src="(js\/[^"]+)"\s*><\/script>/g)].map(m => m[1]);
  // src 無しの inline <script>
  const inlineBlocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

  const parts = [];
  for (const src of moduleSrcs) {
    const p = path.join(ROOT, src);
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf8'));
    else { console.error(`FAIL ${page}: モジュールが見つかりません ${src}`); failed++; }
  }
  parts.push(...inlineBlocks);
  const combined = parts.join('\n;\n');

  try {
    new vm.Script(combined, { filename: page });
    console.log(`OK   ${page}  (modules: ${moduleSrcs.join(', ') || 'none'}, inline: ${inlineBlocks.length})`);
  } catch (err) {
    console.error(`FAIL ${page}: ${err.message}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n❌ ${failed} ページで結合構文エラー。push 前に修正してください。`);
  process.exit(1);
}
console.log('\n✅ 全ページ結合構文OK');
