// food-domain.js — 食品ドメイン純ロジック（SPEC-014: foodsカタログ変換・単位テンプレ・
// IndexedDBカタログキャッシュ・レシピ栄養計算・サーバー保存・localStorage資産の昇格）。
// app.html から挙動不変で切り出し（監査 9-1 第2歩。js/charts.js と同方式の classic script）。
//
// 依存（app.html / 他モジュールのグローバルに実行時解決で依存する。読み込み順は
// inline より前だが、呼び出し時には定義済みなので関数参照でよい。charts.js の前例に倣う）:
//   - js/storage.js           : lsGet / lsSet / LS_KEYS
//   - js/supabase-client.js   : window.HSSupabaseReady / window.HSSbQueue
//   - js/sync.js              : queueWithToast / foodsKeyMap / FOODS_MAP_KEY /
//       foodIdForKey / toNumOrNull（監査9-1 第3歩で app.html inline から移動。実行時解決）
//   - app.html inline         : state / buildCatalog / renderSearch / renderHome /
//       renderSyncStatus / showToast / getFoodById / createMealItem /
//       buildStructuredItem / recipeToCatalogFood / loadPresets
// DOM を触る関数（buildCatalog / renderSearch 系）は app.html 側に残している。
'use strict';

// ================================================================
// 食品ドメイン層（SPEC-014: foods統合カタログ・localStorage資産の昇格・レシピ）
// 設計の正: docs/meal_domain_redesign_2026-07-11.md §2
// - foods（Supabase）がカタログの唯一の正。埋め込み（nutrition-db/food-catalog）は
//   公式278件の表示品質（単位のstep等）とオフライン初回のフォールバックに使う。
// - 追加・編集は owner=自分 の foods 行。冪等キーは legacy_key（フロントの文字列id）。
// ================================================================
// v3: staple(U2) + 常用単位テンプレ(E5)。旧キャッシュは自動で無効化され再取得される
const FOODS_CACHE_KEY = 'hs:foods-cache:v3';
const FOOD_MIGRATED_KEY = 'hs:food-migrated:v1';

function makeUserFoodId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---- E5: 八訂食材の常用単位テンプレ（g だけでは「のり1枚」「卵1個」が入力できない）----
// 代表的な1回量（g）。出典は日本食品標準成分表の「目安量」および一般的な流通規格。
// 名前の前方一致（クリーニング済みの表示名に対して）で判定し、g は常に末尾に残す。
const UNIT_TEMPLATES = [
  [/^卵|^鶏卵|^うずら/, [['個', 50, 0.5]]],
  [/^ご飯/, [['膳', 150, 0.5]]],
  [/^食パン/, [['枚', 60, 0.5]]],
  [/^うどん|^そば|^中華麺|^パスタ|^スパゲッティ|^そうめん/, [['玉', 200, 0.5], ['束', 100, 0.5]]],
  [/^納豆/, [['パック', 45, 1]]],
  [/^豆腐|^木綿豆腐|^絹ごし豆腐/, [['丁', 300, 0.5], ['パック', 150, 0.5]]],
  [/^厚揚げ|^油揚げ/, [['枚', 30, 0.5]]],
  [/^牛乳|^豆乳/, [['杯', 200, 0.5]]],
  [/^ヨーグルト/, [['カップ', 100, 0.5], ['大スプーン', 15, 1]]],
  [/^鮭|^さば|^あじ|^さんま|^ぶり|^たら|^かじき|^銀鮭|^紅鮭|^たい/, [['切れ', 80, 0.5]]],
  [/^いわし|^ししゃも/, [['尾', 60, 1]]],
  [/^まぐろ|^かつお/, [['さく', 100, 0.5], ['切れ', 80, 0.5]]],
  [/^鶏むね|^鶏もも/, [['枚', 250, 0.25], ['100g', 100, 0.5]]],
  [/^豚|^牛(?!乳)/, [['100g', 100, 0.5], ['枚', 30, 1]]],
  [/^ハム|^ベーコン/, [['枚', 20, 1]]],
  [/^ウインナー|^ソーセージ/, [['本', 20, 1]]],
  [/^のり|^あまのり|^焼きのり/, [['枚', 3, 1]]],
  [/^わかめ/, [['小鉢', 20, 1]]],
  [/^ほうれん草|^小松菜|^チンゲン菜|^春菊/, [['束', 200, 0.25], ['皿', 70, 0.5]]],
  [/^キャベツ|^白菜|^レタス/, [['枚', 50, 1], ['皿', 100, 0.5]]],
  [/^ブロッコリー/, [['房', 30, 1], ['皿', 80, 0.5]]],
  [/^トマト/, [['個', 150, 0.5]]],
  [/^ミニトマト|^プチトマト/, [['個', 15, 1]]],
  [/^きゅうり|^にんじん|^ねぎ|^長ねぎ/, [['本', 100, 0.5]]],
  [/^玉ねぎ|^じゃがいも|^なす|^かぼちゃ/, [['個', 150, 0.5]]],
  [/^ピーマン/, [['個', 35, 1]]],
  [/^大根/, [['本', 800, 0.1], ['輪切り', 100, 0.5]]],
  [/^しいたけ|^マッシュルーム/, [['個', 15, 1]]],
  [/^しめじ|^えのき|^舞茸|^エリンギ|^なめこ/, [['パック', 100, 0.5]]],
  [/^バナナ/, [['本', 90, 0.5]]],
  [/^りんご|^梨|^柿/, [['個', 250, 0.25]]],
  [/^みかん|^キウイ/, [['個', 80, 0.5]]],
  [/^いちご/, [['粒', 15, 1]]],
  [/^アボカド/, [['個', 140, 0.5]]],
  [/^さつまいも|^長芋|^里芋/, [['個', 200, 0.25]]],
  // 調味料は八訂だと「うすくちしょうゆ」「米みそ 甘みそ」等なので部分一致も拾う
  [/^味噌|^醤油|^みりん|^酒|^ケチャップ|^マヨネーズ|^ソース|しょうゆ|みそ(?!汁)|^食塩|^酢/, [['大さじ', 18, 0.5], ['小さじ', 6, 1]]],
  [/^砂糖|^小麦粉|^薄力粉|^強力粉|^中力粉|^片栗粉|^パン粉/, [['大さじ', 9, 0.5]]],
  [/木綿豆腐|絹ごし豆腐|^豆腐/, [['丁', 300, 0.5], ['パック', 150, 0.5]]],
  [/^オリーブ油|^サラダ油|^ごま油|^バター/, [['大さじ', 12, 0.5], ['小さじ', 4, 1]]],
  [/^チーズ|^プロセスチーズ/, [['個', 18, 1], ['スライス', 18, 1]]],
  [/^オートミール/, [['食分', 30, 0.5]]],
  [/^くるみ|^アーモンド|^カシューナッツ|^ピーナッツ/, [['粒', 1.5, 5]]]
];
/** g のみの食材に常用単位を足す（g は末尾に温存。既に人間向け単位があれば触らない） */
function applyUnitTemplate(name, units) {
  let list = Array.isArray(units) ? units : [];
  // [fix] 2026-07-14: どの食材でも g で入力できるようにする（レシピの秤量・微調整に必須）。
  // ml しか無い液体（コーヒー・味噌汁など）にも g を足す（水分は ml≒g）
  if (!list.some((u) => u && u.label === 'g')) {
    const ml = list.find((u) => u && u.label === 'ml');
    list = list.concat([{ label: 'g', grams: ml ? ml.grams : 1, step: 10, defaultQty: 100 }]);
  }
  const hasHuman = list.some((u) => u && u.label !== 'g' && u.label !== 'ml');
  if (hasHuman || !name) return list;
  const hit = UNIT_TEMPLATES.find(([re]) => re.test(name));
  if (!hit) return list;
  const added = hit[1].map(([label, grams, step]) => ({ label, grams, step, defaultQty: 1 }));
  const gramUnit = list.find((u) => u && u.label === 'g') || { label: 'g', grams: 1, step: 10, defaultQty: 100 };
  return [...added, gramUnit];
}

/** foods 行 → フロントのカタログ食品オブジェクト。 */
function serverFoodToCatalog(row) {
  if (!row || !row.name) return null;
  const meta = row.meta || {};
  const id = row.legacy_key || row.id;
  const base = {
    id,
    serverId: row.id,
    owner: row.owner || null,
    kind: row.kind || 'ingredient',
    name: row.name,
    shortName: meta.shortName || '',                  // 候補表示用の短縮名（長い商品名の折返し対策。監査 4-4）
    brand: row.brand || '',
    kana: row.kana || '',
    category: meta.category || '共通',
    entryType: meta.entryType || (row.kind === 'product' ? 'product' : row.kind === 'recipe' ? 'recipe' : 'food'),
    keywords: meta.keywords || (row.kana ? [row.kana] : []),
    primaryVariant: meta.primary !== false,           // 八訂の状態バリアント集約（SPEC-018）
    variantTokens: meta.variant_tokens || [],
    staple: meta.staple === true,                     // 定番食品（U2: 候補プールの母集団）
    diningRough: meta.diningRough === true,           // 外食ざっくり記録の概算エントリ（2026-08-05）

    pendingReview: Boolean(row.pending_review),
    source: row.source || '',
    verified: Boolean(row.verified),
    recipeServings: row.recipe_servings || null
  };
  if (row.mode === 'perUnit') {
    const pu = row.per_unit || {};
    return {
      ...base,
      mode: 'perUnit',
      unitLabel: row.unit_label || meta.unitLabel || '個',
      macrosPerUnit: {
        kcal: Number(pu.kcal ?? pu.energy) || 0,
        p: Number(pu.p ?? pu.protein) || 0,
        f: Number(pu.f ?? pu.fat) || 0,
        c: Number(pu.c ?? pu.carb) || 0
      },
      perUnitNutrients: pu,
      micros: row.micros || {},
      defaultQty: Number(meta.defaultQty) || 1,
      step: Number(meta.step) || 1
    };
  }
  // per100g。units は 新形式=配列 / 旧seed形式={label: grams} の両対応
  let units = null;
  if (Array.isArray(row.units)) units = row.units;
  else if (row.units && typeof row.units === 'object') {
    units = Object.entries(row.units).map(([label, grams]) => ({
      label, grams: Number(grams) || 1, step: label === 'g' ? 10 : 1, defaultQty: label === 'g' ? 100 : 1
    }));
    // 'g' 以外を先頭に（人間向け単位優先）
    units.sort((a, b) => (a.label === 'g' ? 1 : 0) - (b.label === 'g' ? 1 : 0));
  }
  return {
    ...base,
    mode: 'per100g',
    macros: {
      kcal: Number(row.kcal_per_100g) || 0,
      p: Number(row.protein_g) || 0,
      f: Number(row.fat_g) || 0,
      c: Number(row.carb_g) || 0
    },
    saltPer100g: row.salt_g == null ? null : Number(row.salt_g),
    fiberPer100g: row.fiber_g == null ? null : Number(row.fiber_g),
    micros: row.micros || {},
    // [fix] E5: 八訂食材は g のみで「1個/1枚/1切れ」が使えなかった → 常用単位の辞書を当てる
    units: applyUnitTemplate(base.name, units || [{ label: 'g', grams: 1, step: 10, defaultQty: 100 }])
  };
}

/** フロントのカタログ食品オブジェクト → foods 行（upsert 用）。 */
function catalogFoodToRow(food) {
  const perUnit = food.mode === 'perUnit';
  const m = perUnit ? (food.macrosPerUnit || {}) : (food.macros || {});
  return {
    legacy_key: food.id,
    kind: food.kind || (food.entryType === 'product' ? 'product' : food.entryType === 'recipe' ? 'recipe' : 'ingredient'),
    name: food.name,
    brand: food.brand || null,
    kana: food.kana || null,
    mode: perUnit ? 'perUnit' : 'per100g',
    unit_label: perUnit ? (food.unitLabel || '個') : null,
    units: perUnit ? null : (food.units || null),
    per_unit: perUnit ? { kcal: m.kcal || 0, p: m.p || 0, f: m.f || 0, c: m.c || 0, ...(food.perUnitNutrients || {}) } : null,
    kcal_per_100g: perUnit ? null : (m.kcal ?? null),
    protein_g: perUnit ? null : (m.p ?? null),
    fat_g: perUnit ? null : (m.f ?? null),
    carb_g: perUnit ? null : (m.c ?? null),
    salt_g: perUnit ? null : (food.saltPer100g ?? null),
    fiber_g: perUnit ? null : (food.fiberPer100g ?? null),
    micros: food.micros || {},
    source: food.source || 'manual',
    verified: Boolean(food.verified),
    pending_review: Boolean(food.pendingReview),
    coverage: food.coverage || 'partial',
    recipe_servings: food.recipeServings ?? null,
    recipe_total_g: food.recipeTotalG ?? null,
    archived: false,
    meta: {
      category: food.category || '共通',
      keywords: food.keywords || [],
      entryType: food.entryType || null,
      defaultQty: food.defaultQty ?? null,
      step: food.step ?? null,
      unitLabel: food.unitLabel ?? null,
      ...(food.staple ? { staple: true } : {})   // 定番マークを往復で落とさない（U2）
    }
  };
}

// ============================================================
// カタログキャッシュ（E7 容量問題の恒久対策 2026-07-13）
//
// 実測: 食品カタログ 2,779件のキャッシュだけで **4.2MB**、localStorage 合計 5.35MB。
// iOS Safari の localStorage は約5MBが上限で、**iPhoneでは保存が黙って失敗する**危険があった
// （PWAでカタログが更新されない = 定番マークや新食品が反映されない）。
// → カタログだけ **IndexedDB**（容量制限が緩い）へ移す。他の資産（記録・下書き・キュー）は
//   合計1MB程度なので localStorage のままでよい。
//
// 同期APIを保つため、インメモリ（foodsCacheMem）を正とし、IndexedDB へは非同期で書き戻す。
// 起動時: 埋め込みだけでカタログを組む → IDB 読込完了後に再構築（体感の遅延なし）。
// ============================================================
const IDB_NAME = 'hs-foods';
const IDB_STORE = 'cache';
let foodsCacheMem = { fetchedAt: 0, foods: [] };
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
/** 同期API（既存コードはこのまま使える）。正はインメモリ */
function loadFoodsCache() {
  return foodsCacheMem && Array.isArray(foodsCacheMem.foods) ? foodsCacheMem : { fetchedAt: 0, foods: [] };
}
// localStorage 側の旧カタログキャッシュ（各2〜4MB）は容量を圧迫するので全て掃除する
const STALE_FOODS_CACHE_KEYS = ['hs:foods-cache:v1', 'hs:foods-cache:v2', 'hs:foods-cache:v3'];
function purgeStaleFoodsCaches() {
  STALE_FOODS_CACHE_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch (e) { /* noop */ }
  });
}
function saveFoodsCache(cache) {
  foodsCacheMem = cache;                                   // 同期的に反映（描画は即）
  // 保存時は派生フィールド（_hay: 検索用の正規化文字列）を落とす（容量の無駄・再計算できる）
  const slim = {
    fetchedAt: cache.fetchedAt,
    foods: (cache.foods || []).map((f) => {
      if (!f || !f._hay) return f;
      const { _hay, ...rest } = f;
      return rest;
    })
  };
  idbSet('foods', slim).catch(() => {
    showToast('カタログの保存に失敗しました（端末の空き容量不足）', 'error');
  });
}
/** 起動時に IndexedDB から読み込む。localStorage に旧キャッシュがあれば1回だけ移行する */
async function initFoodsCache() {
  try {
    const legacy = lsGet(FOODS_CACHE_KEY, null);           // 旧 localStorage 版からの移行
    if (legacy && Array.isArray(legacy.foods) && legacy.foods.length) {
      foodsCacheMem = legacy;
      await idbSet('foods', legacy);
    } else {
      const stored = await idbGet('foods');
      if (stored && Array.isArray(stored.foods)) foodsCacheMem = stored;
    }
  } catch (e) { /* IDB不可の端末では埋め込みカタログのみで動く */ }
  purgeStaleFoodsCaches();                                 // localStorage から4MBを解放
  buildCatalog();
  if (state.view === 'meal') renderSearch();
  renderHome();
}

/** カタログキャッシュへ1件マージ（オフライン追加でも即・検索/記録に出すため）。 */
function mergeFoodIntoCache(food) {
  const cache = loadFoodsCache();
  const idx = cache.foods.findIndex((f) => f && f.id === food.id);
  if (idx >= 0) cache.foods[idx] = food; else cache.foods.push(food);
  saveFoodsCache(cache);
  buildCatalog();
}
function removeFoodFromCache(foodId) {
  const cache = loadFoodsCache();
  cache.foods = cache.foods.filter((f) => f && f.id !== foodId);
  saveFoodsCache(cache);
  buildCatalog();
}

/** サーバーからカタログ全量を取得してキャッシュを更新する（TTL 24h・失敗は無視）。 */
async function refreshFoodsCatalog(force = false) {
  try {
    const cache = loadFoodsCache();
    if (!force && cache.fetchedAt && Date.now() - cache.fetchedAt < 24 * 60 * 60 * 1000) return;
    const sb = await window.HSSupabaseReady;
    const rows = await sb.fetchFoodsCatalog();
    const foods = rows.map(serverFoodToCatalog).filter(Boolean);
    saveFoodsCache({ fetchedAt: Date.now(), foods });
    // legacy_key → uuid の対応もここから更新（food_id 併記用）
    foodsKeyMap = {};
    foods.forEach((f) => { if (f.serverId) foodsKeyMap[f.id] = f.serverId; });
    lsSet(FOODS_MAP_KEY, { fetchedAt: Date.now(), map: foodsKeyMap });
    buildCatalog();
    if (state.view === 'meal') renderSearch();
  } catch (e) { /* 未ログイン・オフライン時は既存キャッシュ/埋め込みで動く */ }
}

/** 材料リスト（{foodId, name, qty, unit, pendingReview, est}）から合計栄養を計算する。 */
function computeRecipeNutrition(items, servings) {
  const n = Math.max(1, Number(servings) || 1);
  const totals = {};   // 全栄養素キー → 合計
  const macro = { kcal: 0, p: 0, f: 0, c: 0 };
  let grams = 0;
  (items || []).forEach((it) => {
    if (it.free) {
      macro.kcal += Number(it.estKcal) || 0;
      macro.p += Number(it.estProteinG) || 0;
      macro.f += Number(it.estFatG) || 0;
      macro.c += Number(it.estCarbG) || 0;
      totals.energy = (totals.energy || 0) + (Number(it.estKcal) || 0);
      totals.protein = (totals.protein || 0) + (Number(it.estProteinG) || 0);
      totals.fat = (totals.fat || 0) + (Number(it.estFatG) || 0);
      totals.carb = (totals.carb || 0) + (Number(it.estCarbG) || 0);
      return;
    }
    const food = getFoodById(it.foodId);
    if (!food) return;
    const mealItem = createMealItem(food, it.qty, it.unit);
    grams += Number(mealItem.grams) || 0;
    const structured = buildStructuredItem(mealItem);
    const nutrients = (structured && structured.nutrients) || {};
    Object.entries(nutrients).forEach(([k, v]) => {
      if (Number.isFinite(Number(v))) totals[k] = (totals[k] || 0) + Number(v);
    });
    macro.kcal += mealItem.kcal || 0; macro.p += mealItem.p || 0;
    macro.f += mealItem.f || 0; macro.c += mealItem.c || 0;
  });
  const perServing = {};
  Object.entries(totals).forEach(([k, v]) => { perServing[k] = Math.round((v / n) * 100) / 100; });
  return {
    perServing,
    macrosPerServing: {
      kcal: Math.round(macro.kcal / n),
      p: Math.round(macro.p / n * 10) / 10,
      f: Math.round(macro.f / n * 10) / 10,
      c: Math.round(macro.c / n * 10) / 10
    },
    totalGrams: grams || null
  };
}

// ---- 保存（Supabase 本線 + 失敗時キュー。payload運搬型: legacy_key upsert で冪等） ----
async function pushUserFoodToServer(food) {
  const sb = await window.HSSupabaseReady;
  const saved = await sb.upsertUserFood(catalogFoodToRow(food));
  if (saved && saved.id) { food.serverId = saved.id; foodsKeyMap[food.id] = saved.id; }
  mergeFoodIntoCache(food);
}
function saveUserFood(food, label) {
  mergeFoodIntoCache(food);  // 先にローカル反映（即・検索/記録に出る）
  return pushUserFoodToServer(food)
    .then(() => { showToast(`${label}: 保存しました ✓`); renderSyncStatus(); })
    .catch((err) => queueWithToast('food_save', `food_save:${food.id}`, { food }, label, err));
}
async function pushRecipeToServer(recipe) {
  const sb = await window.HSSupabaseReady;
  const foodId = await sb.saveRecipe(catalogFoodToRow(recipe.food), recipe.items.map((it) => ({
    ingredientFoodId: it.free ? null : (foodIdForKey(it.foodId) || (getFoodById(it.foodId) || {}).serverId || null),
    name: it.name,
    qty: toNumOrNull(it.qty),
    unit: it.unit || null,
    grams: it.free ? null : toNumOrNull(it.grams),
    estKcal: it.free ? toNumOrNull(it.estKcal) : null,
    estProteinG: it.free ? toNumOrNull(it.estProteinG) : null,
    estFatG: it.free ? toNumOrNull(it.estFatG) : null,
    estCarbG: it.free ? toNumOrNull(it.estCarbG) : null,
    pendingReview: Boolean(it.pendingReview || it.free)
  })));
  recipe.food.serverId = foodId;
  foodsKeyMap[recipe.food.id] = foodId;
  mergeFoodIntoCache(recipe.food);
}
// ---- レシピ材料のローカル控え（E4: オフライン作成レシピを編集すると材料が消える問題）----
// サーバー（recipe_items）が正だが、未送信・オフライン時は復元できないためローカルにも持つ。
const RECIPE_ITEMS_KEY = 'hs:recipe-items:v1';
function loadRecipeItemsLocal(foodId) {
  const all = lsGet(RECIPE_ITEMS_KEY, null) || {};
  return Array.isArray(all[foodId]) ? all[foodId] : null;
}
function saveRecipeItemsLocal(foodId, items) {
  const all = lsGet(RECIPE_ITEMS_KEY, null) || {};
  all[foodId] = items || [];
  lsSet(RECIPE_ITEMS_KEY, all);
}
function saveRecipeLocal(recipe) {
  mergeFoodIntoCache(recipe.food);
  saveRecipeItemsLocal(recipe.food.id, recipe.items);   // [fix] E4: 材料をローカルにも残す
  return pushRecipeToServer(recipe)
    .then(() => { showToast('レシピを保存しました ✓'); renderSyncStatus(); })
    .catch((err) => queueWithToast('recipe_save', `recipe_save:${recipe.food.id}`, { recipe }, 'レシピ', err));
}
async function pushTemplateToServer(tpl) {
  const sb = await window.HSSupabaseReady;
  await sb.upsertMealTemplate({
    legacy_key: tpl.id, name: tpl.name, timing: tpl.timing || null,
    items: tpl.items || [], sort_order: tpl.sortOrder ?? null
  });
}

// ---- localStorage 資産の昇格（初回1回・冪等。元データは消さない） ----
async function promoteLocalFoodStores() {
  if (lsGet(FOOD_MIGRATED_KEY, false)) return;
  const sb = await window.HSSupabaseReady;
  if (!(await sb.getSession())) return;   // ログイン後に再試行される
  let promoted = 0;
  const enqueue = (op, key, data) => { window.HSSbQueue.enqueue(op, key, data); };

  const customFoods = lsGet(LS_KEYS.MEAL_CUSTOM_FOODS, []) || [];
  const products = lsGet(LS_KEYS.MEAL_PRODUCTS, []) || [];
  for (const f of [...customFoods, ...products]) {
    if (!f || !f.id || !f.name) continue;
    const food = { ...f, kind: f.entryType === 'product' || String(f.id).startsWith('prod-') ? 'product' : 'ingredient',
      source: f.source || 'manual', owner: 'me' };
    try { await pushUserFoodToServer(food); promoted++; }
    catch (e) { enqueue('food_save', `food_save:${food.id}`, { food }); }
  }
  const recipes = lsGet(LS_KEYS.MEAL_RECIPES, []) || [];
  for (const r of recipes) {
    const catalogFood = recipeToCatalogFood(r);
    if (!catalogFood) continue;
    const items = (r.items || []).map((it) => ({
      foodId: it.foodId, name: (getFoodById(it.foodId) || {}).name || it.foodId,
      qty: it.qty, unit: it.unit, grams: (createMealItem(getFoodById(it.foodId) || { id: it.foodId, name: '', mode: 'perUnit', macrosPerUnit: {} }, it.qty, it.unit) || {}).grams,
      pendingReview: false
    })).filter((it) => it.name);
    const recipe = { food: { ...catalogFood, kind: 'recipe', recipeServings: Math.max(1, Number(r.servings) || 1), source: 'recipe', owner: 'me' }, items };
    try { await pushRecipeToServer(recipe); promoted++; }
    catch (e) { enqueue('recipe_save', `recipe_save:${recipe.food.id}`, { recipe }); }
  }
  const presets = loadPresets();
  let order = 0;
  for (const timing of Object.keys(presets || {})) {
    for (const p of presets[timing] || []) {
      if (!p || !p.id || !p.items) continue;
      const tpl = { id: p.id, name: p.name || 'セット', timing, items: p.items, sortOrder: order++ };
      try { await pushTemplateToServer(tpl); promoted++; }
      catch (e) { enqueue('template_save', `template_save:${tpl.id}`, { tpl }); }
    }
  }
  lsSet(FOOD_MIGRATED_KEY, { at: Date.now(), promoted });
  // 昇格した食品で food_id 未解決の過去明細を自動接続
  try {
    const own = {};
    loadFoodsCache().foods.forEach((f) => { if (f.owner && f.serverId) own[f.id] = f.serverId; });
    if (Object.keys(own).length) {
      const relinked = await sb.relinkMealItems(own);
      if (relinked) console.info(`[food-domain] 過去明細の food_id を ${relinked} 行接続しました`);
    }
  } catch (e) { /* 次回同期時にリトライ可能（非致命） */ }
  if (promoted) showToast(`独自食材・商品・レシピ・セット ${promoted}件をサーバーへ引き継ぎました`);
}
