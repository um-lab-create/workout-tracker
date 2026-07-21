// sync.js — Supabase 同期層（SPEC-012: 送信payload構築 sbMealPayload/sbWorkoutRow/sbBodyRow、
// 失敗時の操作キュー queueWithToast/registerSbOpHandlers、サーバー→ローカル変換
// sbRowsFromMealDetails/serverRowsToAppRecords、スロット突合マージ・削除伝播
// mergeServerMealRecords、syncFromServer/updateSyncUi/flushSbQueueAndRender）。
// app.html から挙動不変で切り出し（監査 9-1 第3歩＝最終回。js/charts.js・js/food-domain.js と
// 同方式の classic script・同名グローバル・純移動）。
//
// 提供する主なグローバル（他モジュールからも参照される）:
//   - foodsKeyMap / FOODS_MAP_KEY / foodIdForKey / toNumOrNull（js/food-domain.js が実行時解決で利用）
//
// 依存（app.html / 他モジュールのグローバルに実行時解決で依存する。読み込み順は
// food-domain.js の後・inline より前だが、呼び出し時には定義済みなので関数参照でよい）:
//   - nutrition-db.js         : NUTRITION_DB
//   - js/storage.js           : lsGet / lsSet / LS_KEYS
//   - js/supabase-client.js   : window.HSSupabaseReady / window.HSSbQueue
//   - js/food-domain.js       : pushUserFoodToServer / pushRecipeToServer / pushTemplateToServer
//   - app.html inline         : $ / state / TIMINGS / getFoodById / createMealItem /
//       getRecords / saveRecords / markMealSynced / rebuildFoodUsage / summarizeItems /
//       restoreMealItems / loadDrafts / draftKey / savedStoredItemsSignature /
//       normalizeDiningOut / loadPresets / loadMealFor / renderQuickRow / renderItems /
//       renderHydration / renderHome / renderBodyView / renderSyncStatus / showToast /
//       openLoginSheet / hydrationTarget / hydrationTotal / showHydration / baseTargets /
//       shiftDate / todayStr / applyHydrationVisibility / SHOW_HYDRATION_KEY /
//       BODY_SERVER_CACHE_KEY / bodyServerFetchedAt（代入）
// DOM を触るのは updateSyncUi と各 render* 呼び出しのみ（要素は app.html にある前提）。
'use strict';

// ================================================================
// Supabase 同期層（SPEC-012: 書込・読取の supabase-js 化）
// 保存フロー: Supabase で書く（失敗は例外＝確実に検知）。失敗時は hs:sb-queue:v1 に
// 「操作」を積み、再送時は localStorage の最新状態から同期し直す。
// GAS ミラー（DUAL_WRITE_GAS）は 2026-07-10 の GAS 退役（計画書 §8）で削除済み。
// ================================================================
const FOODS_MAP_KEY = 'hs:foods-map:v1';
let foodsKeyMap = (lsGet(FOODS_MAP_KEY, null) || {}).map || {};

function toNumOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function makeClientUuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  // 古い環境向けフォールバック（uuid v4 形式）
  const hex = [];
  const buf = new Uint8Array(16);
  (window.crypto && window.crypto.getRandomValues)
    ? window.crypto.getRandomValues(buf)
    : buf.forEach((_, i) => { buf[i] = Math.floor(Math.random() * 256); });
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  buf.forEach((b) => hex.push(b.toString(16).padStart(2, '0')));
  return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10,16).join('')}`;
}

/** foods の legacy_key → uuid 対応表を取得してキャッシュする（24時間TTL・失敗は無視）。 */
async function refreshFoodsMap(force = false) {
  try {
    const cached = lsGet(FOODS_MAP_KEY, null);
    if (!force && cached && cached.fetchedAt && Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000) {
      foodsKeyMap = cached.map || {};
      return;
    }
    const sb = await window.HSSupabaseReady;
    const map = await sb.fetchFoodsKeyMap();
    foodsKeyMap = map || {};
    lsSet(FOODS_MAP_KEY, { fetchedAt: Date.now(), map: foodsKeyMap });
  } catch (e) { /* 未ログイン・オフライン時はスキップ（food_id 無しでも food_key で保存できる） */ }
}
function foodIdForKey(foodKey) {
  if (!foodKey) return null;
  const food = typeof getFoodById === 'function' ? getFoodById(foodKey) : null;
  return (food && food.serverId) || foodsKeyMap[foodKey] || null;
}

/** app レコード → Supabase 食事保存 payload（meals + meal_items + dining）。 */
function sbMealPayload(record) {
  const timingLabel = (TIMINGS[record.timingKey] && TIMINGS[record.timingKey].label) || record.timing;
  const items = (record.structuredItems || [])
    .filter((s) => s && s.foodId !== 'dining-out-pending')
    .map((s) => {
      const known = Boolean(getFoodById(s.foodId));
      const n = s.nutrients || {};
      return {
        foodKey: s.foodId || null,
        foodId: foodIdForKey(s.foodId),
        name: s.foodName || s.foodId || '未登録',
        qty: toNumOrNull(s.qty),
        unit: s.unit || null,
        grams: s.grams == null ? null : Math.round((Number(s.grams) || 0) * 10) / 10,
        pendingReview: Boolean(s.pendingReview),
        // 栄養DBで再計算できない品目（独自/サーバー由来/概算）だけ推定値を保存する
        estKcal: known ? null : toNumOrNull(n.energy),
        estProteinG: known ? null : toNumOrNull(n.protein),
        estFatG: known ? null : toNumOrNull(n.fat),
        estCarbG: known ? null : toNumOrNull(n.carb)
      };
    });
  let dining = null;
  if (record.diningOut) {
    // ★7: 店名は人間可読テキストとして note 先頭に併合可（meals 契約 §7-1）。
    // GoogleマップURL・推定根拠URLはいかなる形でも Supabase に渡さない（契約 §7 絶対条件2）。
    const parts = [];
    if (record.restaurantName) parts.push(`店名: ${record.restaurantName}`);
    if (record.diningText) parts.push(record.diningText);
    dining = { note: parts.join(' / ') || null };
  }
  return {
    eatenOn: record.date,
    timing: timingLabel, // 日本語表示値（朝/昼/夜/間食）で確定（計画書 §14 Q3）
    memo: record.memo || null,
    kcal: toNumOrNull(record.kcal),
    proteinG: toNumOrNull(record.protein),
    fatG: toNumOrNull(record.fat),
    carbG: toNumOrNull(record.carb),
    legacyRecordId: record.id || null,
    items,
    dining
  };
}

/** 食事1件を Supabase に保存する。失敗は例外。 */
async function pushMealToServer(record) {
  const sb = await window.HSSupabaseReady;
  await sb.saveMealRecord(sbMealPayload(record));
  window.HSSbQueue.discard(`meal_delete:${record.date}:${record.timingKey}`);
}

/** 食事1件を Supabase から削除する。失敗は例外。 */
async function pushMealDeleteToServer({ date, timingKey, recordId }) {
  const sb = await window.HSSupabaseReady;
  const timingLabel = (TIMINGS[timingKey] && TIMINGS[timingKey].label) || timingKey;
  await sb.deleteMealRecord(date, timingLabel);
  window.HSSbQueue.discard(`meal_save:${date}:${timingKey}`);
}

/** 送信失敗の共通ハンドリング: 操作をキューに積み、状況に応じたトーストを出す。 */
function queueWithToast(op, key, data, label, err) {
  window.HSSbQueue.enqueue(op, key, data);
  if (err && err.code === 'AUTH_REQUIRED') showToast(`${label}: 未ログインのため未送信に保存しました（ログイン後に自動送信）`);
  else if (!navigator.onLine) showToast(`${label}: オフラインのため未送信に保存しました（復帰後に自動送信）`);
  else { console.warn('送信エラー詳細:', err); showToast(`${label}: サーバーに接続できませんでした。未送信に保存しました（自動で再送します）`, 'error'); }
  renderSyncStatus();
}

// ---- 筋トレ ----
function sbWorkoutRow(gasRecord) {
  return {
    id: makeClientUuid(), // 再送冪等キー（on conflict (id) do nothing）
    performed_on: gasRecord['日付'],
    exercise: gasRecord['種目'],
    weight_kg: toNumOrNull(gasRecord['重量']),
    reps: toNumOrNull(gasRecord['回数']),
    sets: toNumOrNull(gasRecord['セット数']),
    minutes: toNumOrNull(gasRecord['時間']),
    distance_km: toNumOrNull(gasRecord['距離']),
    speed_kmh: toNumOrNull(gasRecord['速さ']),
    intensity: toNumOrNull(gasRecord['強度']),
    incline: toNumOrNull(gasRecord['傾斜']),
    load_note: gasRecord['負荷'] === '' || gasRecord['負荷'] == null ? null : String(gasRecord['負荷']),
    // SPEC-024: AI登録種目の参照キー（緩い text 参照・FKではない）と消費kcalスナップショット。
    // どちらも nullable。組み込み8種は null のまま＝既存の挙動と完全互換。
    exercise_key: gasRecord._exerciseKey || null,
    est_kcal: toNumOrNull(gasRecord._estKcal)
  };
}
async function pushWorkoutToServer(row) {
  const sb = await window.HSSupabaseReady;
  await sb.insertWorkout(row);
}

// ---- 水分（日次累積スナップショット。同日 upsert で1行に収束） ----
async function pushHydrationToServer(date, rec, total) {
  const sb = await window.HSSupabaseReady;
  await sb.upsertHydration({
    logged_on: date,
    amount_ml: Math.round(total),
    target_ml: hydrationTarget(date),
    breakdown: (rec.entries || []).map((e) => ({ label: e.label || '水分', ml: Number(e.ml) || 0 }))
  });
}

// ---- 体組成（手動） ----
function sbBodyRow(record) {
  return {
    id: makeClientUuid(),
    measured_at: new Date(record.ts || Date.now()).toISOString(),
    source: 'manual',
    weight_kg: toNumOrNull(record.weight),
    body_fat_pct: toNumOrNull(record.fat),
    condition: toNumOrNull(record.cond),
    note: record.memo || null
  };
}
async function pushBodyToServer(row) {
  const sb = await window.HSSupabaseReady;
  await sb.insertBodyComposition(row);
}

// ---- 目標（設定） ----
async function pushSettingsToServer() {
  const targets = baseTargets();
  const sb = await window.HSSupabaseReady;
  // 判定帯は目標から常に導出して同送する（2026-07-20: 目標3系統の不整合が再発しないように。
  // 方針: kcal ±10% / P -5%〜+20% / F・C ±20%）
  const kcal = Math.round(targets.energy);
  await sb.upsertUserSettings({
    target_kcal: kcal,
    target_p_g: targets.protein,
    target_f_g: targets.fat,
    target_c_g: targets.carb,
    target_kcal_min: Math.round(kcal * 0.9), target_kcal_max: Math.round(kcal * 1.1),
    target_protein_min: Math.round(targets.protein * 0.95), target_protein_max: Math.round(targets.protein * 1.2),
    target_fat_min: Math.round(targets.fat * 0.8), target_fat_max: Math.round(targets.fat * 1.2),
    target_carb_min: Math.round(targets.carb * 0.8), target_carb_max: Math.round(targets.carb * 1.2),
    show_hydration: showHydration(),
    updated_at: new Date().toISOString()
  });
}

// ---- キュー操作ハンドラ登録（再送時は localStorage の最新状態から同期し直す） ----
function registerSbOpHandlers() {
  const q = window.HSSbQueue;
  q.registerHandler('meal_save', async ({ date, timingKey }) => {
    const rec = getRecords().find((r) => r && r.date === date && r.timingKey === timingKey);
    if (!rec) return; // その後ローカルで削除された等 → 送るものが無い
    await pushMealToServer(rec);
    markMealSynced(rec.id, true);
  });
  q.registerHandler('meal_delete', async (data) => {
    await pushMealDeleteToServer(data);
  });
  q.registerHandler('workout_save', async ({ row }) => {
    await pushWorkoutToServer(row);
  });
  q.registerHandler('hydration_save', async ({ date }) => {
    const all = lsGet(LS_KEYS.HYDRATION_RECORDS, {}) || {};
    const rec = all[date];
    if (!rec) return;
    const total = hydrationTotal(rec);
    if (!total) return;
    await pushHydrationToServer(date, rec, total);
    rec.synced = true;
    all[date] = rec;
    lsSet(LS_KEYS.HYDRATION_RECORDS, all);
  });
  q.registerHandler('body_save', async ({ row }) => {
    await pushBodyToServer(row);
  });
  q.registerHandler('workout_delete', async ({ id }) => {
    const sb = await window.HSSupabaseReady;
    if (id) await sb.deleteWorkout(id);   // id 指定 delete は冪等（無ければ0行）
  });
  q.registerHandler('body_delete', async ({ id }) => {
    const sb = await window.HSSupabaseReady;
    if (id) await sb.deleteBodyComposition(id);   // manual限定・冪等
  });
  q.registerHandler('settings_save', async () => {
    await pushSettingsToServer();
  });
  // 食品ドメイン（SPEC-014）: legacy_key upsert で冪等なため payload 運搬型でよい
  q.registerHandler('food_save', async ({ food }) => {
    if (food) await pushUserFoodToServer(food);
  });
  q.registerHandler('recipe_save', async ({ recipe }) => {
    if (recipe) await pushRecipeToServer(recipe);
  });
  q.registerHandler('template_save', async ({ tpl }) => {
    if (tpl) await pushTemplateToServer(tpl);
  });
}

/** キューを流し、動きがあれば画面を更新する（online復帰・起動時・ログイン完了時に呼ぶ）。 */
async function flushSbQueueAndRender() {
  try {
    const sb = await window.HSSupabaseReady;
    const result = await sb.flushQueue();
    if (result && result.done) {
      renderSyncStatus();
      renderHydration();
      renderHome();
      if (state.view === 'meal') renderItems();
    }
    return result;
  } catch (e) {
    return null;
  }
}

// ---------------- サーバー同期（SPEC-003 の READ_PIN 読取 → Supabase select に置換） ----------------
function normalizeServerDate(value) {
  if (!value) return '';
  const str = String(value);
  const match = str.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : str.slice(0, 10);
}
function timingKeyFromLabel(label) {
  const text = String(label || '');
  if (text.includes('朝')) return 'morning';
  if (text.includes('昼')) return 'lunch';
  if (text.includes('夜')) return 'dinner';
  if (text.includes('間')) return 'snack';
  return '';
}
function rowValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return '';
}
function numFromRow(row, keys) {
  const value = rowValue(row, keys);
  if (value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
function boolFromRow(row, keys) {
  const value = rowValue(row, keys);
  if (value === true) return true;
  const text = String(value || '').toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}
function structuredFromSyncedItem(item) {
  const food = getFoodById(item.foodId);
  if (food && NUTRITION_DB && NUTRITION_DB.structureItem) {
    try { return NUTRITION_DB.structureItem(item, food); } catch (e) { /* fallback */ }
  }
  return {
    foodId: item.foodId,
    foodName: item.name || item.foodId,
    qty: Number(item.qty) || 0,
    unit: item.unit || '',
    grams: item.grams == null ? null : Number(item.grams) || 0,
    pendingReview: Boolean(item.pendingReview),
    nutrients: {
      energy: Number(item.kcal) || 0,
      protein: Number(item.p) || 0,
      fat: Number(item.f) || 0,
      carb: Number(item.c) || 0
    }
  };
}
function itemFromServerRow(row) {
  const foodId = String(rowValue(row, ['foodId', 'foodId']) || '').trim();
  const name = String(rowValue(row, ['名前', 'name']) || foodId || '未登録').trim();
  const qty = Number(rowValue(row, ['量', 'qty'])) || 1;
  const unit = String(rowValue(row, ['単位', 'unit']) || '個');
  const gramsRaw = rowValue(row, ['グラム換算', 'grams']);
  const grams = gramsRaw === '' ? null : Number(gramsRaw) || 0;
  const pendingReview = boolFromRow(row, ['要確認フラグ', 'pendingReview']);
  const estimated = {
    kcal: numFromRow(row, ['推定kcal', 'estimatedKcal', 'kcal', 'カロリー']),
    p: numFromRow(row, ['推定P_g', 'estimatedProtein', 'protein', 'たんぱく質']),
    f: numFromRow(row, ['推定F_g', 'estimatedFat', 'fat', '脂質']),
    c: numFromRow(row, ['推定C_g', 'estimatedCarb', 'carb', '炭水化物'])
  };
  const hasEstimate = estimated.kcal || estimated.p || estimated.f || estimated.c;
  const food = getFoodById(foodId);
  if (food && foodId !== 'dining-out-pending' && !hasEstimate) {
    const item = createMealItem(food, qty, unit, { pendingReview });
    if (grams != null) item.grams = grams;
    return item;
  }
  return {
    id: `meal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    foodId,
    name,
    qty,
    unit,
    grams,
    kcal: estimated.kcal,
    p: estimated.p,
    f: estimated.f,
    c: estimated.c,
    pendingReview,
    sourceType: foodId === 'dining-out-pending' ? 'dining' : 'server',
    brand: '',
    frozen: true
  };
}
function serverRowsToAppRecords(rows) {
  const grouped = {};
  (rows || []).forEach((row) => {
    if (String(row['ステータス'] || '') === '無効') return;
    const date = normalizeServerDate(rowValue(row, ['日付', 'date']));
    const timingKey = String(rowValue(row, ['区分キー', 'timingKey']) || timingKeyFromLabel(rowValue(row, ['区分', 'timing'])));
    const recordId = String(rowValue(row, ['recordId', 'recordId']) || `${date}-${timingKey}`);
    if (!date || !timingKey || !recordId) return;
    const timing = String(rowValue(row, ['区分', 'timing']) || (TIMINGS[timingKey] && TIMINGS[timingKey].label) || timingKey);
    grouped[recordId] = grouped[recordId] || {
      id: recordId,
      date,
      timing,
      timingKey,
      title: (TIMINGS[timingKey] && TIMINGS[timingKey].title) || timing,
      // 監査#9: 旧実装は note:'' 固定でサーバー往復のたびメモが消えていた。memo 末尾の「メモ: …」から復元する
      note: (String(rowValue(row, ['メモ', 'memo']) || '').match(/(?:^| \/ )メモ: ([\s\S]*)$/) || [, ''])[1],
      items: [],
      structuredItems: [],
      diningOut: false,
      restaurantName: '',
      googleMapUrl: '',
      diningText: '',
      calcStatus: '',
      calcMemo: '',
      synced: true,
      source: 'server',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const item = itemFromServerRow(row);
    grouped[recordId].items.push({
      foodId: item.foodId,
      qty: Number(item.qty) || 0,
      unit: item.unit,
      pendingReview: Boolean(item.pendingReview)
    });
    grouped[recordId].structuredItems.push(structuredFromSyncedItem(item));
    if (item.foodId === 'dining-out-pending' || boolFromRow(row, ['外食フラグ', 'diningOut'])) {
      grouped[recordId].diningOut = true;
      grouped[recordId].restaurantName = String(rowValue(row, ['店名', 'restaurantName']) || '').trim();
      grouped[recordId].googleMapUrl = '';   // ★7: サーバー行はURLを運ばない（旧GAS行キーの読取は退役。監査#35）
      grouped[recordId].diningText = String(rowValue(row, ['外食内容', 'diningText']) || '').trim();
      grouped[recordId].calcStatus = String(rowValue(row, ['計算ステータス', 'calcStatus']) || '').trim();
      grouped[recordId].calcMemo = String(rowValue(row, ['計算メモ', 'calcMemo']) || '').trim();
    }
  });
  return Object.values(grouped).map((record) => {
    const totals = (record.structuredItems || []).reduce((acc, item) => {
      const n = item && item.nutrients ? item.nutrients : {};
      acc.kcal += Number(n.energy) || 0;
      acc.protein += Number(n.protein) || 0;
      acc.fat += Number(n.fat) || 0;
      acc.carb += Number(n.carb) || 0;
      return acc;
    }, { kcal: 0, protein: 0, fat: 0, carb: 0 });
    return {
      ...record,
      memo: summarizeItems(restoreMealItems(record.items, record.structuredItems)),
      kcal: Math.round(totals.kcal),
      protein: Math.round(totals.protein),
      fat: Math.round(totals.fat),
      carb: Math.round(totals.carb),
      reviewCount: (record.structuredItems || []).filter((item) => item && item.pendingReview).length
    };
  });
}
// [fix] 同期カウント: 従来は差分検知なしで期間内の全件を「更新」と数えていた
// （毎回「追加0/更新9」と出るバグ・マネージャー指摘 2026-07-11）。内容シグネチャで
// 実際に変わった時だけ「更新」と数える。
function mealRecordSignature(record) {
  return JSON.stringify({
    items: (record.structuredItems || []).map((s) => [s.foodId, s.qty, s.unit, Boolean(s.pendingReview)]),
    kcal: Math.round(Number(record.kcal) || 0),
    dining: [Boolean(record.diningOut), record.restaurantName || '', record.diningText || '']
  });
}
// [fix] 監査#12(B-6): 保存後に残る draft は record の鏡写し（saveMeal が persistDraft で同期）。
// サーバー更新・削除で record が変わった時、鏡写しの draft を残すと loadMealFor の draft 優先で
// 最新がマスクされ、再保存すると他端末の編集を黙って上書きする。旧 record と同一内容の draft は
// 削除して record 表示に委ねる。旧 record と異なる draft（ユーザーの未保存編集）には触れない。
function dropDraftIfMirrorsRecord(record) {
  if (!record) return false;
  const drafts = loadDrafts();
  const key = draftKey(record.date, record.timingKey);
  const draft = drafts[key];
  if (!draft) return false;
  const sameItems = JSON.stringify(draft.items || []) === savedStoredItemsSignature(record);
  const sameNote = String(draft.note || '') === String(record.note || '');
  const draftDining = normalizeDiningOut(draft.diningOut);
  const recordDining = normalizeDiningOut(record);
  const sameDining = draftDining.enabled === recordDining.enabled
    && draftDining.restaurantName === recordDining.restaurantName
    && draftDining.diningText === recordDining.diningText;
  if (!(sameItems && sameNote && sameDining)) return false;
  delete drafts[key];
  lsSet(LS_KEYS.MEAL_DRAFT, drafts);
  return true;
}
// [fix] 監査#4(B-1): 突合を record.id からスロット（date×timingKey）に変更。
// 冪等キー契約 meals=(user_id,eaten_on,timing) と同粒度なので、サーバーはスロットに1件しか
// 持てない。id 違いの並存（削除しても別idが復活する原因）はサーバー版1件に収束させる。
// synced=false（未送信）のローカル record は従来どおり上書き・置換しない。
function mergeServerMealRecords(serverRecords, options = {}) {
  const local = getRecords();
  let merged = local.slice();
  const counts = { added: 0, updated: 0, unchanged: 0, protected: 0, deleted: 0 };
  const slotOf = (record) => `${record.date}:${record.timingKey}`;
  const serverSlots = new Set((serverRecords || []).map(slotOf));
  (serverRecords || []).forEach((serverRecord) => {
    const matches = merged.filter((record) => record
      && record.date === serverRecord.date && record.timingKey === serverRecord.timingKey);
    if (!matches.length) {
      merged.push(serverRecord);
      counts.added += 1;
      return;
    }
    if (matches.some((record) => record.synced === false)) {
      counts.protected += 1;
      return;
    }
    // findRecord は「最後の1件」を返すため、UI が見ていた代表も最後の1件
    const primary = matches[matches.length - 1];
    const changed = matches.length > 1
      || primary.id !== serverRecord.id
      || mealRecordSignature(primary) !== mealRecordSignature(serverRecord);
    merged = merged.filter((record) => !matches.includes(record));
    merged.push({ ...primary, ...serverRecord, synced: true });
    if (!changed) {
      counts.unchanged += 1;
      return;
    }
    counts.updated += 1;
    // 収束で置換された旧 id を編集中だった場合は新 id に付け替える（編集消失防止）
    matches.forEach((record) => {
      if (state.editingRecordId === record.id) state.editingRecordId = serverRecord.id;
    });
    // 監査#12: 旧 record の鏡写しだった draft はサーバー更新に追従（削除→record 表示に委ねる）
    dropDraftIfMirrorsRecord(primary);
  });
  // [fix] 監査#5(B-2): サーバー側削除の伝播。取得窓（from〜to）内で「synced=true かつ
  // サーバー結果に同スロットが無い」ローカル record を削除する。synced=false（未送信）は保護。
  // 保険1: 呼び出し側が窓を明示した時だけ実行（fetchMealDetails 成功時のみ渡される想定）。
  // 保険2: 同期開始（startedAt）以降に更新された record は消さない（フェッチ中の保存との競合対策）。
  if (options.from && options.to) {
    const startedAt = Number(options.startedAt) || 0;
    merged = merged.filter((record) => {
      if (!record) return false;
      if (String(record.date || '') < options.from || String(record.date || '') > options.to) return true;
      if (record.synced === false) return true;
      if (serverSlots.has(slotOf(record))) return true;
      if (startedAt && Date.parse(record.updatedAt || '') >= startedAt) return true;
      counts.deleted += 1;
      if (state.editingRecordId === record.id) state.editingRecordId = null;
      // 監査#12: 削除された record の鏡写し draft も除去（残すと削除がマスクされ復活して見える）
      dropDraftIfMirrorsRecord(record);
      return false;
    });
  }
  merged.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.timingKey || '').localeCompare(String(b.timingKey || '')));
  saveRecords(merged);
  rebuildFoodUsage(merged);
  return counts;
}
/** user_settings（Supabase）1行 → localStorage の nutrition_targets_v1 形式。 */
function userSettingsToTargets(row) {
  const current = baseTargets();
  return {
    goal: String(row.goal || ''),
    energy: Number(row.target_kcal) || current.energy,
    protein: Number(row.target_p_g) || current.protein,
    fat: Number(row.target_f_g) || current.fat,
    carb: Number(row.target_c_g) || current.carb,
    profile: {
      age: Number(row.age) || '',
      sex: 'male',
      height: Number(row.height_cm) || '',
      weight: Number(row.weight_kg) || '',
      activity: row.activity_level || '',
      effort: row.effort || ''
    }
  };
}

/** meal_dining_context.note（`店名: X / 内容...`）→ 店名と内容に分解する。 */
function parseDiningNote(note) {
  const text = String(note || '').trim();
  if (!text) return { restaurantName: '', diningText: '' };
  if (text.startsWith('店名: ')) {
    const sep = text.indexOf(' / ');
    if (sep < 0) return { restaurantName: text.slice(4).trim(), diningText: '' };
    return { restaurantName: text.slice(4, sep).trim(), diningText: text.slice(sep + 3).trim() };
  }
  return { restaurantName: '', diningText: text };
}

/**
 * fetchMealDetails の結果 → 旧サーバー行（食事明細シートと同じキー）へ整形。
 * serverRowsToAppRecords（既存・検証済み）をそのまま再利用するための変換層で、
 * フロントのデータ形（DAY_SERVER_RECORDS）は変えない（SPEC-012 実装方針5）。
 */
function sbRowsFromMealDetails(data) {
  const rows = [];
  const itemsByMeal = {};
  (data.items || []).forEach((it) => {
    (itemsByMeal[it.meal_id] = itemsByMeal[it.meal_id] || []).push(it);
  });
  const ctxByMeal = {};
  (data.contexts || []).forEach((c) => { ctxByMeal[c.meal_id] = c; });
  (data.meals || []).forEach((meal) => {
    const timingKey = timingKeyFromLabel(meal.timing);
    const base = {
      '日付': meal.eaten_on,
      '区分': meal.timing,
      '区分キー': timingKey,
      'メモ': meal.memo || '',   // 監査#9: note 復元用（「… / メモ: 本文」形式）
      recordId: meal.legacy_record_id || meal.id
    };
    (itemsByMeal[meal.id] || []).forEach((it) => {
      rows.push({
        ...base,
        foodId: it.food_key || '',
        '名前': it.name || '',
        '量': it.qty == null ? '' : it.qty,
        '単位': it.unit || '',
        'グラム換算': it.grams == null ? '' : it.grams,
        '要確認フラグ': it.pending_review ? 'TRUE' : '',
        '推定kcal': it.est_kcal == null ? '' : it.est_kcal,
        '推定P_g': it.est_protein_g == null ? '' : it.est_protein_g,
        '推定F_g': it.est_fat_g == null ? '' : it.est_fat_g,
        '推定C_g': it.est_carb_g == null ? '' : it.est_carb_g
      });
    });
    const ctx = ctxByMeal[meal.id];
    if (ctx) {
      const parsed = parseDiningNote(ctx.note);
      rows.push({
        ...base,
        foodId: 'dining-out-pending',
        '名前': parsed.restaurantName ? `外食: ${parsed.restaurantName}` : '外食',
        '量': 1,
        '単位': '件',
        'グラム換算': '',
        '要確認フラグ': 'TRUE',
        '外食フラグ': 'TRUE',
        '店名': parsed.restaurantName,
        '外食内容': parsed.diningText
      });
    }
  });
  return rows;
}
function formatLastSync(ts) {
  if (!ts) return '最終同期: 未実行';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '最終同期: 未実行';
  return `最終同期: ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function updateSyncUi() {
  const syncing = Boolean(state.serverSyncing);
  if ($('#syncPill')) $('#syncPill').classList.toggle('show', syncing);
  if ($('#syncServerBtn')) $('#syncServerBtn').disabled = syncing;
  if ($('#lastSyncLabel')) $('#lastSyncLabel').textContent = formatLastSync(lsGet(LS_KEYS.LAST_SYNC, null));
}
async function syncFromServer(options = {}) {
  const manual = Boolean(options.manual);
  if (!navigator.onLine) {
    if (manual) showToast('オフラインのため同期できません');
    return { skipped: true, reason: 'offline' };
  }
  const last = Number(lsGet(LS_KEYS.LAST_SYNC, 0)) || 0;
  if (!manual && last && Date.now() - last < 30 * 60 * 1000) return { skipped: true, reason: 'fresh' };
  state.serverSyncing = true;
  updateSyncUi();
  try {
    const sb = await window.HSSupabaseReady;
    const session = await sb.getSession();
    if (!session) {
      if (manual) { showToast('ログインすると同期できます'); openLoginSheet('login'); }
      return { skipped: true, reason: 'no-session' };
    }
    // 60日分を取得する（2026-07-13）。14日では ①「いつもの」の学習母集団が足りない
    // ②継続ヒートマップ（8週=56日）が古い週まで空欄になる。meals は全期間で75件なので負荷は無視できる
    const from = shiftDate(todayStr(), -59);
    const to = todayStr();
    // 未送信キューにあるものは server→local で上書きしない（監査#10/#33: オフライン編集の巻き戻り防止）
    const queuedKeys = new Set((window.HSSbQueue && window.HSSbQueue.load ? window.HSSbQueue.load() : []).map((e) => e && e.key));
    const settingsRow = await sb.fetchUserSettings();
    if (settingsRow && !queuedKeys.has('settings_save')) {
      lsSet(LS_KEYS.NUTRITION_TARGETS, userSettingsToTargets(settingsRow));
      if (settingsRow.show_hydration != null) {
        lsSet(SHOW_HYDRATION_KEY, Boolean(settingsRow.show_hydration));
        applyHydrationVisibility();
      }
    }
    // 監査#5: 削除伝播は fetchMealDetails が正常応答した時のみ（窓を渡した時のみ実行される）。
    // 取得失敗時はこの先に到達しないため、部分データでの大量削除は起きない。
    const syncStartedAt = Date.now();
    const details = await sb.fetchMealDetails(from, to);
    const serverRecords = serverRowsToAppRecords(sbRowsFromMealDetails(details));
    lsSet(LS_KEYS.DAY_SERVER_RECORDS, serverRecords);
    const counts = mergeServerMealRecords(serverRecords, { from, to, startedAt: syncStartedAt });
    // テンプレート（普段の食事セット）: サーバー → localStorage へ反映（SPEC-014）
    try {
      const templates = await sb.fetchMealTemplates();
      if (templates && templates.length) {
        const presets = loadPresets();
        templates.forEach((t) => {
          const timing = t.timing || 'morning';
          const list = Array.isArray(presets[timing]) ? presets[timing] : [];
          const preset = { id: t.legacy_key || t.id, name: t.name, items: t.items || [] };
          if (queuedKeys.has(`template_save:${preset.id}`)) return;   // 未送信のローカル編集を優先（監査#33）
          const idx = list.findIndex((p) => p && p.id === preset.id);
          if (idx >= 0) list[idx] = { ...list[idx], ...preset }; else list.push(preset);
          presets[timing] = list;
        });
        lsSet(LS_KEYS.MEAL_PRESET, presets);
      }
    } catch (e) { /* テンプレ同期は非致命 */ }
    // 体組成（タニタ/eufy/手入力）: サーバー → 表示キャッシュ（読取のみ・非致命）
    try {
      const bodyRows = await sb.fetchRecentBodyComposition(30);
      lsSet(BODY_SERVER_CACHE_KEY, { fetchedAt: new Date().toISOString(), rows: bodyRows || [] });
      bodyServerFetchedAt = Date.now();
      if (state.view === 'body') renderBodyView();
    } catch (e) { /* 非致命 */ }
    lsSet(LS_KEYS.LAST_SYNC, Date.now());
    if (state.view === 'meal') loadMealFor(state.date, state.timing);
    renderQuickRow();
    renderItems();
    renderHydration();
    renderHome();
    if (manual) {
      showToast(counts.added || counts.updated || counts.deleted
        ? `同期しました（追加${counts.added}・更新${counts.updated}${counts.deleted ? `・削除${counts.deleted}` : ''}）`
        : '同期しました（サーバーと一致しています）');
    }
    return { status: 'ok', ...counts };
  } catch (err) {
    if (manual) showToast(`同期エラー: ${String(err && err.message ? err.message : err)}`, 'error');
    return { status: 'error', message: String(err && err.message ? err.message : err) };
  } finally {
    state.serverSyncing = false;
    updateSyncUi();
  }
}
function maybeAutoSyncFromServer() {
  syncFromServer({ manual: false }).catch(() => {});
}
