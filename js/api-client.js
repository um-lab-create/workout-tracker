// api-client.js — Apps Script Webhook 通信・認証・オフラインキュー
// storage.js より後に読み込むこと（LS_KEYS グローバルを参照）。

'use strict';

// ----------------------------------------------------------------
// 定数
// ----------------------------------------------------------------

/** Apps Script Web App エンドポイント（全ページ共通・本番デプロイ @8） */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxvR0eEzHRsJMn-z9reSVx__4GJsuiFLfSemHrUV6ByMlPN-fYDawpIUN52DWfQI0pS/exec';

// ----------------------------------------------------------------
// 内部ヘルパー
// ----------------------------------------------------------------

/**
 * 暗号論的疑似乱数を 24 桁 hex 文字列で返す。
 */
function makeAuthNonce() {
  const buffer = new Uint8Array(12);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(buffer);
    return Array.from(buffer, b => b.toString(16).padStart(2, '0')).join('');
  }
  // [fix] crypto 非対応環境のフォールバック（実用上ほぼ起きない）
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 14)}`;
}

// ----------------------------------------------------------------
// 公開: PIN 読み取り
// ----------------------------------------------------------------

/**
 * WRITE_PIN を localStorage から読み取る。
 * @returns {string} 保存済み PIN、未設定なら空文字
 */
function loadWritePin() {
  try {
    const raw = localStorage.getItem(LS_KEYS.WRITE_AUTH);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.pin === 'string' ? parsed.pin : '';
  } catch {
    return '';
  }
}

/**
 * READ_PIN を localStorage から読み取る。
 * @returns {string} 保存済み PIN、未設定なら空文字
 */
function loadReadPin() {
  try {
    const raw = localStorage.getItem(LS_KEYS.READ_AUTH);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.pin === 'string' ? parsed.pin : '';
  } catch {
    return '';
  }
}

// ----------------------------------------------------------------
// 公開: PIN 保存
// ----------------------------------------------------------------

/**
 * WRITE_PIN を localStorage に保存する。
 * @param {string} pin
 */
function saveWritePin(pin) {
  const trimmed = String(pin || '').trim();
  if (!trimmed) throw Object.assign(new Error('PIN required'), { code: 'AUTH_REQUIRED' });
  localStorage.setItem(LS_KEYS.WRITE_AUTH, JSON.stringify({ pin: trimmed, savedAt: Date.now() }));
}

/**
 * READ_PIN を localStorage に保存する。
 * @param {string} pin
 */
function saveReadPin(pin) {
  const trimmed = String(pin || '').trim();
  localStorage.setItem(LS_KEYS.READ_AUTH, JSON.stringify({ pin: trimmed, savedAt: Date.now() }));
}

// ----------------------------------------------------------------
// 公開: PIN プロンプト
// ----------------------------------------------------------------

/**
 * WRITE_PIN を要求するプロンプトを出す。
 * force=false で既存 PIN があればスキップ。
 * @param {boolean} [force=false]
 * @returns {string} PIN 文字列
 */
function promptWritePin(force = false) {
  const existing = loadWritePin();
  if (existing && !force) return existing;
  const entered = window.prompt('利用PINを入力してください。初回だけ端末に保存されます。', existing);
  const trimmed = String(entered || '').trim();
  if (!trimmed) {
    const err = new Error('PIN が未入力です');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  saveWritePin(trimmed);
  return trimmed;
}

/**
 * READ_PIN を要求するプロンプトを出す。
 * @param {boolean} [force=false]
 * @returns {string} PIN 文字列（キャンセル時は空文字）
 */
function promptReadPin(force = false) {
  const existing = loadReadPin();
  if (existing && !force) return existing;
  const entered = window.prompt('READ_PIN を入力してください', existing || '');
  const trimmed = String(entered || '').trim();
  if (!trimmed) return '';
  saveReadPin(trimmed);
  return trimmed;
}

// ----------------------------------------------------------------
// 公開: WRITE_PIN 認証付き no-cors POST
// ----------------------------------------------------------------

/**
 * payload に認証フィールドを付与して返す。
 * options.allowPrompt === false のとき、PIN 未設定でもプロンプトを出さない。
 * @param {object} payload  {sheet: '...', ...data}
 * @param {{ allowPrompt?: boolean }} [options={}]
 * @returns {object} 認証フィールド付き payload
 */
function buildAuthedPayload(payload, options = {}) {
  const pin = loadWritePin() || (options.allowPrompt === false ? '' : promptWritePin());
  if (!pin) {
    const err = new Error('PIN が未設定です');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  return {
    ...payload,
    authPin:   pin,
    authTs:    Date.now(),
    authNonce: makeAuthNonce()
  };
}

/**
 * Apps Script に no-cors POST する（WRITE_PIN 認証付き）。
 * 成否はフロント側で判別不可（mode: 'no-cors' のため）。
 * ネットワーク切断時はオフラインキューに積む。
 * @param {object} payload  {sheet: '...', ...data}
 * @returns {Promise<void>}
 */
async function postToSheet(payload) {
  const authed = buildAuthedPayload(payload);
  if (!navigator.onLine) {
    _enqueueOffline(authed);
    return;
  }
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authed)
    });
  } catch (err) {
    // ネットワーク切断などのフェッチ失敗 → オフラインキューに積む
    _enqueueOffline(authed);
    throw err;
  }
}

// ----------------------------------------------------------------
// 公開: READ_PIN 認証付き読み取り
// ----------------------------------------------------------------

/**
 * Apps Script に JSON レスポンスを期待して POST する（通常 fetch）。
 * @param {object} payload
 * @returns {Promise<object>} JSON レスポンス
 */
async function postJsonReadable(payload) {
  const response = await fetch(GAS_URL, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('サーバー応答をJSONとして読めませんでした');
  }
}

/**
 * READ_PIN 認証付きでサーバーからデータを読み取る。
 * @param {string} read         'meal_details' | 'settings' など
 * @param {object} [params={}]  {from, to} など action 依存
 * @param {boolean} [forcePrompt=false]  true で強制再入力
 * @returns {Promise<object>} {status: 'ok', ...data}
 */
async function readFromSheet(read, params = {}, forcePrompt = false) {
  const readPin = promptReadPin(forcePrompt);
  if (!readPin) throw new Error('READ_PIN が未入力です');
  const data = await postJsonReadable({ read, readPin, authTs: Date.now(), ...params });
  if (!data || data.status !== 'ok') {
    throw new Error(data && data.message ? data.message : 'サーバー読取に失敗しました');
  }
  return data;
}

// ----------------------------------------------------------------
// 内部: オフラインキュー
// ----------------------------------------------------------------

function _enqueueOffline(authedPayload) {
  const queue = lsGet(LS_KEYS.PENDING_QUEUE, []);
  queue.push({ payload: authedPayload, queuedAt: Date.now() });
  lsSet(LS_KEYS.PENDING_QUEUE, queue);
}

// ----------------------------------------------------------------
// 公開: オフラインキュー再送
// ----------------------------------------------------------------

/**
 * ネットワーク復帰時などに呼ぶ。
 * キューに積まれた送信を順番に再試行し、成功したものを削除する。
 * @returns {Promise<void>}
 */
async function flushPendingQueue() {
  if (!navigator.onLine) return;
  const queue = lsGet(LS_KEYS.PENDING_QUEUE, []);
  if (!queue.length) return;

  const failed = [];
  for (const item of queue) {
    try {
      await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });
      // no-cors では成否不明だが、fetch 例外が出なければ送信済みとみなす
    } catch {
      failed.push(item);
    }
  }
  lsSet(LS_KEYS.PENDING_QUEUE, failed);
}

// ネットワーク復帰時に自動再送
window.addEventListener('online', () => flushPendingQueue());
