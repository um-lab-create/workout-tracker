// supabase-client.js — Supabase クライアント生成・認証ヘルパー
// SPEC-012 Step1（認証基盤のみ）。書込/読取のSupabase化はStep2/3で別途実装する。
// storage.js より後・app.html の inline <script> より前に読み込むこと。
//
// 実装メモ:
//   - supabase-js v2 は CDN（jsdelivr）から動的 import() で読み込む。
//     動的 import() はトップレベルの import/export 文を使わないため、この
//     ファイルは通常の classic <script src="js/supabase-client.js"></script>
//     として読み込める（type="module" 不要）。node --check や
//     scripts/check_build.js の結合構文チェックとも両立する。
//   - CDNの取得は非同期のため、他スクリプトからは必ず
//     `window.HSSupabaseReady`（Promise）を await して使うこと。
//     同期的に window.HSSupabase を参照すると未初期化の可能性がある。
//
// 鍵の扱い（重要・SPEC-012 §4-2 / ADR-001 D5 が根拠）:
//   - publishable キー（sb_publishable_...）は公開リポジトリに置いてよい。
//     全テーブルの RLS ポリシーが to authenticated のみのため、未ログインでは
//     1バイトも読めない（curl 実証済み）。
//   - sb_secret_...（旧 service_role 相当）は絶対にここに書かない。
//     push 前に `git grep -iE 'service_role|sb_secret'` が空であることを確認する。

'use strict';

window.HSSupabaseReady = (async function initHSSupabaseClient() {
  const SUPABASE_URL = 'https://soglbfyzyvpqwckuvwro.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_iaP7EJglx50HHsZ_ewDY_w_C8MCbRls';
  const SUPABASE_JS_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

  const { createClient } = await import(SUPABASE_JS_CDN_URL);

  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,   // 既定どおり localStorage にセッション保持
      autoRefreshToken: true,
      detectSessionInUrl: true // パスワード設定メールのリンク（type=recovery）を検出
    }
  });

  /**
   * email+password でログインする。
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} data（session/user 含む）
   */
  async function signInWithPassword(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  /**
   * パスワード設定/再設定メールを送る（初回設定・パスワード忘れ共通）。
   * @param {string} email
   * @param {string} redirectTo  メール内リンクの戻り先URL（app.html のURL）
   */
  async function sendPasswordResetEmail(email, redirectTo) {
    const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return data;
  }

  /**
   * リセットリンク経由（PASSWORD_RECOVERY）でパスワードを更新する。
   * @param {string} newPassword
   */
  async function updatePassword(newPassword) {
    const { data, error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  }

  /** ログアウトする。未ログインでもローカル記録は引き続き可能。 */
  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  /** 現在のセッションを取得する（無ければ null）。 */
  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  /**
   * 認証状態の変化を購読する。
   * @param {(event: string, session: object|null) => void} callback
   * @returns {{ unsubscribe: () => void }}
   */
  function onAuthStateChange(callback) {
    const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
    return data.subscription;
  }

  const api = {
    client,
    signInWithPassword,
    sendPasswordResetEmail,
    updatePassword,
    signOut,
    getSession,
    onAuthStateChange
  };

  window.HSSupabase = api;
  window.dispatchEvent(new CustomEvent('hs-supabase-ready', { detail: api }));
  return api;
})().catch((err) => {
  // CDN障害・オフライン初回起動などで失敗しうる。記録機能自体は落とさない。
  console.error('[supabase-client] 初期化に失敗しました:', err);
  window.dispatchEvent(new CustomEvent('hs-supabase-error', { detail: err }));
  throw err;
});
