// nutrition-calc.js — 栄養計算・目標値算出・過不足判定エンジン
// nutrition-db.js より後に読み込むこと（window.HSNutritionDB を参照）。

'use strict';

// ----------------------------------------------------------------
// 公開: 摂取栄養素の積算
// ----------------------------------------------------------------

/**
 * 食事アイテムリストから摂取栄養素合計を返す。
 * item は {nutrients, ...} または NUTRITION_DB.structureItem で解決できる形式。
 *
 * @param {Array<object>} items  食事アイテムの配列
 * @returns {{ energy:number, protein:number, fat:number, carb:number, reviewCount:number }}
 */
function sumNutrients(items) {
  const db = window.HSNutritionDB || null;

  return (items || []).reduce((acc, item) => {
    // nutrients フィールドがあればそのまま使う
    let n = item.nutrients || null;

    // なければ HSNutritionDB.structureItem で解決を試みる
    if (!n && db && db.structureItem) {
      const structured = db.structureItem(item, null);
      n = structured && structured.nutrients ? structured.nutrients : null;
    }

    if (n) {
      acc.energy  += n.energy  || 0;
      acc.protein += n.protein || 0;
      acc.fat     += n.fat     || 0;
      acc.carb    += n.carb    || 0;
    }
    acc.reviewCount += item.pendingReview ? 1 : 0;
    return acc;
  }, { energy: 0, protein: 0, fat: 0, carb: 0, reviewCount: 0 });
}

// ----------------------------------------------------------------
// 公開: 目標値算出（あすけん式）
// ----------------------------------------------------------------

/**
 * 個人プロフィールから 1 日の目標栄養値を算出する。
 * 国立健康・栄養研究所式基礎代謝 × PAL ± 調整（あすけん方式 PFC 比）。
 *
 * @param {{
 *   age: number,
 *   weight: number,    // kg
 *   height: number,    // cm
 *   activity: number,  // PAL: 1.3 / 1.5 / 1.7 / 1.9
 *   effort: string,    // 'diet' | 'balance' | 'exercise'
 *   goal: string       // 'cut' | 'maintain' | 'bulk'
 * }} profile
 * @returns {{ energy:number, protein:number, fat:number, carb:number }}
 */
function calcTargets(profile) {
  const age      = Number(profile.age)      || 30;
  const weight   = Number(profile.weight)   || 65;
  const height   = Number(profile.height)   || 170;
  const activity = Number(profile.activity) || 1.5;
  const effort   = profile.effort || 'balance';
  const goal     = profile.goal   || 'maintain';

  // 国立健康・栄養研究所式 基礎代謝（kcal/day）
  // [fix] 現在は男性固定（sex_factor=1）。女性対応時は sex_factor を引数で受け取ること。
  const bmr = ((0.1238 + 0.0481 * weight + 0.0234 * height - 0.0138 * age - 0.5473 * 1) * 1000) / 4.186;

  // 推定エネルギー必要量（10 kcal 単位で丸め）
  let energy = Math.round((bmr * activity) / 10) * 10;

  // 目標調整（減量 230 kcal / 増量 150 kcal）
  // dietShare: 減量分を食事側に割り振る比率
  //   diet: 食事中心 (10:0) → 1.0
  //   balance: 食事+運動 (7:3) → 0.7
  //   exercise: 運動中心 (3:7) → 0.3
  const dietShare = effort === 'diet' ? 1.0 : (effort === 'exercise' ? 0.3 : 0.7);
  if (goal === 'cut')  energy -= Math.round(230 * dietShare);
  if (goal === 'bulk') energy += 150;

  // 下限 1000 / 上限 5000 でクランプ
  energy = Math.max(1000, Math.min(5000, energy));

  // あすけん方式 PFC 比（P18% / F25% / C55%）
  const protein = Math.round((energy * 0.18 / 4) / 5) * 5;   // 5g 単位
  const fat     = Math.round((energy * 0.25 / 9) / 5) * 5;   // 5g 単位
  const carb    = Math.round((energy * 0.55 / 4) / 10) * 10; // 10g 単位

  return { energy, protein, fat, carb };
}

// ----------------------------------------------------------------
// 公開: 過不足判定
// ----------------------------------------------------------------

/**
 * 摂取量と目標値を比較し、各栄養素の過不足判定リストを返す。
 *
 * @param {{ energy:number, protein:number, fat:number, carb:number }} intake
 * @param {{ energy:number, protein:number, fat:number, carb:number }} targets
 * @returns {Array<{ key:string, name:string, unit:string, intake:number, target:number, status:'low'|'ok'|'high', ratio:number }>}
 */
function judgeNutrients(intake, targets) {
  const KEYS = [
    { key: 'energy',  name: 'カロリー',   unit: 'kcal' },
    { key: 'protein', name: 'たんぱく質', unit: 'g' },
    { key: 'fat',     name: '脂質',       unit: 'g' },
    { key: 'carb',    name: '炭水化物',   unit: 'g' }
  ];

  return KEYS.map(({ key, name, unit }) => {
    const actual = Number(intake[key])  || 0;
    const target = Number(targets[key]) || 1;
    const ratio  = actual / target;
    const status = ratio < 0.8 ? 'low' : ratio > 1.2 ? 'high' : 'ok';
    return { key, name, unit, intake: actual, target, status, ratio };
  });
}

// ----------------------------------------------------------------
// 公開: 不足栄養素への食材提案
// ----------------------------------------------------------------

/**
 * 不足栄養素リストに対して、その栄養素を多く含む食材を逆引きする。
 * window.HSNutritionDB が利用可能な場合のみ動作する。
 *
 * @param {Array<{ key:string, name:string }>} deficits  status==='low' の nutrient リスト
 * @param {number} [topN=3]  1栄養素あたり何件返すか
 * @returns {Array<{ nutrientKey:string, nutrientName:string, foods:Array<{id:string, name:string, value:number}> }>}
 */
function suggestFoods(deficits, topN = 3) {
  const db = window.HSNutritionDB;
  if (!db) return [];

  const foods = db.FOODS || [];

  return (deficits || []).map(({ key, name }) => {
    const sorted = foods
      .filter(food => food.per100g && food.per100g[key] != null)
      .sort((a, b) => (b.per100g[key] || 0) - (a.per100g[key] || 0))
      .slice(0, topN)
      .map(food => ({ id: food.id, name: food.name, value: food.per100g[key] }));
    return { nutrientKey: key, nutrientName: name, foods: sorted };
  });
}

// ----------------------------------------------------------------
// 公開: 今日のスコア（Cockpit と day.html で共有）2026-05-29 (cowork)
// ----------------------------------------------------------------
// 以前は index.html と day.html に同一の100点式が二重実装されていた（仕様変更時に
// 両方直す必要があった）ため共通化。micros(微量栄養素)を持たない食品=外食/簡易記録が
// 多い日は不足判定を誤るので、microsCoverage(微量栄養素を持つ食品由来エネルギー比)で
// 微量栄養素の減点をゲートする。

var _MACRO_KEYS = { energy: 1, protein: 1, fat: 1, carb: 1, salt: 1, Na: 1 };

// nutrition-db の food エントリが微量栄養素を1つでも持つか
function foodHasMicros(food) {
  if (!food) return false;
  var src = food.per100g || food.perUnit || null;
  if (!src) return false;
  for (var k in src) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    if (_MACRO_KEYS[k]) continue;
    if (Number(src[k]) > 0) return true;
  }
  return false;
}

/**
 * 今日のスコア(100点)。energy逸脱・PFC逸脱・微量栄養素の不足/過剰から減点。
 * @param {object} nutrients 摂取栄養素合計
 * @param {object} targets   実効目標(energy/protein/fat/carb)
 * @param {object} [opts] { META, microsCoverage(0-1), microsThreshold=0.6 }
 * @returns {{score:number, kind:'good'|'mid'|'low', lacks:number, excs:number, microsReliable:boolean, microsCoverage:number}}
 */
function computeDailyScore(nutrients, targets, opts) {
  opts = opts || {};
  nutrients = nutrients || {};
  targets = targets || {};
  var META = opts.META || {};
  var cov = (opts.microsCoverage == null) ? 1 : opts.microsCoverage;
  var reliable = cov >= (opts.microsThreshold || 0.6);

  var score = 100;
  var E = nutrients.energy || 0;
  var tE = targets.energy || 1;
  var eDev = Math.abs(E / tE - 1);
  if (eDev > 0.10) score -= Math.min(30, Math.round((eDev - 0.10) * 100));

  ['protein', 'fat', 'carb'].forEach(function (k) {
    var r = (nutrients[k] || 0) / (targets[k] || 1);
    if (r < 0.8 || r > 1.2) score -= 5;
  });

  var important = ['Ca', 'Fe', 'Mg', 'K', 'Zn', 'vitD', 'vitC', 'vitA', 'vitE', 'vitB1', 'vitB2', 'vitB6', 'vitB12', 'folate', 'fiber', 'n3', 'protein'];
  var excess = ['salt', 'saturatedFat'];
  var lacks = 0, excs = 0;
  if (reliable) {
    important.forEach(function (k) {
      var v = nutrients[k] || 0, t = (META[k] || {}).target || 0;
      if (t && v < t * 0.60) lacks++;
    });
    excess.forEach(function (k) {
      var v = nutrients[k] || 0, t = (META[k] || {}).target || 0;
      if (t && v > t * 1.20) excs++;
    });
    score -= Math.min(20, lacks * 3);
    score -= Math.min(10, excs * 3);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  var kind = score >= 80 ? 'good' : score >= 60 ? 'mid' : 'low';
  return { score: score, kind: kind, lacks: lacks, excs: excs, microsReliable: reliable, microsCoverage: cov };
}

// ----------------------------------------------------------------
// 公開: カーボサイクル（筋トレ日／休養日で目標を出し分け） 2026-05-29 (cowork)
// ----------------------------------------------------------------
// 設計（2026-05-29 改訂: ベース据え置きモデル）:
//   - ベース目標(nutrition_targets_v1)＝普段(休養日)の目標とみなす。
//   - 休養日(既定OFF):        ベース目標そのまま（補正なし）。
//   - 筋トレ日(手動トグルON): 炭水化物 +carbDelta g / +carbDelta*4 kcal、P/F固定。
//   - carbDelta 既定 50g（≈+200kcal）。リコンポ向け: トレ日にグリコーゲン補充で
//     C を上乗せ(67kgで概ね +0.7g/kg)。UI で調整可。
//   - 判定対象日は trainingDates[YYYY-MM-DD]=true の有無のみで決まる(自動判定なし)。
//   - サーバ同期(設定シート)はベース目標のみ更新。本レイヤーは別 store なので上書きされない。

var CARB_CYCLE_STORE = 'hs:carb-cycle:v1';

function _ncClamp(value, min, max, fallback) {
  var n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeCarbCycle(cfg) {
  cfg = cfg || {};
  var dates = (cfg.trainingDates && typeof cfg.trainingDates === 'object') ? cfg.trainingDates : {};
  var clean = {};
  Object.keys(dates).forEach(function (d) { if (dates[d]) clean[d] = true; });
  return {
    enabled: cfg.enabled !== false,                       // 既定 ON（機能有効）
    carbDelta: _ncClamp(cfg.carbDelta, 0, 200, 50),       // g（既定 50）
    trainingDates: clean                                  // 既定 OFF＝休養日
  };
}

function loadCarbCycle() {
  try {
    var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(CARB_CYCLE_STORE) : null;
    return normalizeCarbCycle(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return normalizeCarbCycle(null);
  }
}

function saveCarbCycle(cfg) {
  var norm = normalizeCarbCycle(cfg);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CARB_CYCLE_STORE, JSON.stringify(norm));
  } catch (e) { /* noop */ }
  return norm;
}

function isTrainingDay(dateStr, cfg) {
  cfg = cfg || loadCarbCycle();
  return !!(cfg.enabled && cfg.trainingDates && cfg.trainingDates[dateStr]);
}

// その日の筋トレ日フラグを on/off して保存。更新後の cfg を返す。
function setTrainingDay(dateStr, on, cfg) {
  cfg = normalizeCarbCycle(cfg || loadCarbCycle());
  if (on) cfg.trainingDates[dateStr] = true;
  else delete cfg.trainingDates[dateStr];
  return saveCarbCycle(cfg);
}

/**
 * ベース目標を、その日の種別(筋トレ日/休養日)に応じて補正した実効目標を返す。
 * P/F は据え置き、C と energy のみ ±carbDelta。
 * @returns {object} baseTargets のコピー + {dayType:'training'|'rest', carbDelta, base:{...}}
 */
function applyCarbCycle(baseTargets, dateStr, cfg) {
  cfg = cfg || loadCarbCycle();
  if (!baseTargets) return baseTargets;
  var out = {};
  for (var k in baseTargets) { if (Object.prototype.hasOwnProperty.call(baseTargets, k)) out[k] = baseTargets[k]; }
  if (!cfg.enabled) { out.dayType = 'rest'; out.carbDelta = 0; out.base = baseTargets; return out; }
  var d = Number(cfg.carbDelta) || 0;
  var training = isTrainingDay(dateStr, cfg);
  // ベース据え置きモデル: 休養日はベースそのまま、筋トレ日のみ +d
  var add = training ? d : 0;
  out.carb = Math.max(0, Math.round((Number(baseTargets.carb) || 0) + add));
  out.energy = Math.max(0, Math.round((Number(baseTargets.energy) || 0) + add * 4));
  out.dayType = training ? 'training' : 'rest';
  out.carbDelta = d;
  out.base = baseTargets;
  return out;
}
