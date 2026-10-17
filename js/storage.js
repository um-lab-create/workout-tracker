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
  FOOD_USAGE:       'hs:food-usage:v1',         // app.html 食品使用実績（派生データ）
  HYDRATION_RECORDS:'hydration_recs_v1',       // 水分摂取ログ（日付→ml）
  BODY_RECORDS:     'body_recs_v1',             // からだ手入力（一次ストア。監査#22で台帳化）
  WT_DRAFTS:        'wt:draftQueue:v1',         // 筋トレ送信前下書き（同上）

  // サーバー同期
  DAY_SERVER_RECORDS: 'meal_server_records_v1',  // サーバーから同期した明細
  NUTRITION_TARGETS:  'nutrition_targets_v1',    // 目標値
  // （旧 day.html エイリアス DAY_DRAFT/DAY_RECORD_CACHE と未参照の MEAL_HABITS/WT_SELECTED_DATE は
  //   2026-07-19 監査#35で削除。値そのものは MEAL_DRAFT/MEAL_RECORDS として存続）

  // 筋トレ関連（wt: プレフィクス）
  WT_LAST:          'wt:lastValues:v2',
  WT_HISTORY:       'wt:history:v2',
  WT_SELECTED:      'wt:selectedExercise:v2',
  // AI登録した運動種目マスタのローカル控え（SPEC-024）。サーバーが正・これはオフライン表示用
  WT_EXO_TYPES:     'hs:exercise-types:v1',

  // 同期
  LAST_SYNC:     'hs:last-sync:v1',     // app.html の最終サーバー同期時刻
  // 旧GAS時代のキー（hs:write-auth:v1 / hs:read-auth:v1 / hs:pending-queue / wt:queue:v2）は
  // 2026-07-10 のGAS退役で廃止。app.html が起動時に localStorage から掃除する。
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

function _storageSaveError(cause, code = 'STORAGE_WRITE_FAILED') {
  const quota = cause && (cause.name === 'QuotaExceededError' ||
    cause.name === 'NS_ERROR_DOM_QUOTA_REACHED' || cause.code === 22 || cause.code === 1014);
  if (code === 'STORAGE_WRITE_FAILED' && quota) code = 'STORAGE_QUOTA_EXCEEDED';
  const messages = {
    STORAGE_QUOTA_EXCEEDED: '端末の保存容量が不足しているため保存できませんでした。入力を残したまま空き容量を確認し、再試行してください。',
    STORAGE_WRITE_FAILED: '端末に保存できませんでした。入力を残したまま、ブラウザの保存設定と空き容量を確認して再試行してください。',
    STORAGE_SERIALIZE_FAILED: '保存するデータを変換できませんでした。入力を残したまま、内容を確認してください。',
    STORAGE_READ_FAILED: '端末の保存済みデータを確認できないため保存を中止しました。ブラウザの保存設定を確認してください。',
    STORAGE_ROLLBACK_FAILED: '保存に失敗し、保存前の状態に完全には戻せませんでした。入力を残したまま、保存済みデータを確認してください。'
  };
  const error = new Error(messages[code]);
  error.code = code;
  error.cause = cause;
  return error;
}

function _storageStringify(value) {
  try {
    const raw = JSON.stringify(value);
    // [fix] undefined/functions/symbols must not overwrite old data with "undefined".
    if (raw === undefined) throw new TypeError('Value has no JSON representation');
    return raw;
  } catch (cause) {
    throw _storageSaveError(cause, 'STORAGE_SERIALIZE_FAILED');
  }
}

/**
 * Required save: throws a user-facing Error (code/cause) on failure.
 * Keep lsSet for disposable caches; update UI/in-memory state only after this returns.
 * @returns {boolean} true only after setItem succeeds
 */
function lsSetRequired(key, value) {
  const raw = _storageStringify(value);
  try {
    localStorage.setItem(key, raw);
  } catch (cause) {
    throw _storageSaveError(cause);
  }
  return true;
}

/**
 * Required multi-key save: lsSetManyRequired([[key, value], ...]).
 * Serializes and snapshots every key before writing; restores exact old strings on failure.
 * NOT a localStorage transaction: other tabs can observe partial writes, and a crash or
 * rollback failure can leave partial data. No cross-tab isolation or crash recovery.
 * Rollback failures are exposed as error.rollbackErrors; never claim success in that case.
 * @param {Array<[string, *]>} entries Unique string keys, in write order.
 * @returns {boolean} true only after every setItem succeeds
 */
function lsSetManyRequired(entries) {
  if (!Array.isArray(entries)) throw new TypeError('Expected an array of [key, value] pairs');
  const keys = new Set();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || keys.has(entry[0])) {
      throw new TypeError('Expected [key, value] pairs with unique string keys');
    }
    keys.add(entry[0]);
  }
  const pending = entries.map(([key, value]) => ({ key, raw: _storageStringify(value) }));
  let storage;
  try {
    storage = localStorage;
    for (const entry of pending) entry.oldRaw = storage.getItem(entry.key);
  } catch (cause) {
    throw _storageSaveError(cause, 'STORAGE_READ_FAILED');
  }
  const written = [];
  try {
    for (const entry of pending) {
      storage.setItem(entry.key, entry.raw);
      written.push(entry);
    }
  } catch (cause) {
    const rollbackErrors = [];
    // Failed setItem leaves its own key unchanged under the Web Storage contract.
    for (const entry of written.reverse()) {
      try {
        if (entry.oldRaw === null) storage.removeItem(entry.key);
        else storage.setItem(entry.key, entry.oldRaw);
      } catch (error) {
        rollbackErrors.push({ key: entry.key, error });
      }
    }
    const error = _storageSaveError(cause, rollbackErrors.length ? 'STORAGE_ROLLBACK_FAILED' : undefined);
    error.rollbackErrors = rollbackErrors;
    throw error;
  }
  return true;
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
// 新規コードでは lsGet / lsSet を使うこと。
// ----------------------------------------------------------------

/** @deprecated lsGet を使ってください */
