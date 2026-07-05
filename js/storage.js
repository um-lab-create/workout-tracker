// storage.js — localStorage キー管理・読み書きラッパー
// 全ページ共通。キーの一元管理で修正漏れを防ぐ。

'use strict';

// ----------------------------------------------------------------
// キー定数（SCREAMING_SNAKE_CASE）
// 各 HTML でハードコードしていたキーをここに集約する。
// ----------------------------------------------------------------
const LS_KEYS = {
  // meal.html 関連
  // [2026-05-29 fix] 実際に各ページで使用中のキーへ修正（旧ハイフン値は未参照の地雷。LS_KEYS統一時のデータ消失を防止）
  MEAL_RECORDS:     'meal_recs_v3',           // 食事記録（ローカル）
  MEAL_PRESET:      'meal_presets_v3',        // タイミング別プリセット
  MEAL_CUSTOM_FOODS:'meal_custom_foods_v1',   // 独自食材
  MEAL_PRODUCTS:    'meal_products_v1',        // 商品 DB
  MEAL_RECIPES:     'meal_recipes_v1',         // 自作メニュー
  MEAL_DRAFT:       'meal_draft_v4',           // 下書き（date:timing→items）
  MEAL_HABITS:      'meal_habits_v1',          // 習慣判定キャッシュ
  FOOD_USAGE:       'hs:food-usage:v1',         // app.html 食品使用実績（派生データ）
  HYDRATION_RECORDS:'hydration_recs_v1',       // 水分摂取ログ（日付→ml）

  // day.html 関連
  DAY_SERVER_RECORDS: 'meal_server_records_v1',  // サーバーから同期した明細
  NUTRITION_TARGETS:  'nutrition_targets_v1',    // 目標値
  DAY_DRAFT:          'meal_draft_v4',            // day.html も同じドラフトを参照
  DAY_RECORD_CACHE:   'meal_recs_v3',             // day.html も同じレコードを参照

  // workout.html 関連（wt: プレフィクス）
  WT_LAST:          'wt:lastValues:v2',
  WT_QUEUE:         'wt:queue:v2',
  WT_HISTORY:       'wt:history:v2',
  WT_SELECTED:      'wt:selectedExercise:v2',
  WT_SELECTED_DATE: 'wt:selectedDate:v1',

  // 認証（全ページ共通）
  WRITE_AUTH:    'hs:write-auth:v1',   // { pin, savedAt }
  READ_AUTH:     'hs:read-auth:v1',    // { pin, savedAt }
  PENDING_QUEUE: 'hs:pending-queue',   // オフライン送信キュー
  LAST_SYNC:     'hs:last-sync:v1',     // app.html の最終サーバー同期時刻
};

// ----------------------------------------------------------------
// 汎用 read / write（JSON 自動変換）
// ----------------------------------------------------------------

/**
 * localStorage から値を取得し JSON.parse して返す。
 * パースできない・存在しない場合は defaultValue を返す。
 * @param {string} key
 * @param {*} defaultValue
 */
function lsGet(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * 値を JSON.stringify して localStorage に保存する。
 * @param {string} key
 * @param {*} value
 */
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[storage] lsSet 失敗:', key, err);
  }
}

/**
 * localStorage から指定キーを削除する。
 * @param {string} key
 */
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // no-op
  }
}

// ----------------------------------------------------------------
// 後方互換エイリアス（既存 HTML の storageGet / storageSet 呼び出しを維持するため）
// 新規コードでは lsGet / lsSet を使うこと。
// ----------------------------------------------------------------

/** @deprecated lsGet を使ってください */
function storageGet(key, fallback) { return lsGet(key, fallback); }

/** @deprecated lsSet を使ってください */
function storageSet(key, value) { lsSet(key, value); }

// ----------------------------------------------------------------
// Service Worker 登録（全ページ共通・2026-05-29 cowork）
// オフライン/電波弱でもアプリシェル+CDNが動くように。相対パスでGitHub Pagesのサブパスにも対応。
// ----------------------------------------------------------------
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('[sw] 登録失敗:', err);
    });
  });
}
