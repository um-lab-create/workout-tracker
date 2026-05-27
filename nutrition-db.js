(function () {
  'use strict';

  const VERSION = '2026-05-25-a';

  const NUTRIENT_META = {
    energy: { label: 'エネルギー', unit: 'kcal', precision: 0, group: 'macro', target: 2300 },
    protein: { label: 'たんぱく質', unit: 'g', precision: 1, group: 'macro', target: 65 },
    fat: { label: '脂質', unit: 'g', precision: 1, group: 'macro', target: 62 },
    carb: { label: '炭水化物', unit: 'g', precision: 1, group: 'macro', target: 320 },
    saturatedFat: { label: '飽和脂肪酸', unit: 'g', precision: 1, group: 'macro', target: 18 },
    n3: { label: 'n-3系脂肪酸', unit: 'g', precision: 1, group: 'macro', target: 2.2 },
    n6: { label: 'n-6系脂肪酸', unit: 'g', precision: 1, group: 'macro', target: 11 },
    fiber: { label: '食物繊維', unit: 'g', precision: 1, group: 'macro', target: 21 },
    salt: { label: '食塩相当量', unit: 'g', precision: 1, group: 'macro', target: 7.5 },
    Na: { label: 'ナトリウム', unit: 'mg', precision: 0, group: 'mineral', target: 2900 },
    K: { label: 'カリウム', unit: 'mg', precision: 0, group: 'mineral', target: 3000 },
    Ca: { label: 'カルシウム', unit: 'mg', precision: 0, group: 'mineral', target: 750 },
    Mg: { label: 'マグネシウム', unit: 'mg', precision: 0, group: 'mineral', target: 370 },
    P: { label: 'リン', unit: 'mg', precision: 0, group: 'mineral', target: 1000 },
    Fe: { label: '鉄', unit: 'mg', precision: 1, group: 'mineral', target: 7.5 },
    Zn: { label: '亜鉛', unit: 'mg', precision: 1, group: 'mineral', target: 11 },
    Cu: { label: '銅', unit: 'mg', precision: 2, group: 'mineral', target: 0.9 },
    Mn: { label: 'マンガン', unit: 'mg', precision: 1, group: 'mineral', target: 4.0 },
    I: { label: 'ヨウ素', unit: 'µg', precision: 0, group: 'mineral', target: 130 },
    Se: { label: 'セレン', unit: 'µg', precision: 0, group: 'mineral', target: 35 },
    Cr: { label: 'クロム', unit: 'µg', precision: 0, group: 'mineral', target: 10 },
    Mo: { label: 'モリブデン', unit: 'µg', precision: 0, group: 'mineral', target: 25 },
    vitA: { label: 'ビタミンA', unit: 'µgRAE', precision: 0, group: 'vitamin', target: 900 },
    vitD: { label: 'ビタミンD', unit: 'µg', precision: 1, group: 'vitamin', target: 9 },
    vitE: { label: 'ビタミンE', unit: 'mg', precision: 1, group: 'vitamin', target: 6 },
    vitK: { label: 'ビタミンK', unit: 'µg', precision: 0, group: 'vitamin', target: 150 },
    vitB1: { label: 'ビタミンB1', unit: 'mg', precision: 2, group: 'vitamin', target: 1.4 },
    vitB2: { label: 'ビタミンB2', unit: 'mg', precision: 2, group: 'vitamin', target: 1.6 },
    niacin: { label: 'ナイアシン', unit: 'mg', precision: 1, group: 'vitamin', target: 15 },
    vitB6: { label: 'ビタミンB6', unit: 'mg', precision: 2, group: 'vitamin', target: 1.4 },
    vitB12: { label: 'ビタミンB12', unit: 'µg', precision: 1, group: 'vitamin', target: 2.4 },
    folate: { label: '葉酸', unit: 'µg', precision: 0, group: 'vitamin', target: 240 },
    pantothenic: { label: 'パントテン酸', unit: 'mg', precision: 1, group: 'vitamin', target: 5 },
    biotin: { label: 'ビオチン', unit: 'µg', precision: 0, group: 'vitamin', target: 50 },
    vitC: { label: 'ビタミンC', unit: 'mg', precision: 0, group: 'vitamin', target: 100 }
  };

  const NUTRIENT_KEYS = Object.keys(NUTRIENT_META);

  function blankNutrients() {
    const row = {};
    NUTRIENT_KEYS.forEach(function (key) {
      row[key] = 0;
    });
    return row;
  }

  function mergeNutrients(partial) {
    return Object.assign(blankNutrients(), partial || {});
  }

  function definePer100g(config) {
    return {
      id: config.id,
      name: config.name,
      source: config.source || 'manual',
      coverage: config.coverage || 'partial',
      mode: 'per100g',
      units: config.units,
      per100g: mergeNutrients(config.per100g)
    };
  }

  function definePerUnit(config) {
    return {
      id: config.id,
      name: config.name,
      source: config.source || 'manual',
      coverage: config.coverage || 'partial',
      mode: 'perUnit',
      unitLabel: config.unitLabel,
      perUnit: mergeNutrients(config.perUnit)
    };
  }

  const FOODS = {
    bihidas: definePer100g({ id: 'bihidas', name: 'ビヒダスヨーグルト', source: '八訂(プレーンヨーグルト相当・要product確認)', units: { '大スプーン': 15, '小スプーン': 5, '小鉢': 80, 'g': 1 }, per100g: { energy: 65, protein: 3.6, fat: 3.0, carb: 4.9, salt: 0.1, Na: 48, K: 160, Ca: 120, Mg: 12, P: 100, Zn: 0.4, vitA: 33, vitB1: 0.04, vitB2: 0.14, vitB6: 0.04, vitB12: 0.1, folate: 11, pantothenic: 0.49, vitC: 1 } }),
    banana: definePer100g({ id: 'banana', name: 'バナナ', units: { '本': 100, 'g': 1 }, per100g: { energy: 93, protein: 1.1, fat: 0.2, carb: 22.5, fiber: 1.1, K: 360, Ca: 6, Fe: 0.3, vitC: 16, Mg: 32, P: 27, Cu: 0.09, Mn: 0.26, vitA: 5, vitB1: 0.05, vitB2: 0.04, niacin: 0.7, vitB6: 0.38, folate: 26, pantothenic: 0.44, biotin: 1.4 } }),
    'soy-protein': definePer100g({ id: 'soy-protein', name: 'ソイプロテイン', units: { '食分': 30, 'g': 1 }, per100g: { energy: 380, protein: 80, fat: 6, carb: 8, fiber: 3.5, K: 1000, Ca: 220, Fe: 6.0, P: 700, Zn: 1.6, Cu: 0.4, Mg: 180, vitB1: 0.2, vitB2: 0.2, niacin: 1.0, vitB6: 0.2, folate: 80 } }),
    'whey-protein': definePer100g({ id: 'whey-protein', name: 'ホエイプロテイン', units: { '食分': 30, 'g': 1 }, per100g: { energy: 390, protein: 78, fat: 6, carb: 10, Ca: 450, K: 420, P: 320, Mg: 45, Zn: 1.2, vitB2: 0.7, vitB12: 0.8 } }),
    'mix-nuts': definePer100g({ id: 'mix-nuts', name: 'ミックスナッツ', units: { '粒': 1.2, 'つかみ': 20, 'g': 1 }, per100g: { energy: 650, protein: 17, fat: 58, saturatedFat: 5.5, n3: 0.5, n6: 11, carb: 17, fiber: 7.0, K: 680, Ca: 70, Fe: 2.5, Mg: 250, P: 450, Zn: 3.0, Cu: 1.0, Mn: 2.0, vitE: 8.0, vitB1: 0.2, vitB2: 0.15, niacin: 1.8, vitB6: 0.25, folate: 60 } }),
    raisin: definePer100g({ id: 'raisin', name: 'レーズン', source: '八訂', units: { '粒': 0.5, '大さじ': 10, 'g': 1 }, per100g: { energy: 324, protein: 2.7, fat: 0.2, carb: 80.7, fiber: 4.1, Na: 12, K: 740, Ca: 65, Mg: 31, P: 101, Fe: 2.3, Zn: 0.3, Cu: 0.3, Mn: 0.26, vitA: 1, vitB1: 0.12, vitB2: 0.03, niacin: 0.6, vitB6: 0.2, folate: 5, pantothenic: 0.17, biotin: 4, vitC: 2 } }),
    coffee: definePer100g({ id: 'coffee', name: 'コーヒー', source: '八訂(浸出液)', units: { '杯': 200, 'ml': 1 }, per100g: { energy: 4, protein: 0.2, carb: 0.7, Na: 1, K: 65, Mg: 6, P: 7, Mn: 0.03, niacin: 0.8, biotin: 1.7 } }),
    milk: definePer100g({ id: 'milk', name: '牛乳', units: { '杯': 200, 'ml': 1, 'g': 1 }, per100g: { energy: 61, protein: 3.3, fat: 3.8, saturatedFat: 2.3, carb: 4.8, salt: 0.1, Na: 41, K: 150, Ca: 110, Mg: 10, P: 93, Fe: 0.02, Zn: 0.4, Cu: 0.01, I: 16, vitA: 39, vitD: 0.3, vitE: 0.1, vitB1: 0.04, vitB2: 0.15, niacin: 0.1, vitB6: 0.03, vitB12: 0.3, folate: 5, pantothenic: 0.55, biotin: 2.0, vitC: 1 } }),
    bread: definePer100g({ id: 'bread', name: '食パン', units: { '枚': 60, 'g': 1 }, per100g: { energy: 248, protein: 8.9, fat: 4.1, saturatedFat: 1.0, carb: 46.7, fiber: 2.3, salt: 1.2, Na: 470, K: 97, Ca: 43, Fe: 0.6, Mg: 23, P: 72, Zn: 0.7, vitB1: 0.08, vitB2: 0.05, niacin: 0.7, vitB6: 0.04, folate: 23 } }),
    rice: definePer100g({ id: 'rice', name: '白米', units: { '膳': 150, '杯': 120, 'g': 1 }, per100g: { energy: 168, protein: 2.5, fat: 0.3, carb: 37.1, fiber: 0.3, Na: 1, K: 29, Ca: 3, Fe: 0.1, Mg: 7, P: 34, Zn: 0.6, vitB1: 0.02, vitB2: 0.01, niacin: 0.2, vitB6: 0.02, folate: 3 } }),
    oikos: definePer100g({ id: 'oikos', name: 'オイコス(プレーン砂糖不使用)', source: 'ダノン公式(1個113g≈71kcal)', units: { '個': 113, 'g': 1 }, per100g: { energy: 63, protein: 10.6, fat: 0, carb: 5.4, Na: 40, K: 140, Ca: 110, P: 110, vitB2: 0.18, vitB12: 0.5 } }),
    natto: definePer100g({ id: 'natto', name: '納豆', units: { 'パック': 45, 'g': 1 }, per100g: { energy: 190, protein: 16.5, fat: 10, saturatedFat: 1.5, n3: 0.7, n6: 5.0, carb: 12.1, fiber: 6.7, salt: 0.01, Na: 7, K: 660, Ca: 90, Mg: 100, P: 190, Fe: 3.3, Zn: 1.9, Cu: 0.6, Mn: 1.0, vitK: 600, vitB1: 0.07, vitB2: 0.56, niacin: 1.1, vitB6: 0.24, folate: 120, pantothenic: 3.6, biotin: 19 } }),
    egg: definePer100g({ id: 'egg', name: '卵', units: { '個': 50, 'g': 1 }, per100g: { energy: 151, protein: 12.3, fat: 10.3, saturatedFat: 3.1, carb: 0.3, Na: 140, K: 130, Ca: 51, P: 180, Fe: 1.8, Zn: 1.3, Cu: 0.07, Se: 30, vitA: 210, vitD: 1.8, vitE: 1.3, vitK: 12, vitB1: 0.06, vitB2: 0.43, niacin: 0.1, vitB6: 0.11, vitB12: 1.1, folate: 47, pantothenic: 1.45, biotin: 25 } }),
    'chicken-breast': definePer100g({ id: 'chicken-breast', name: '鶏胸肉', units: { '枚': 220, '100g': 100, 'g': 1 }, per100g: { energy: 108, protein: 22.3, fat: 1.5, saturatedFat: 0.4, carb: 0, Na: 40, K: 330, Ca: 4, Mg: 27, P: 200, Fe: 0.4, Zn: 0.7, Cu: 0.03, Se: 17, vitA: 9, vitE: 0.3, vitK: 23, vitB1: 0.09, vitB2: 0.11, niacin: 11.8, vitB6: 0.64, vitB12: 0.2, folate: 12, pantothenic: 1.6, biotin: 3 } }),
    'salad-chicken': definePer100g({ id: 'salad-chicken', name: 'サラダチキン', units: { 'パック': 110, 'g': 1 }, per100g: { energy: 105, protein: 22.3, fat: 1.1, carb: 2.2, salt: 1.2, Na: 480, K: 330, P: 200, Fe: 0.4, Zn: 0.7, niacin: 11.0, vitB6: 0.6 } }),
    'pork-loin': definePer100g({ id: 'pork-loin', name: '豚ロース', units: { '枚': 120, '100g': 100, 'g': 1 }, per100g: { energy: 263, protein: 19.3, fat: 19.2, saturatedFat: 6.8, carb: 0.2, Na: 46, K: 310, Ca: 4, Mg: 22, P: 180, Fe: 0.7, Zn: 1.6, Cu: 0.05, vitA: 6, vitD: 0.1, vitE: 0.3, vitB1: 0.69, vitB2: 0.17, niacin: 5.9, vitB6: 0.32, vitB12: 0.3, folate: 1, pantothenic: 1.0, biotin: 3 } }),
    salmon: definePer100g({ id: 'salmon', name: 'サーモン', units: { '切れ': 100, 'g': 1 }, per100g: { energy: 138, protein: 20.1, fat: 4.1, saturatedFat: 0.9, n3: 1.0, carb: 0.3, Na: 49, K: 490, Ca: 15, P: 230, Fe: 0.8, Zn: 0.6, Se: 38, vitA: 27, vitD: 13, vitE: 1.4, vitB1: 0.23, vitB2: 0.14, niacin: 8.5, vitB6: 0.57, vitB12: 4.9, vitK: 5 } }),
    mackerel: definePer100g({ id: 'mackerel', name: 'サバ', units: { '切れ': 100, 'g': 1 }, per100g: { energy: 211, protein: 20.6, fat: 16.8, saturatedFat: 4.0, n3: 2.6, carb: 0.3, Na: 77, K: 320, P: 240, Fe: 1.2, Zn: 1.0, Se: 43, vitA: 40, vitD: 11, vitE: 1.6, vitB1: 0.13, vitB2: 0.31, niacin: 10.0, vitB6: 0.59, vitB12: 12.9 } }),
    tofu: definePer100g({ id: 'tofu', name: '豆腐', units: { 'パック': 150, '丁': 300, 'g': 1 }, per100g: { energy: 56, protein: 4.9, fat: 3.0, carb: 1.6, fiber: 0.3, Na: 5, K: 140, Ca: 120, Mg: 31, P: 69, Fe: 1.5, Zn: 0.6, Cu: 0.12, Mn: 0.3, Se: 4, vitE: 0.2, vitK: 11, vitB1: 0.04, vitB2: 0.03, niacin: 0.2, vitB6: 0.04, folate: 15, pantothenic: 0.1 } }),
    broccoli: definePer100g({ id: 'broccoli', name: 'ブロッコリー', units: { '房': 80, '皿': 100, 'g': 1 }, per100g: { energy: 33, protein: 4.3, fat: 0.5, carb: 5.2, fiber: 5.1, Na: 8, K: 460, Ca: 50, Mg: 29, P: 89, Fe: 1.3, Zn: 0.7, Cu: 0.09, Mn: 0.4, vitA: 67, vitE: 2.4, vitK: 160, vitB1: 0.17, vitB2: 0.23, niacin: 1.3, vitB6: 0.3, folate: 210, pantothenic: 0.76, vitC: 140 } }),
    spinach: definePer100g({ id: 'spinach', name: 'ほうれん草', units: { '皿': 80, '束': 200, 'g': 1 }, per100g: { energy: 18, protein: 2.2, fat: 0.4, carb: 3.1, fiber: 2.8, Na: 16, K: 690, Ca: 49, Mg: 69, P: 47, Fe: 2.0, Zn: 0.7, Cu: 0.11, Mn: 0.32, vitA: 350, vitE: 2.1, vitK: 270, vitB1: 0.11, vitB2: 0.20, niacin: 0.6, vitB6: 0.14, folate: 210, pantothenic: 0.20, vitC: 35 } }),
    komatsuna: definePer100g({ id: 'komatsuna', name: '小松菜', units: { '皿': 80, '束': 200, 'g': 1 }, per100g: { energy: 13, protein: 1.5, fat: 0.2, carb: 2.4, fiber: 1.9, Na: 15, K: 500, Ca: 170, Mg: 12, P: 45, Fe: 2.8, Zn: 0.2, Cu: 0.06, Mn: 0.13, vitA: 260, vitE: 0.9, vitK: 210, vitB1: 0.09, vitB2: 0.13, niacin: 1.0, vitB6: 0.12, folate: 110, vitC: 39 } }),
    tomato: definePer100g({ id: 'tomato', name: 'トマト', units: { '個': 150, '皿': 100, 'g': 1 }, per100g: { energy: 20, protein: 0.7, fat: 0.1, carb: 4.7, fiber: 1.0, Na: 3, K: 210, Ca: 7, Mg: 9, P: 26, Fe: 0.2, Zn: 0.1, Cu: 0.04, Mn: 0.08, vitA: 45, vitE: 0.9, vitK: 4, vitB1: 0.05, vitB2: 0.02, niacin: 0.7, vitB6: 0.08, folate: 22, vitC: 15 } }),
    avocado: definePer100g({ id: 'avocado', name: 'アボカド', units: { '半分': 70, '個': 140, 'g': 1 }, per100g: { energy: 176, protein: 2.1, fat: 17.5, saturatedFat: 3.2, n3: 0.1, n6: 2.0, carb: 7.9, fiber: 5.6, Na: 7, K: 590, Ca: 8, Mg: 34, P: 55, Fe: 0.7, Zn: 0.7, Cu: 0.24, Mn: 0.18, vitA: 6, vitE: 3.3, vitK: 21, vitB1: 0.10, vitB2: 0.21, niacin: 1.7, vitB6: 0.32, folate: 84, pantothenic: 1.65, biotin: 5, vitC: 12 } }),
    'tuna-can': definePer100g({ id: 'tuna-can', name: 'ツナ缶', units: { '缶': 70, '大さじ': 15, 'g': 1 }, per100g: { energy: 267, protein: 17.7, fat: 21.7, saturatedFat: 3.2, n3: 0.4, n6: 4.5, carb: 0.1, salt: 0.8, Na: 320, K: 230, Ca: 3, Mg: 27, P: 180, Fe: 0.6, Zn: 0.5, Cu: 0.03, Se: 60, vitD: 2.0, vitE: 2.5, vitB1: 0.03, vitB2: 0.06, niacin: 10.0, vitB6: 0.36, vitB12: 1.1, pantothenic: 0.20 } }),
    wakame: definePer100g({ id: 'wakame', name: 'わかめ', units: { '皿': 50, 'g': 1 }, per100g: { energy: 16, protein: 1.9, fat: 0.2, carb: 5.6, fiber: 3.6, salt: 0.6, Na: 250, K: 730, Ca: 100, Mg: 110, P: 36, Fe: 0.7, Zn: 0.3, Cu: 0.02, Mn: 0.17, I: 1600, vitA: 18, vitE: 0.2, vitK: 140, vitB1: 0.01, vitB2: 0.07, niacin: 0.4, folate: 29, vitC: 15 } }),
    kimchi: definePer100g({ id: 'kimchi', name: 'キムチ', units: { '皿': 50, 'g': 1 }, per100g: { energy: 46, protein: 2.8, fat: 0.5, carb: 8.2, fiber: 2.7, salt: 2.2, Na: 870, K: 340, Ca: 45, Mg: 16, P: 37, Fe: 0.6, Zn: 0.2, Cu: 0.05, Mn: 0.1, vitA: 24, vitK: 35, vitB1: 0.03, vitB2: 0.06, niacin: 0.5, vitB6: 0.08, folate: 35, pantothenic: 0.2, vitC: 18 } }),
    oatmeal: definePer100g({ id: 'oatmeal', name: 'オートミール', units: { '食分': 30, 'g': 1 }, per100g: { energy: 350, protein: 13.7, fat: 5.7, saturatedFat: 1.0, n6: 2.3, carb: 69.1, fiber: 9.4, Na: 2, K: 260, Ca: 47, Mg: 100, P: 370, Fe: 3.9, Zn: 2.1, Cu: 0.3, Mn: 3.6, vitB1: 0.2, vitB2: 0.08, niacin: 1.0, vitB6: 0.11, folate: 30 } }),
    pasta: definePer100g({ id: 'pasta', name: 'パスタ', units: { '皿': 250, 'g': 1 }, per100g: { energy: 150, protein: 5.2, fat: 0.9, carb: 30.3, fiber: 1.8, salt: 0.1, Na: 2, K: 44, Ca: 12, Mg: 18, P: 63, Fe: 0.6, Zn: 0.5, Cu: 0.1, Mn: 0.3, vitB1: 0.05, vitB2: 0.02, niacin: 0.6, vitB6: 0.02, folate: 12, pantothenic: 0.28 } }),
    udon: definePer100g({ id: 'udon', name: 'うどん', units: { '玉': 200, 'g': 1 }, per100g: { energy: 105, protein: 2.6, fat: 0.4, carb: 21.6, fiber: 1.3, salt: 0.2, Na: 90, K: 8, Ca: 12, Mg: 7, P: 23, Fe: 0.3, Zn: 0.1, Cu: 0.04, Mn: 0.12, vitB1: 0.02, vitB2: 0.01, niacin: 0.2, vitB6: 0.01, folate: 2, pantothenic: 0.13 } }),
    soba: definePer100g({ id: 'soba', name: 'そば', units: { '玉': 180, 'g': 1 }, per100g: { energy: 132, protein: 4.8, fat: 1.0, carb: 26.0, fiber: 2.9, salt: 0.1, Na: 1, K: 34, Ca: 17, Mg: 34, P: 77, Fe: 0.8, Zn: 0.6, Mn: 0.3, vitB1: 0.08, vitB2: 0.03, niacin: 1.3, vitB6: 0.06, folate: 18 } }),
    'sweet-potato': definePer100g({ id: 'sweet-potato', name: 'さつまいも', units: { '本': 180, 'g': 1 }, per100g: { energy: 126, protein: 1.2, fat: 0.2, carb: 29.7, fiber: 2.8, Na: 13, K: 480, Ca: 36, Mg: 24, P: 47, Fe: 0.6, vitA: 2, vitE: 1.5, vitB1: 0.11, vitB2: 0.04, vitB6: 0.26, vitC: 29 } }),
    'miso-soup': definePer100g({ id: 'miso-soup', name: '味噌汁', units: { '杯': 180, 'ml': 1 }, per100g: { energy: 35, protein: 2.2, fat: 1.2, carb: 3.6, fiber: 0.8, salt: 1.2, Na: 470, K: 70, Ca: 24, Mg: 10, P: 30, Fe: 0.4, Zn: 0.2, Mn: 0.05, vitK: 7, vitB2: 0.03 } }),
    'protein-bar': definePerUnit({ id: 'protein-bar', name: 'プロテインバー', unitLabel: '本', perUnit: { energy: 183, protein: 15, fat: 8, carb: 13, fiber: 3.0, Ca: 120, Fe: 1.5, K: 120 } }),
    'greek-yogurt': definePer100g({ id: 'greek-yogurt', name: 'ギリシャヨーグルト', units: { '個': 110, 'g': 1 }, per100g: { energy: 63, protein: 10.3, fat: 0.4, carb: 4.9, Ca: 120, K: 140, P: 110, vitB2: 0.18, vitB12: 0.5 } }),
    'prod-oikos-blueberry': definePerUnit({ id: 'prod-oikos-blueberry', name: 'オイコス ブルーベリー', unitLabel: '個', perUnit: { energy: 92, protein: 10.1, fat: 0, carb: 12.9, fiber: 0.3, Ca: 130, K: 140, P: 110, vitB2: 0.18, vitB12: 0.5 } }),
    'prod-savas-milk': definePerUnit({ id: 'prod-savas-milk', name: 'ザバス ミルクプロテイン', unitLabel: '本', perUnit: { energy: 102, protein: 15, carb: 10, Ca: 300, K: 200, P: 180, vitB2: 0.3, vitB12: 0.8 } }),
    'prod-base-bread': definePerUnit({ id: 'prod-base-bread', name: 'BASE BREAD チョコ', unitLabel: '袋', perUnit: { energy: 255, protein: 13.5, fat: 8.5, saturatedFat: 2.1, carb: 31.5, fiber: 6.5, salt: 0.4, Na: 160, K: 210, Ca: 120, Fe: 1.5, Zn: 1.0, vitB1: 0.4, vitB2: 0.2, niacin: 2.0, vitB6: 0.2, folate: 80 } }),
    'prod-salad-chicken-herb': definePerUnit({ id: 'prod-salad-chicken-herb', name: 'サラダチキン ハーブ', unitLabel: 'パック', perUnit: { energy: 115, protein: 24.5, fat: 1.2, carb: 1.1, salt: 1.5, Na: 590, K: 360, P: 220, Fe: 0.5, niacin: 12.0, vitB6: 0.7 } }),
    'prod-in-jelly-protein': definePerUnit({ id: 'prod-in-jelly-protein', name: 'inゼリー プロテイン', unitLabel: '個', perUnit: { energy: 112, protein: 10, carb: 17.5, K: 80 } }),
    'prod-ameal': definePerUnit({ id: 'prod-ameal', name: 'アーモンド効果 砂糖不使用', unitLabel: '本', perUnit: { energy: 80, protein: 1.4, fat: 6.2, carb: 3.9, fiber: 1.2, Ca: 180, Fe: 0.6, K: 120, vitE: 6.0 } }),
    'prod-kagome-yasai-ichinichi': definePerUnit({ id: 'prod-kagome-yasai-ichinichi', name: '野菜一日これ一本', unitLabel: '本', perUnit: { energy: 61, protein: 2.1, fat: 0, carb: 14.2, fiber: 2.15, salt: 0.2, K: 590, Ca: 44, Mg: 24, vitA: 820, vitE: 2.95, vitK: 10.5, folate: 45.5 } }),

    // === 常食追加 2026-05-27 (cowork): マネージャー常食リスト由来。八訂/公表値ベース・要監査 ===
    cabbage: definePer100g({ id: 'cabbage', name: 'キャベツ千切り', source: '八訂', units: { '皿': 80, 'つかみ': 30, 'g': 1 }, per100g: { energy: 21, protein: 1.3, fat: 0.2, carb: 5.2, fiber: 1.8, Na: 5, K: 200, Ca: 43, Mg: 14, P: 27, Fe: 0.3, Zn: 0.2, Cu: 0.02, Mn: 0.16, vitA: 4, vitE: 0.1, vitK: 78, vitB1: 0.04, vitB2: 0.03, niacin: 0.2, vitB6: 0.11, folate: 78, pantothenic: 0.22, vitC: 41 } }),
    'chicken-thigh': definePer100g({ id: 'chicken-thigh', name: '鶏もも肉(皮つき)', source: '八訂', units: { '枚': 250, '100g': 100, 'g': 1 }, per100g: { energy: 190, protein: 16.6, fat: 14.2, saturatedFat: 4.4, carb: 0, Na: 62, K: 290, Ca: 5, P: 170, Fe: 0.6, Zn: 1.6, Cu: 0.04, vitA: 40, vitK: 29, vitB1: 0.10, vitB2: 0.15, niacin: 4.8, vitB6: 0.25, vitB12: 0.3, pantothenic: 1.0 } }),
    'chicken-breast-mince': definePer100g({ id: 'chicken-breast-mince', name: '鶏むねひき肉', source: '八訂(むね相当)', units: { '100g': 100, 'g': 1 }, per100g: { energy: 120, protein: 19.0, fat: 4.5, saturatedFat: 1.2, carb: 0, Na: 55, K: 320, Ca: 4, Mg: 27, P: 190, Fe: 0.5, Zn: 0.8, Cu: 0.03, Se: 17, vitA: 9, vitK: 23, vitB1: 0.09, vitB2: 0.11, niacin: 9.0, vitB6: 0.5, vitB12: 0.2, folate: 12, pantothenic: 1.5 } }),
    'chicken-thigh-mince': definePer100g({ id: 'chicken-thigh-mince', name: '鶏ももひき肉', source: '八訂(鶏ひき肉)', units: { '100g': 100, 'g': 1 }, per100g: { energy: 171, protein: 17.5, fat: 12.0, saturatedFat: 3.3, carb: 0, Na: 55, K: 250, Ca: 5, Mg: 24, P: 110, Fe: 0.8, Zn: 1.1, Cu: 0.04, vitA: 37, vitK: 29, vitB1: 0.10, vitB2: 0.15, niacin: 5.5, vitB6: 0.35, vitB12: 0.3, folate: 6, pantothenic: 1.1 } }),
    'pork-belly': definePer100g({ id: 'pork-belly', name: '豚バラ', source: '八訂', units: { '100g': 100, 'g': 1 }, per100g: { energy: 366, protein: 14.4, fat: 35.4, saturatedFat: 14.6, carb: 0.1, Na: 50, K: 240, Ca: 3, Mg: 15, P: 130, Fe: 0.6, Zn: 1.8, Cu: 0.04, vitA: 11, vitE: 0.5, vitB1: 0.51, vitB2: 0.13, niacin: 4.7, vitB6: 0.22, vitB12: 0.5, folate: 2, pantothenic: 0.64, biotin: 3 } }),
    ham: definePer100g({ id: 'ham', name: 'ロースハム', source: '八訂', units: { '枚': 20, 'g': 1 }, per100g: { energy: 211, protein: 18.6, fat: 14.5, saturatedFat: 5.3, carb: 2.0, salt: 2.3, Na: 910, K: 290, Ca: 4, P: 340, Fe: 0.5, Zn: 1.6, vitB1: 0.70, vitB2: 0.12, niacin: 6.5, vitB6: 0.28, vitB12: 0.5 } }),
    sausage: definePer100g({ id: 'sausage', name: 'ウインナーソーセージ', source: '八訂', units: { '本': 20, 'g': 1 }, per100g: { energy: 319, protein: 11.5, fat: 30.6, saturatedFat: 10.8, carb: 3.3, salt: 1.9, Na: 740, K: 180, Ca: 6, P: 200, Fe: 0.5, Zn: 1.3, vitB1: 0.35, vitB2: 0.12, niacin: 5.7, vitB6: 0.14, vitB12: 0.6 } }),
    'sliced-cheese': definePer100g({ id: 'sliced-cheese', name: 'スライスチーズ(プロセス)', source: '八訂', units: { '枚': 18, 'g': 1 }, per100g: { energy: 313, protein: 22.7, fat: 26.0, saturatedFat: 16.0, carb: 1.3, salt: 2.8, Na: 1100, K: 60, Ca: 630, Mg: 19, P: 730, Fe: 0.3, Zn: 3.2, vitA: 260, vitB2: 0.38, niacin: 0.1, folate: 27, vitB12: 3.2 } }),
    'soda-water': definePer100g({ id: 'soda-water', name: '炭酸水(無糖)', source: 'manual', units: { '杯': 200, 'ml': 1 }, per100g: { energy: 0 } }),
    'lemon-juice': definePer100g({ id: 'lemon-juice', name: 'レモン汁', source: '八訂', units: { '大さじ': 15, '小さじ': 5, 'ml': 1 }, per100g: { energy: 24, protein: 0.4, fat: 0.1, carb: 8.6, Na: 2, K: 100, Ca: 7, Mg: 8, P: 9, Fe: 0.1, vitB1: 0.04, vitB2: 0.02, vitB6: 0.05, folate: 19, pantothenic: 0.18, vitC: 50 } }),
    'red-wine': definePer100g({ id: 'red-wine', name: '赤ワイン', source: '八訂', units: { '杯': 120, 'ml': 1 }, per100g: { energy: 68, protein: 0.2, fat: 0, carb: 1.5, Na: 2, K: 110, Ca: 7, Mg: 9, P: 13, Fe: 0.4, Zn: 0.1, Cu: 0.02, Mn: 0.15, niacin: 0.1, vitB6: 0.03, folate: 2 } }),
    'mcd-cheeseburger': definePerUnit({ id: 'mcd-cheeseburger', name: 'マック チーズバーガー', source: 'マクドナルド公表値・要確認', unitLabel: '個', perUnit: { energy: 307, protein: 15.8, fat: 13.4, carb: 30.8, salt: 1.8, Na: 720, Ca: 130, Fe: 1.5 } }),
    'mcd-fries-m': definePerUnit({ id: 'mcd-fries-m', name: 'マック ポテトM', source: 'マクドナルド公表値・要確認', unitLabel: '個', perUnit: { energy: 410, protein: 5.3, fat: 19.8, carb: 51.0, salt: 0.8, K: 690, vitC: 15 } }),
    'mcd-egg-cheese': definePerUnit({ id: 'mcd-egg-cheese', name: 'マック エグチ(エッグチーズバーガー)', source: 'マクドナルド公式', unitLabel: '個', perUnit: { energy: 387, protein: 22.1, fat: 18.9, carb: 31.2, salt: 2.0, Na: 790, Ca: 150, Fe: 2.0 } }),
    'mcd-nugget': definePerUnit({ id: 'mcd-nugget', name: 'チキンマックナゲット', source: 'マクドナルド公式(5pc262kcalを1pc換算)', unitLabel: 'ピース', perUnit: { energy: 52, protein: 3.1, fat: 3.2, carb: 2.9, salt: 0.26, Na: 100 } }),
    'mcd-fries-l': definePerUnit({ id: 'mcd-fries-l', name: 'マック ポテトL', source: 'マクドナルド公表値・要確認', unitLabel: '個', perUnit: { energy: 517, protein: 6.7, fat: 25.8, carb: 64.4, salt: 1.0, K: 1100, vitC: 24 } })
  };

  function getFood(id) {
    return FOODS[id] || null;
  }

  function convertFoodToNutritionEntry(food) {
    if (!food) return null;
    if (FOODS[food.id]) return FOODS[food.id];
    if (food.mode === 'perUnit') {
      var extra = food.nutrientsPerUnit || {};
      return definePerUnit({
        id: food.id,
        name: food.name,
        unitLabel: food.unitLabel || '個',
        source: 'meal-local',
        perUnit: {
          energy: food.macrosPerUnit && food.macrosPerUnit.kcal || 0,
          protein: food.macrosPerUnit && food.macrosPerUnit.p || 0,
          fat: food.macrosPerUnit && food.macrosPerUnit.f || 0,
          carb: food.macrosPerUnit && food.macrosPerUnit.c || 0,
          saturatedFat: extra.saturatedFat || 0,
          fiber: extra.fiber || 0,
          salt: extra.salt || 0,
          Na: extra.Na || 0,
          K: extra.K || 0,
          Ca: extra.Ca || 0,
          Mg: extra.Mg || 0,
          Fe: extra.Fe || 0,
          vitA: extra.vitA || 0,
          vitE: extra.vitE || 0,
          vitK: extra.vitK || 0,
          folate: extra.folate || 0
        }
      });
    }
    const units = {};
    (food.units || []).forEach(function (unit) {
      units[unit.label] = unit.grams;
    });
    return definePer100g({
      id: food.id,
      name: food.name,
      source: 'meal-local',
      units: units,
      per100g: {
        energy: food.macros && food.macros.kcal || 0,
        protein: food.macros && food.macros.p || 0,
        fat: food.macros && food.macros.f || 0,
        carb: food.macros && food.macros.c || 0
      }
    });
  }

  function calcPortion(food, qty, unitLabel) {
    const safeQty = Number(qty) || 0;
    if (!food || safeQty <= 0) return null;
    const totals = blankNutrients();
    if (food.mode === 'perUnit') {
      NUTRIENT_KEYS.forEach(function (key) {
        totals[key] = (food.perUnit[key] || 0) * safeQty;
      });
      return { qty: safeQty, unit: unitLabel || food.unitLabel, grams: null, totals: totals };
    }
    const gramsPerUnit = food.units && food.units[unitLabel];
    if (!gramsPerUnit) return null;
    const grams = safeQty * gramsPerUnit;
    const ratio = grams / 100;
    NUTRIENT_KEYS.forEach(function (key) {
      totals[key] = (food.per100g[key] || 0) * ratio;
    });
    return { qty: safeQty, unit: unitLabel, grams: grams, totals: totals };
  }

  function structureItem(item, fallbackFood) {
    const food = getFood(item.foodId) || convertFoodToNutritionEntry(fallbackFood);
    const portion = calcPortion(food, item.qty, item.unit);
    const totals = portion ? portion.totals : blankNutrients();
    return {
      foodId: item.foodId,
      foodName: item.name || (food && food.name) || item.foodId,
      qty: Number(item.qty) || 0,
      unit: item.unit,
      grams: portion ? portion.grams : null,
      pendingReview: Boolean(item.pendingReview),
      nutrients: totals
    };
  }

  function formatValue(key, value) {
    const meta = NUTRIENT_META[key];
    if (!meta) return String(value || 0);
    return Number(value || 0).toFixed(meta.precision || 0).replace(/\.0$/, '');
  }

  window.HSNutritionDB = {
    VERSION: VERSION,
    META: NUTRIENT_META,
    KEYS: NUTRIENT_KEYS,
    FOODS: FOODS,
    blankNutrients: blankNutrients,
    getFood: getFood,
    calcPortion: calcPortion,
    structureItem: structureItem,
    convertFoodToNutritionEntry: convertFoodToNutritionEntry,
    formatValue: formatValue
  };
}());
