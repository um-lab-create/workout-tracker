// supabase-client.js — Supabase クライアント生成・認証ヘルパー・データ層・新オフラインキュー
// SPEC-012 Step1（認証基盤）+ Step2（書込/読取のSupabase化・GASミラーはapp.html側）。
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
//   - オフラインキュー（window.HSSbQueue）だけは同期的に使える（localStorage のみ）。
//
// 鍵の扱い（重要・SPEC-012 §4-2 / ADR-001 D5 が根拠）:
//   - publishable キー（sb_publishable_...）は公開リポジトリに置いてよい。
//     全テーブルの RLS ポリシーが to authenticated のみのため、未ログインでは
//     1バイトも読めない（curl 実証済み）。
//   - secret キー（`sb_` + `secret_` で始まるもの。旧 service ロール相当）は絶対にここに書かない。
//     push 前チェック: 禁止トークンの grep（SPEC-012 受け入れ基準参照）が空であることを確認する。

'use strict';

// ----------------------------------------------------------------
// 新オフラインキュー hs:sb-queue:v1（SPEC-012 実装方針4）
// 旧 hs:pending-queue（GAS payload形式）は流用せず、このキューに置換する。
// 積むのは低レベル payload ではなく「操作」（例: {op:'meal_save', data:{date, timingKey}}）。
// 再送時は登録済みハンドラが localStorage の最新状態から同期関数を呼び直す
// （一次ストアが正。古いスナップショット送信による巻き戻し事故を構造的に排除）。
// ----------------------------------------------------------------
window.HSSbQueue = (function initHSSbQueue() {
  const QUEUE_KEY = 'hs:sb-queue:v1';
  const handlers = {};

  function load() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function save(queue) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || [])); } catch (e) { /* 容量超過等 */ }
  }

  /**
   * 操作をキューに積む。同じ key の既存エントリは置換（最新の意図だけ残す）。
   * @param {string} op    操作名（meal_save / meal_delete / workout_save / hydration_save / body_save / settings_save）
   * @param {string} key   置換単位のキー（例: 'meal_save:2026-07-10:morning'）。null なら一意キーを生成
   * @param {object} data  ハンドラに渡すデータ（最小限。原則ローカル状態の参照キーのみ）
   */
  function enqueue(op, key, data) {
    const entry = {
      op,
      key: key || `${op}:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`,
      data: data || {},
      queuedAt: Date.now()
    };
    const queue = load().filter((e) => e && e.key !== entry.key);
    queue.push(entry);
    save(queue);
    return entry;
  }

  /** 指定 key のエントリを取り下げる（例: 削除時に同スロットの保存opを消す）。 */
  function discard(key) {
    if (!key) return;
    save(load().filter((e) => e && e.key !== key));
  }

  function count() { return load().length; }

  /** flushQueue が呼ぶ操作ハンドラを登録する（app.html 側で登録）。 */
  function registerHandler(op, fn) { handlers[op] = fn; }

  return { QUEUE_KEY, load, save, enqueue, discard, count, registerHandler, handlers };
})();

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

  // ---------------- 認証ヘルパー ----------------

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

  // ---------------- データ層 共通ヘルパー（SPEC-012 Step2） ----------------

  function authRequiredError() {
    const err = new Error('未ログインです');
    err.code = 'AUTH_REQUIRED';
    return err;
  }

  /** ログイン済みの user_id を返す。未ログインなら AUTH_REQUIRED を投げる。 */
  async function requireUserId() {
    const session = await getSession();
    if (!session || !session.user) throw authRequiredError();
    return session.user.id;
  }

  /** supabase-js の {data, error} を「失敗＝例外」に正規化する（書き逃げ禁止の要）。 */
  function must(result) {
    if (result.error) {
      const err = new Error(result.error.message || 'Supabase書込/読取に失敗しました');
      err.cause = result.error;
      err.code = result.error.code;
      throw err;
    }
    return result.data;
  }

  // ---------------- 書込（計画書 付録A の対応表を実装） ----------------

  /**
   * 食事1件を保存する（meals 契約 §2-2/§2-3 の意味論をフロントで継承）。
   * ① meals upsert on conflict (user_id, eaten_on, timing)
   * ② meal_items を親 meal 単位で全 delete → 全 insert（sort_order=配列順）
   * ③ 外食メモがあれば meal_dining_context upsert / 無ければ delete
   * @param {object} payload {eatenOn, timing(日本語表示値), memo, kcal, proteinG, fatG, carbG,
   *                          legacyRecordId, items:[{foodKey, foodId, name, qty, unit, grams,
   *                          pendingReview, estKcal, estProteinG, estFatG, estCarbG}],
   *                          dining: {note} | null}
   * @returns {Promise<string>} meal_id
   */
  async function saveMealRecord(payload) {
    const uid = await requireUserId();
    const meal = must(await client.from('meals')
      .upsert({
        user_id: uid,
        eaten_on: payload.eatenOn,
        timing: payload.timing,
        memo: payload.memo || null,
        kcal: payload.kcal ?? null,
        protein_g: payload.proteinG ?? null,
        fat_g: payload.fatG ?? null,
        carb_g: payload.carbG ?? null,
        legacy_record_id: payload.legacyRecordId || null
      }, { onConflict: 'user_id,eaten_on,timing' })
      .select('id')
      .single());

    must(await client.from('meal_items').delete().eq('meal_id', meal.id));
    const items = (payload.items || []).map((it, i) => ({
      meal_id: meal.id,
      user_id: uid,
      food_id: it.foodId || null,
      food_key: it.foodKey || null,
      name: it.name,
      qty: it.qty ?? null,
      unit: it.unit || null,
      grams: it.grams ?? null,
      pending_review: Boolean(it.pendingReview),
      sort_order: i,
      est_kcal: it.estKcal ?? null,
      est_protein_g: it.estProteinG ?? null,
      est_fat_g: it.estFatG ?? null,
      est_carb_g: it.estCarbG ?? null
    }));
    if (items.length) must(await client.from('meal_items').insert(items));

    if (payload.dining) {
      // ★7: note は人間可読テキストのみ。URL（GoogleマップURL等）は絶対に渡さないこと（呼び出し側の契約）。
      must(await client.from('meal_dining_context')
        .upsert({ meal_id: meal.id, user_id: uid, note: payload.dining.note || null }, { onConflict: 'meal_id' }));
    } else {
      must(await client.from('meal_dining_context').delete().eq('meal_id', meal.id));
    }
    return meal.id;
  }

  /**
   * 食事1件を削除する（cascade で meal_items / meal_dining_context も消える）。
   * @param {string} eatenOn  YYYY-MM-DD
   * @param {string} timing   日本語表示値（朝/昼/夜/間食）
   */
  async function deleteMealRecord(eatenOn, timing) {
    await requireUserId();
    must(await client.from('meals').delete().eq('eaten_on', eatenOn).eq('timing', timing));
  }

  /**
   * 筋トレ1件を insert する。row.id にクライアント生成 uuid を渡すこと
   * （再送時は on conflict (id) do nothing で冪等になる）。
   */
  async function insertWorkout(row) {
    const uid = await requireUserId();
    must(await client.from('workouts')
      .upsert({ ...row, user_id: uid }, { onConflict: 'id', ignoreDuplicates: true }));
  }

  /** 水分（日次累積スナップショット）を upsert する。同日は1行に収束（006 の unique が前提）。 */
  async function upsertHydration(row) {
    const uid = await requireUserId();
    must(await client.from('hydration')
      .upsert({ ...row, user_id: uid }, { onConflict: 'user_id,logged_on' }));
  }

  /**
   * 体組成（手動）を insert する。row.id にクライアント生成 uuid を渡すこと（再送冪等）。
   * source は呼び出し側で 'manual' を渡す。
   */
  async function insertBodyComposition(row) {
    const uid = await requireUserId();
    must(await client.from('body_composition')
      .upsert({ ...row, user_id: uid }, { onConflict: 'id', ignoreDuplicates: true }));
  }

  /** 設定（目標値など）を upsert する。渡した列だけ更新される（プロフィール列は保持）。 */
  async function upsertUserSettings(row) {
    const uid = await requireUserId();
    must(await client.from('user_settings')
      .upsert({ ...row, user_id: uid }, { onConflict: 'user_id' }));
  }

  // ---------------- 読取（READ_PIN 読取の置換） ----------------

  /** 設定1行を返す（無ければ null）。 */
  async function fetchUserSettings() {
    await requireUserId();
    return must(await client.from('user_settings').select('*').maybeSingle());
  }

  /**
   * 期間内の食事・品目・外食コンテキストを返す。
   * meal_dining_context は「必要画面からの明示的な単独 select」（★7 恒久ルールの許容範囲。
   * join はしない）。ビュー・AI集計面には決して流さないこと。
   * @returns {Promise<{meals: object[], items: object[], contexts: object[]}>}
   */
  async function fetchMealDetails(fromDate, toDate) {
    await requireUserId();
    const meals = must(await client.from('meals')
      .select('*')
      .gte('eaten_on', fromDate)
      .lte('eaten_on', toDate)
      .order('eaten_on', { ascending: true }));
    const ids = meals.map((m) => m.id);
    if (!ids.length) return { meals, items: [], contexts: [] };
    const items = must(await client.from('meal_items')
      .select('*')
      .in('meal_id', ids)
      .order('sort_order', { ascending: true, nullsFirst: false }));
    const contexts = must(await client.from('meal_dining_context')
      .select('*')
      .in('meal_id', ids));
    return { meals, items, contexts };
  }

  /**
   * 週次レビュー（v_weekly_review）を新しい週から limit 件返す。
   * 丸めは表示側で行う（契約 §4-3: ビューは丸めない値を返す）。
   */
  async function fetchWeeklyReview(limit = 8) {
    await requireUserId();
    return must(await client.from('v_weekly_review')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(limit));
  }

  /**
   * foods の legacy_key → uuid 対応表を返す（新規保存の food_id 併記用）。
   * @returns {Promise<Object<string,string>>}
   */
  async function fetchFoodsKeyMap() {
    await requireUserId();
    const rows = must(await client.from('foods')
      .select('id, legacy_key')
      .not('legacy_key', 'is', null));
    const map = {};
    rows.forEach((r) => { if (r.legacy_key) map[r.legacy_key] = r.id; });
    return map;
  }

  /** 疎通確認用の軽い select（旧 doGet「接続成功！」の代わり）。 */
  async function pingRead() {
    await requireUserId();
    must(await client.from('user_settings').select('user_id').limit(1));
    return true;
  }

  // ---------------- 食品ドメイン（SPEC-014・007 が前提） ----------------

  /** foods 全件（archived 除く）をページネーション取得する。カタログキャッシュの元データ。 */
  async function fetchFoodsCatalog() {
    await requireUserId();
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const rows = must(await client.from('foods')
        .select('*')
        .eq('archived', false)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1));
      all.push(...rows);
      if (!rows || rows.length < PAGE) break;
    }
    return all;
  }

  /**
   * 自分の食品（食材/商品/レシピの親行）を upsert する。冪等キーは legacy_key。
   * owner は必ず自分（RLS の with check とも一致）。
   */
  async function upsertUserFood(row) {
    const uid = await requireUserId();
    return must(await client.from('foods')
      .upsert({ ...row, owner: uid, updated_at: new Date().toISOString() }, { onConflict: 'legacy_key' })
      .select('id, legacy_key')
      .single());
  }

  /**
   * レシピを保存する: 親 foods 行 upsert → recipe_items を全 delete → 全 insert（置換・冪等）。
   * 親行には呼び出し側で計算済みの 1食分栄養（per_unit / micros / typed列）を渡すこと。
   * @returns {Promise<string>} 親 foods の id
   */
  async function saveRecipe(foodRow, items) {
    const uid = await requireUserId();
    const food = await upsertUserFood({ ...foodRow, kind: 'recipe' });
    must(await client.from('recipe_items').delete().eq('recipe_food_id', food.id));
    const rows = (items || []).map((it, i) => ({
      recipe_food_id: food.id,
      user_id: uid,
      ingredient_food_id: it.ingredientFoodId || null,
      name: it.name,
      qty: it.qty ?? null,
      unit: it.unit || null,
      grams: it.grams ?? null,
      est_kcal: it.estKcal ?? null,
      est_protein_g: it.estProteinG ?? null,
      est_fat_g: it.estFatG ?? null,
      est_carb_g: it.estCarbG ?? null,
      pending_review: Boolean(it.pendingReview),
      sort_order: i
    }));
    if (rows.length) must(await client.from('recipe_items').insert(rows));
    return food.id;
  }

  /** レシピの材料内訳を取得する（編集用）。 */
  async function fetchRecipeItems(recipeFoodId) {
    await requireUserId();
    return must(await client.from('recipe_items')
      .select('*')
      .eq('recipe_food_id', recipeFoodId)
      .order('sort_order', { ascending: true, nullsFirst: false }));
  }

  /** 自分の食品をアーカイブ/復帰する（論理削除。過去記録の参照を壊さない）。 */
  async function setFoodArchived(legacyKey, archived) {
    const uid = await requireUserId();
    must(await client.from('foods')
      .update({ archived: Boolean(archived), updated_at: new Date().toISOString() })
      .eq('legacy_key', legacyKey)
      .eq('owner', uid));
  }

  /** 普段の食事セット（テンプレート）を upsert する。冪等キーは (user_id, legacy_key)。 */
  async function upsertMealTemplate(row) {
    const uid = await requireUserId();
    must(await client.from('meal_templates')
      .upsert({ ...row, user_id: uid, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,legacy_key' }));
  }

  /** 自分のテンプレート一覧。 */
  async function fetchMealTemplates() {
    await requireUserId();
    return must(await client.from('meal_templates')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false }));
  }

  /**
   * food_id 未解決の過去明細を legacy_key → foods.id 対応で自動接続する（昇格後の後始末）。
   * RLS により自分の行しか更新されない。
   * @param {Object<string,string>} keyToId
   */
  async function relinkMealItems(keyToId) {
    await requireUserId();
    let relinked = 0;
    for (const [key, id] of Object.entries(keyToId || {})) {
      const rows = must(await client.from('meal_items')
        .update({ food_id: id })
        .eq('food_key', key)
        .is('food_id', null)
        .select('id'));
      relinked += (rows || []).length;
    }
    return relinked;
  }

  // ---------------- 取込2導線（SPEC-012 §6・GAS退役のブロッカー） ----------------

  /**
   * ヘルスケア日次データを health_metrics へ一括 upsert する（500行 chunk）。
   * 旧 `sheet:'ヘルスケアログ_batch'` no-cors POST の置換。
   * @param {Array<{measured_on:string, metric:string, value:number, unit:string}>} rows
   * @returns {Promise<{total:number, chunks:number}>}
   */
  async function upsertHealthMetrics(rows) {
    const uid = await requireUserId();
    const CHUNK = 500;
    let chunks = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => ({ ...r, user_id: uid }));
      must(await client.from('health_metrics')
        .upsert(batch, { onConflict: 'user_id,measured_on,metric' }));
      chunks += 1;
    }
    return { total: rows.length, chunks };
  }

  /**
   * eufy 体組成CSVの行を body_composition へ一括 insert する（重複は黙ってスキップ）。
   * on conflict (user_id, measured_at, source) do nothing = 旧「日時比較の差分取込」の代わり。
   * RETURNING は実際に insert された行だけを返すため、追加/スキップ件数が分かる。
   * @param {Array<object>} rows  measured_at(ISO+09:00)・source='eufy' 込みの行
   * @returns {Promise<{total:number, inserted:number, skipped:number}>}
   */
  async function insertEufyBodyComposition(rows) {
    const uid = await requireUserId();
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => ({ ...r, user_id: uid }));
      const returned = must(await client.from('body_composition')
        .upsert(batch, { onConflict: 'user_id,measured_at,source', ignoreDuplicates: true })
        .select('id'));
      inserted += (returned || []).length;
    }
    return { total: rows.length, inserted, skipped: rows.length - inserted };
  }

  // ---------------- バックアップ（SPEC-012 §7・課金なし1クリック） ----------------

  // 書き出し対象の全テーブルと、ページネーションを安定させる order 列。
  // ビュー2本は再計算できるため含めない。foods はマスタだが復元が1ファイルで済むよう含める。
  const BACKUP_TABLES = [
    { name: 'body_composition', order: ['measured_at', 'id'] },
    { name: 'health_metrics', order: ['measured_on', 'metric'] },  // 複合PK・id列なし
    { name: 'meals', order: ['eaten_on', 'id'] },
    { name: 'meal_items', order: ['meal_id', 'sort_order', 'id'] },
    { name: 'meal_dining_context', order: ['meal_id'] },
    { name: 'workouts', order: ['performed_on', 'id'] },
    { name: 'hydration', order: ['logged_on'] },
    { name: 'weekly_notes', order: ['week_start'] },
    { name: 'user_settings', order: ['user_id'] },
    { name: 'foods', order: ['id'] }
  ];

  /** PostgREST の1000行制限を超えても全件取れるよう range() でページングする。 */
  async function fetchAllRows(table, orderCols) {
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      let query = client.from(table).select('*');
      orderCols.forEach((col) => { query = query.order(col, { ascending: true }); });
      const rows = must(await query.range(from, from + PAGE - 1));
      all.push(...rows);
      if (!rows || rows.length < PAGE) break;
    }
    return all;
  }

  /**
   * 全テーブルを select して1つのバックアップオブジェクトにまとめる。
   * RLS によりログイン本人の行しか返らない = 自分のデータの完全な写し。
   * 件数メタ情報を含め、取りこぼしを検知可能にする（SPEC-012 §7）。
   */
  async function exportAllTables(onProgress) {
    await requireUserId();
    const tables = {};
    let totalRows = 0;
    for (const t of BACKUP_TABLES) {
      if (onProgress) { try { onProgress(t.name); } catch (e) {} }
      const rows = await fetchAllRows(t.name, t.order);
      tables[t.name] = { count: rows.length, rows };
      totalRows += rows.length;
    }
    return {
      exportedAt: new Date().toISOString(),
      format: 'health-sambo-backup-v1',
      tableCount: BACKUP_TABLES.length,
      totalRows,
      tables
    };
  }

  // ---------------- キューの再送（flush） ----------------

  let queueFlushing = false;

  /**
   * hs:sb-queue:v1 の操作を順に再実行する。オンライン＋ログイン済みの時だけ動く。
   * 成功した操作だけ取り除く（flush 中に積まれた新規エントリは消さない）。
   * @returns {Promise<{done:number, failed:number, skipped:boolean}>}
   */
  async function flushQueue() {
    const summary = { done: 0, failed: 0, skipped: false };
    if (queueFlushing || !navigator.onLine || !window.HSSbQueue.count()) {
      summary.skipped = true;
      return summary;
    }
    const session = await getSession().catch(() => null);
    if (!session) { summary.skipped = true; return summary; }
    queueFlushing = true;
    try {
      const snapshot = window.HSSbQueue.load();
      const processed = [];
      for (const entry of snapshot) {
        const handler = window.HSSbQueue.handlers[entry.op];
        if (!handler) continue; // ハンドラ未登録の操作は残す（別ページで積まれた等）
        try {
          await handler(entry.data || {});
          processed.push(entry);
          summary.done += 1;
        } catch (e) {
          summary.failed += 1;
        }
      }
      if (processed.length) {
        // flush 中に enqueue された同一 key の新しいエントリ（queuedAt が進んでいる）は残す
        const remain = window.HSSbQueue.load().filter((e) =>
          !processed.some((p) => p.key === e.key && p.queuedAt === e.queuedAt));
        window.HSSbQueue.save(remain);
      }
    } finally {
      queueFlushing = false;
    }
    return summary;
  }

  const api = {
    client,
    signInWithPassword,
    sendPasswordResetEmail,
    updatePassword,
    signOut,
    getSession,
    onAuthStateChange,
    requireUserId,
    saveMealRecord,
    deleteMealRecord,
    insertWorkout,
    upsertHydration,
    insertBodyComposition,
    upsertUserSettings,
    fetchUserSettings,
    fetchMealDetails,
    fetchWeeklyReview,
    fetchFoodsKeyMap,
    pingRead,
    fetchFoodsCatalog,
    upsertUserFood,
    saveRecipe,
    fetchRecipeItems,
    setFoodArchived,
    upsertMealTemplate,
    fetchMealTemplates,
    relinkMealItems,
    upsertHealthMetrics,
    insertEufyBodyComposition,
    exportAllTables,
    flushQueue
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
