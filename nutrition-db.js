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
    'chicken-breast': definePer100g({ id: 'chicken-breast', name: '鶏胸肉', units: { '枚': 220, '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 108, protein: 22.3, fat: 1.5, saturatedFat: 0.4, carb: 0, Na: 40, K: 330, Ca: 4, Mg: 27, P: 200, Fe: 0.4, Zn: 0.7, Cu: 0.03, Se: 17, vitA: 9, vitE: 0.3, vitK: 23, vitB1: 0.09, vitB2: 0.11, niacin: 11.8, vitB6: 0.64, vitB12: 0.2, folate: 12, pantothenic: 1.6, biotin: 3 } }),
    'salad-chicken': definePer100g({ id: 'salad-chicken', name: 'サラダチキン', units: { 'パック': 110, 'g': 1 }, per100g: { energy: 105, protein: 22.3, fat: 1.1, carb: 2.2, salt: 1.2, Na: 480, K: 330, P: 200, Fe: 0.4, Zn: 0.7, niacin: 11.0, vitB6: 0.6 } }),
    'pork-loin': definePer100g({ id: 'pork-loin', name: '豚ロース', units: { '枚': 120, '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 263, protein: 19.3, fat: 19.2, saturatedFat: 6.8, carb: 0.2, Na: 46, K: 310, Ca: 4, Mg: 22, P: 180, Fe: 0.7, Zn: 1.6, Cu: 0.05, vitA: 6, vitD: 0.1, vitE: 0.3, vitB1: 0.69, vitB2: 0.17, niacin: 5.9, vitB6: 0.32, vitB12: 0.3, folate: 1, pantothenic: 1.0, biotin: 3 } }),
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
    'chicken-thigh': definePer100g({ id: 'chicken-thigh', name: '鶏もも肉(皮つき)', source: '八訂', units: { '枚': 250, '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 190, protein: 16.6, fat: 14.2, saturatedFat: 4.4, carb: 0, Na: 62, K: 290, Ca: 5, P: 170, Fe: 0.6, Zn: 1.6, Cu: 0.04, vitA: 40, vitK: 29, vitB1: 0.10, vitB2: 0.15, niacin: 4.8, vitB6: 0.25, vitB12: 0.3, pantothenic: 1.0 } }),
    'chicken-breast-mince': definePer100g({ id: 'chicken-breast-mince', name: '鶏むねひき肉', source: '八訂(むね相当)', units: { '100g': 100, 'g': 1 }, per100g: { energy: 120, protein: 19.0, fat: 4.5, saturatedFat: 1.2, carb: 0, Na: 55, K: 320, Ca: 4, Mg: 27, P: 190, Fe: 0.5, Zn: 0.8, Cu: 0.03, Se: 17, vitA: 9, vitK: 23, vitB1: 0.09, vitB2: 0.11, niacin: 9.0, vitB6: 0.5, vitB12: 0.2, folate: 12, pantothenic: 1.5 } }),
    'chicken-thigh-mince': definePer100g({ id: 'chicken-thigh-mince', name: '鶏ももひき肉', source: '八訂(鶏ひき肉)', units: { '100g': 100, 'g': 1 }, per100g: { energy: 171, protein: 17.5, fat: 12.0, saturatedFat: 3.3, carb: 0, Na: 55, K: 250, Ca: 5, Mg: 24, P: 110, Fe: 0.8, Zn: 1.1, Cu: 0.04, vitA: 37, vitK: 29, vitB1: 0.10, vitB2: 0.15, niacin: 5.5, vitB6: 0.35, vitB12: 0.3, folate: 6, pantothenic: 1.1 } }),
    'pork-belly': definePer100g({ id: 'pork-belly', name: '豚バラ', source: '八訂', units: { '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 366, protein: 14.4, fat: 35.4, saturatedFat: 14.6, carb: 0.1, Na: 50, K: 240, Ca: 3, Mg: 15, P: 130, Fe: 0.6, Zn: 1.8, Cu: 0.04, vitA: 11, vitE: 0.5, vitB1: 0.51, vitB2: 0.13, niacin: 4.7, vitB6: 0.22, vitB12: 0.5, folate: 2, pantothenic: 0.64, biotin: 3 } }),
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
    'mcd-fries-l': definePerUnit({ id: 'mcd-fries-l', name: 'マック ポテトL', source: 'マクドナルド公表値・要確認', unitLabel: '個', perUnit: { energy: 517, protein: 6.7, fat: 25.8, carb: 64.4, salt: 1.0, K: 1100, vitC: 24 } }),

    // === v2 大規模拡張 2026-05-27 (cowork): スーパー基本食材を 八訂 ベースで一括追加 ===
    // 野菜
    lettuce: definePer100g({ id: 'lettuce', name: 'レタス', source: '八訂', units: { '皿': 50, '玉': 250, 'g': 1 }, per100g: { energy: 11, protein: 0.6, fat: 0.1, carb: 2.8, fiber: 1.1, Na: 2, K: 200, Ca: 19, Mg: 8, P: 22, Fe: 0.3, Zn: 0.2, vitA: 20, vitE: 0.3, vitK: 29, vitB6: 0.05, folate: 73, vitC: 5 } }),
    onion: definePer100g({ id: 'onion', name: '玉ねぎ', source: '八訂', units: { '個': 200, '半分': 100, 'g': 1 }, per100g: { energy: 33, protein: 1.0, fat: 0.1, carb: 8.4, fiber: 1.5, Na: 2, K: 150, Ca: 17, Mg: 9, P: 31, Fe: 0.3, Zn: 0.2, vitB1: 0.03, vitB6: 0.14, folate: 16, vitC: 7 } }),
    'green-onion': definePer100g({ id: 'green-onion', name: '長ねぎ', source: '八訂', units: { '本': 100, 'g': 1 }, per100g: { energy: 35, protein: 1.4, fat: 0.1, carb: 8.3, fiber: 2.5, K: 200, Ca: 36, Mg: 13, P: 27, Fe: 0.3, vitA: 7, vitE: 0.2, vitK: 8, vitB6: 0.12, folate: 72, vitC: 14 } }),
    carrot: definePer100g({ id: 'carrot', name: 'にんじん', source: '八訂', units: { '本': 150, '半分': 75, 'g': 1 }, per100g: { energy: 35, protein: 0.8, fat: 0.2, carb: 8.7, fiber: 2.4, Na: 28, K: 270, Ca: 26, Mg: 9, P: 26, Fe: 0.2, vitA: 690, vitE: 0.4, vitK: 17, vitB1: 0.07, vitB6: 0.10, folate: 21, vitC: 6 } }),
    potato: definePer100g({ id: 'potato', name: 'じゃがいも', source: '八訂', units: { '個': 150, 'g': 1 }, per100g: { energy: 51, protein: 1.8, fat: 0.1, carb: 17.6, fiber: 8.9, K: 410, Ca: 4, Mg: 19, P: 47, Fe: 0.4, Zn: 0.2, vitB1: 0.09, vitB6: 0.20, folate: 20, vitC: 28 } }),
    daikon: definePer100g({ id: 'daikon', name: '大根', source: '八訂', units: { '輪切り': 100, 'g': 1 }, per100g: { energy: 15, protein: 0.4, fat: 0.1, carb: 4.1, fiber: 1.4, Na: 19, K: 230, Ca: 23, Mg: 10, P: 17, Fe: 0.2, vitB6: 0.05, folate: 33, vitC: 11 } }),
    'bell-pepper': definePer100g({ id: 'bell-pepper', name: 'ピーマン', source: '八訂', units: { '個': 30, 'g': 1 }, per100g: { energy: 20, protein: 0.9, fat: 0.2, carb: 5.1, fiber: 2.3, K: 190, Ca: 11, Mg: 11, P: 22, vitA: 33, vitE: 0.8, vitK: 20, vitB1: 0.03, vitB6: 0.19, folate: 26, vitC: 76 } }),
    'paprika-red': definePer100g({ id: 'paprika-red', name: 'パプリカ赤', source: '八訂', units: { '個': 150, '半分': 75, 'g': 1 }, per100g: { energy: 28, protein: 1.0, fat: 0.2, carb: 7.2, fiber: 1.6, K: 210, Ca: 7, Mg: 10, P: 22, vitA: 88, vitE: 4.3, vitK: 7, vitB6: 0.37, folate: 68, vitC: 170 } }),
    eggplant: definePer100g({ id: 'eggplant', name: 'なす', source: '八訂', units: { '本': 80, 'g': 1 }, per100g: { energy: 18, protein: 1.1, fat: 0.1, carb: 5.1, fiber: 2.2, K: 220, Ca: 18, Mg: 17, P: 30, Fe: 0.3, vitK: 10, vitB6: 0.05, folate: 32, vitC: 4 } }),
    'bean-sprouts': definePer100g({ id: 'bean-sprouts', name: 'もやし', source: '八訂', units: { '袋': 200, '皿': 80, 'g': 1 }, per100g: { energy: 14, protein: 1.7, fat: 0.1, carb: 2.6, fiber: 1.3, K: 69, Ca: 10, Mg: 8, P: 25, vitB1: 0.04, vitB6: 0.05, folate: 41, vitC: 8 } }),
    cucumber: definePer100g({ id: 'cucumber', name: 'きゅうり', source: '八訂', units: { '本': 100, '半分': 50, 'g': 1 }, per100g: { energy: 13, protein: 1.0, fat: 0.1, carb: 3.0, fiber: 1.1, K: 200, Ca: 26, Mg: 15, P: 36, vitK: 34, vitB6: 0.05, folate: 25, vitC: 14 } }),
    pumpkin: definePer100g({ id: 'pumpkin', name: 'かぼちゃ', source: '八訂', units: { '皿': 100, 'g': 1 }, per100g: { energy: 91, protein: 1.9, fat: 0.3, carb: 20.6, fiber: 3.5, K: 450, Ca: 22, Mg: 25, P: 43, Fe: 0.5, vitA: 330, vitE: 4.9, vitK: 25, vitB1: 0.07, vitB6: 0.22, folate: 42, vitC: 43 } }),
    burdock: definePer100g({ id: 'burdock', name: 'ごぼう', source: '八訂', units: { '本': 200, 'g': 1 }, per100g: { energy: 65, protein: 1.8, fat: 0.1, carb: 15.4, fiber: 5.7, K: 320, Ca: 46, Mg: 54, P: 62, Fe: 0.7, Zn: 0.8, vitB6: 0.10, folate: 68, vitC: 3 } }),
    asparagus: definePer100g({ id: 'asparagus', name: 'アスパラガス', source: '八訂', units: { '本': 25, '皿': 100, 'g': 1 }, per100g: { energy: 21, protein: 2.6, fat: 0.2, carb: 3.9, fiber: 1.8, K: 270, Ca: 19, Mg: 9, P: 60, Fe: 0.7, vitA: 31, vitE: 1.5, vitK: 43, vitB1: 0.14, vitB2: 0.15, niacin: 1.4, folate: 190, vitC: 15 } }),
    'lotus-root': definePer100g({ id: 'lotus-root', name: 'れんこん', source: '八訂', units: { '節': 200, '輪切り': 30, 'g': 1 }, per100g: { energy: 66, protein: 1.9, fat: 0.1, carb: 15.5, fiber: 2.0, Na: 24, K: 440, Ca: 20, Mg: 16, P: 74, Fe: 0.5, vitB1: 0.10, vitB6: 0.09, vitC: 48 } }),
    celery: definePer100g({ id: 'celery', name: 'セロリ', source: '八訂', units: { '本': 100, '皿': 80, 'g': 1 }, per100g: { energy: 12, protein: 0.4, fat: 0.1, carb: 3.6, fiber: 1.5, Na: 28, K: 410, Ca: 39, Mg: 9, P: 39, vitA: 4, vitK: 10, vitB6: 0.08, folate: 29, vitC: 7 } }),
    // きのこ
    shimeji: definePer100g({ id: 'shimeji', name: 'しめじ', source: '八訂', units: { 'パック': 100, 'つかみ': 30, 'g': 1 }, per100g: { energy: 22, protein: 2.7, fat: 0.6, carb: 4.8, fiber: 3.0, K: 380, Mg: 11, P: 99, Fe: 0.5, Zn: 0.5, vitB1: 0.16, vitB2: 0.16, niacin: 5.5, vitB6: 0.09, folate: 29, vitD: 0.5 } }),
    shiitake: definePer100g({ id: 'shiitake', name: 'しいたけ生', source: '八訂', units: { '個': 18, 'パック': 100, 'g': 1 }, per100g: { energy: 19, protein: 3.0, fat: 0.3, carb: 4.9, fiber: 4.2, K: 290, Mg: 14, P: 87, Fe: 0.4, Zn: 0.7, Cu: 0.10, vitB1: 0.13, vitB2: 0.21, niacin: 3.4, vitB6: 0.21, folate: 75, vitD: 0.4 } }),
    enoki: definePer100g({ id: 'enoki', name: 'えのき', source: '八訂', units: { 'パック': 100, 'g': 1 }, per100g: { energy: 22, protein: 2.7, fat: 0.2, carb: 7.6, fiber: 3.9, K: 340, Mg: 15, P: 110, Fe: 1.1, Zn: 0.6, vitB1: 0.24, vitB2: 0.17, niacin: 6.8, vitB6: 0.12, folate: 75, vitD: 0.9 } }),
    maitake: definePer100g({ id: 'maitake', name: 'まいたけ', source: '八訂', units: { 'パック': 100, 'g': 1 }, per100g: { energy: 22, protein: 2.0, fat: 0.5, carb: 4.4, fiber: 3.5, K: 230, Mg: 10, P: 54, Fe: 0.2, Zn: 0.7, Cu: 0.22, vitB1: 0.09, vitB2: 0.19, niacin: 5.0, vitB6: 0.06, folate: 53, vitD: 4.9 } }),
    eringi: definePer100g({ id: 'eringi', name: 'エリンギ', source: '八訂', units: { '本': 30, 'パック': 100, 'g': 1 }, per100g: { energy: 31, protein: 2.8, fat: 0.4, carb: 6.0, fiber: 3.4, K: 340, Mg: 12, P: 89, Fe: 0.3, Zn: 0.6, vitB1: 0.11, vitB2: 0.22, niacin: 6.1, vitB6: 0.14, folate: 65, vitD: 1.2 } }),
    nameko: definePer100g({ id: 'nameko', name: 'なめこ', source: '八訂', units: { '袋': 100, 'g': 1 }, per100g: { energy: 21, protein: 1.8, fat: 0.2, carb: 5.4, fiber: 3.4, K: 240, Mg: 10, P: 68, Fe: 0.7, Zn: 0.5, vitB2: 0.12, niacin: 5.3, folate: 60 } }),
    'mushroom-button': definePer100g({ id: 'mushroom-button', name: 'マッシュルーム', source: '八訂', units: { '個': 15, 'パック': 100, 'g': 1 }, per100g: { energy: 15, protein: 2.9, fat: 0.3, carb: 2.1, fiber: 2.0, K: 350, Mg: 10, P: 100, Fe: 0.3, Zn: 0.4, Cu: 0.32, vitB2: 0.29, niacin: 3.6, folate: 28, vitD: 0.3 } }),
    // 果物
    apple: definePer100g({ id: 'apple', name: 'りんご', source: '八訂', units: { '個': 300, '半分': 150, 'g': 1 }, per100g: { energy: 53, protein: 0.1, fat: 0.2, carb: 14.1, fiber: 1.4, K: 110, Ca: 4, Mg: 3, P: 12, vitB6: 0.04, folate: 3, vitC: 6 } }),
    mikan: definePer100g({ id: 'mikan', name: 'みかん', source: '八訂', units: { '個': 100, 'g': 1 }, per100g: { energy: 49, protein: 0.7, fat: 0.1, carb: 12.0, fiber: 1.0, K: 150, Ca: 21, Mg: 11, P: 15, vitA: 84, vitE: 0.4, vitB1: 0.10, vitB6: 0.06, folate: 22, vitC: 32 } }),
    strawberry: definePer100g({ id: 'strawberry', name: 'いちご', source: '八訂', units: { '粒': 15, 'パック': 250, 'g': 1 }, per100g: { energy: 31, protein: 0.9, fat: 0.1, carb: 8.5, fiber: 1.4, K: 170, Ca: 17, Mg: 13, P: 31, Fe: 0.3, vitE: 0.4, vitB6: 0.04, folate: 90, vitC: 62 } }),
    grape: definePer100g({ id: 'grape', name: 'ぶどう', source: '八訂', units: { '粒': 7, '房': 200, 'g': 1 }, per100g: { energy: 58, protein: 0.4, fat: 0.1, carb: 15.7, fiber: 0.5, K: 130, Ca: 6, Mg: 6, P: 15, vitB6: 0.04, folate: 4, vitC: 2 } }),
    kiwi: definePer100g({ id: 'kiwi', name: 'キウイ', source: '八訂', units: { '個': 100, 'g': 1 }, per100g: { energy: 51, protein: 1.0, fat: 0.2, carb: 13.4, fiber: 2.5, K: 300, Ca: 26, Mg: 14, P: 30, Fe: 0.3, vitE: 1.3, vitK: 6, vitB6: 0.12, folate: 37, vitC: 71 } }),
    pineapple: definePer100g({ id: 'pineapple', name: 'パイナップル', source: '八訂', units: { '皿': 100, 'g': 1 }, per100g: { energy: 54, protein: 0.6, fat: 0.1, carb: 13.7, fiber: 1.2, K: 150, Ca: 11, Mg: 14, P: 9, vitB1: 0.09, vitB6: 0.10, folate: 12, vitC: 35 } }),
    pear: definePer100g({ id: 'pear', name: '梨', source: '八訂', units: { '個': 300, 'g': 1 }, per100g: { energy: 38, protein: 0.3, fat: 0.1, carb: 11.3, fiber: 0.9, K: 140, Mg: 5, P: 11, vitC: 3 } }),
    peach: definePer100g({ id: 'peach', name: '桃', source: '八訂', units: { '個': 200, 'g': 1 }, per100g: { energy: 38, protein: 0.6, fat: 0.1, carb: 10.2, fiber: 1.3, K: 180, Mg: 7, P: 18, vitE: 0.7, vitB6: 0.02, folate: 5, vitC: 8 } }),
    blueberry: definePer100g({ id: 'blueberry', name: 'ブルーベリー', source: '八訂', units: { 'パック': 100, 'つかみ': 30, 'g': 1 }, per100g: { energy: 48, protein: 0.5, fat: 0.1, carb: 12.9, fiber: 3.3, K: 70, Ca: 8, Mg: 5, P: 9, Fe: 0.2, vitA: 5, vitE: 1.7, vitK: 25, folate: 12, vitC: 9 } }),
    // 肉類
    'chicken-sasami': definePer100g({ id: 'chicken-sasami', name: '鶏ささみ', source: '八訂', units: { '本': 40, '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 98, protein: 23.9, fat: 0.8, saturatedFat: 0.2, carb: 0.1, Na: 40, K: 410, Mg: 32, P: 240, Fe: 0.3, Zn: 0.6, Se: 22, niacin: 12.0, vitB6: 0.62, vitB12: 0.2, pantothenic: 2.07 } }),
    'chicken-thigh-skinless': definePer100g({ id: 'chicken-thigh-skinless', name: '鶏もも(皮なし)', source: '八訂', units: { '枚': 200, '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 113, protein: 19.0, fat: 5.0, saturatedFat: 1.4, carb: 0, Na: 69, K: 320, P: 190, Fe: 0.6, Zn: 2.0, vitA: 16, vitK: 26, vitB1: 0.10, vitB2: 0.21, niacin: 6.0, vitB6: 0.31, vitB12: 0.4, pantothenic: 1.1 } }),
    'chicken-gizzard': definePer100g({ id: 'chicken-gizzard', name: '鶏砂肝', source: '八訂', units: { '100g': 100, 'g': 1 }, per100g: { energy: 86, protein: 18.3, fat: 1.8, saturatedFat: 0.5, carb: 0, K: 230, P: 140, Fe: 2.5, Zn: 2.8, Cu: 0.10, vitA: 4, vitB2: 0.26, vitB12: 1.7, folate: 36, niacin: 3.9 } }),
    'chicken-liver': definePer100g({ id: 'chicken-liver', name: '鶏レバー', source: '八訂', units: { '100g': 100, 'g': 1 }, per100g: { energy: 100, protein: 18.9, fat: 3.1, saturatedFat: 0.7, carb: 0.6, K: 330, P: 300, Fe: 9.0, Zn: 3.3, Cu: 0.32, vitA: 14000, vitD: 0.2, vitB2: 1.80, niacin: 4.5, vitB6: 0.65, vitB12: 44, folate: 1300, pantothenic: 10.1 } }),
    'pork-fillet': definePer100g({ id: 'pork-fillet', name: '豚ヒレ', source: '八訂', units: { '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 118, protein: 22.2, fat: 3.7, saturatedFat: 1.3, carb: 0.3, Na: 56, K: 430, P: 230, Fe: 0.9, Zn: 2.2, vitB1: 1.32, vitB2: 0.25, niacin: 6.9, vitB6: 0.54, vitB12: 0.5 } }),
    'pork-shoulder': definePer100g({ id: 'pork-shoulder', name: '豚肩ロース', source: '八訂', units: { '100g': 100, 'g': 1 }, per100g: { energy: 237, protein: 17.1, fat: 19.2, saturatedFat: 6.9, carb: 0.1, K: 300, P: 160, Fe: 0.6, Zn: 2.7, vitB1: 0.63, vitB2: 0.23, niacin: 4.0, vitB6: 0.32, vitB12: 0.5 } }),
    'beef-thigh': definePer100g({ id: 'beef-thigh', name: '牛もも', source: '八訂', units: { '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 196, protein: 19.5, fat: 13.3, saturatedFat: 5.1, carb: 0.4, K: 330, P: 180, Fe: 1.4, Zn: 4.0, vitA: 4, vitB1: 0.09, vitB2: 0.21, niacin: 4.5, vitB6: 0.32, vitB12: 1.2 } }),
    'beef-fillet': definePer100g({ id: 'beef-fillet', name: '牛ヒレ', source: '八訂', units: { '手のひら': 100, '100g': 100, 'g': 1 }, per100g: { energy: 177, protein: 20.5, fat: 11.2, saturatedFat: 4.2, carb: 0.3, K: 380, P: 200, Fe: 2.5, Zn: 4.2, vitB1: 0.10, vitB2: 0.27, niacin: 4.9, vitB6: 0.39, vitB12: 1.6 } }),
    bacon: definePer100g({ id: 'bacon', name: 'ベーコン', source: '八訂', units: { '枚': 20, 'g': 1 }, per100g: { energy: 405, protein: 12.9, fat: 39.1, saturatedFat: 14.0, carb: 0.3, salt: 2.0, Na: 800, K: 210, P: 230, Fe: 0.6, Zn: 1.8, vitB1: 0.47, vitB2: 0.14, niacin: 3.6, vitB6: 0.18, vitB12: 0.7 } }),
    // 魚介
    aji: definePer100g({ id: 'aji', name: 'あじ', source: '八訂', units: { '尾': 100, '切れ': 80, 'g': 1 }, per100g: { energy: 112, protein: 19.7, fat: 4.5, saturatedFat: 1.1, n3: 0.9, carb: 0.1, Na: 130, K: 360, Ca: 66, Mg: 34, P: 230, Fe: 0.6, Zn: 1.1, Se: 46, vitA: 7, vitD: 8.9, vitE: 0.6, niacin: 5.5, vitB6: 0.30, vitB12: 7.1 } }),
    iwashi: definePer100g({ id: 'iwashi', name: 'いわし', source: '八訂', units: { '尾': 80, 'g': 1 }, per100g: { energy: 169, protein: 19.2, fat: 9.2, saturatedFat: 2.6, n3: 2.1, carb: 0.2, Na: 81, K: 270, Ca: 74, Mg: 30, P: 230, Fe: 2.1, Zn: 1.6, vitD: 32, vitB2: 0.39, niacin: 7.2, vitB6: 0.49, vitB12: 16 } }),
    buri: definePer100g({ id: 'buri', name: 'ぶり', source: '八訂', units: { '切れ': 100, 'g': 1 }, per100g: { energy: 222, protein: 21.4, fat: 17.6, saturatedFat: 4.4, n3: 3.4, carb: 0.3, Na: 32, K: 380, P: 200, Fe: 1.3, Zn: 0.7, Se: 57, vitA: 50, vitD: 8.0, vitE: 2.0, vitB1: 0.23, vitB2: 0.36, niacin: 9.5, vitB6: 0.42, vitB12: 3.8 } }),
    tara: definePer100g({ id: 'tara', name: 'たら', source: '八訂', units: { '切れ': 100, 'g': 1 }, per100g: { energy: 72, protein: 17.6, fat: 0.2, carb: 0.1, Na: 110, K: 350, Mg: 24, P: 230, Fe: 0.2, Zn: 0.5, Se: 31, vitD: 0.5, vitB12: 1.3 } }),
    'tuna-akami': definePer100g({ id: 'tuna-akami', name: 'まぐろ赤身', source: '八訂', units: { '柵100g': 100, '切れ': 60, 'g': 1 }, per100g: { energy: 115, protein: 26.4, fat: 1.4, n3: 0.17, carb: 0.1, Na: 49, K: 380, P: 270, Fe: 1.1, Zn: 0.4, Se: 110, vitD: 5.0, vitB12: 1.3, niacin: 14.2, vitB6: 0.85 } }),
    hotate: definePer100g({ id: 'hotate', name: 'ホタテ', source: '八訂', units: { '個': 30, 'g': 1 }, per100g: { energy: 72, protein: 13.5, fat: 0.9, carb: 1.5, salt: 0.8, Na: 320, K: 310, Ca: 22, Mg: 59, P: 230, Fe: 2.2, Zn: 2.7, vitB12: 11, niacin: 1.7, folate: 87 } }),
    ebi: definePer100g({ id: 'ebi', name: 'エビ', source: '八訂', units: { '尾': 15, 'g': 1 }, per100g: { energy: 82, protein: 19.6, fat: 0.3, carb: 0.7, Na: 110, K: 270, Ca: 67, Mg: 39, P: 240, Fe: 0.6, Zn: 1.2, Cu: 0.41, Se: 30, vitE: 1.7, vitB12: 1.9, niacin: 1.3 } }),
    ika: definePer100g({ id: 'ika', name: 'イカ', source: '八訂', units: { '杯': 200, '足': 30, 'g': 1 }, per100g: { energy: 88, protein: 17.9, fat: 0.8, carb: 0.1, Na: 200, K: 300, Mg: 46, P: 250, Fe: 0.1, Zn: 1.5, Cu: 0.29, Se: 41, vitE: 2.1, niacin: 4.0, vitB12: 4.9 } }),
    tako: definePer100g({ id: 'tako', name: 'たこ', source: '八訂', units: { '足': 80, 'g': 1 }, per100g: { energy: 70, protein: 16.4, fat: 0.7, carb: 0.1, Na: 280, K: 290, Ca: 16, Mg: 55, P: 160, Fe: 0.6, Zn: 1.6, Cu: 0.30, Se: 44, vitE: 1.9, niacin: 2.2, vitB12: 1.3 } }),
    asari: definePer100g({ id: 'asari', name: 'アサリ', source: '八訂', units: { '個': 10, 'パック': 200, 'g': 1 }, per100g: { energy: 27, protein: 6.0, fat: 0.3, carb: 0.4, salt: 2.2, Na: 870, K: 140, Ca: 66, Mg: 100, P: 85, Fe: 3.8, Zn: 1.0, Cu: 0.10, Se: 38, vitB2: 0.16, vitB12: 52, niacin: 1.4 } }),
    // 乳製品
    'plain-yogurt': definePer100g({ id: 'plain-yogurt', name: 'プレーンヨーグルト無糖', source: '八訂', units: { '個': 100, 'パック': 400, 'g': 1 }, per100g: { energy: 56, protein: 3.6, fat: 3.0, saturatedFat: 1.8, carb: 4.9, salt: 0.1, Na: 48, K: 170, Ca: 120, Mg: 12, P: 100, Zn: 0.4, vitA: 33, vitB1: 0.04, vitB2: 0.14, vitB6: 0.04, vitB12: 0.1, folate: 11, pantothenic: 0.49, vitC: 1 } }),
    'soy-milk': definePer100g({ id: 'soy-milk', name: '豆乳(無調整)', source: '八訂', units: { '杯': 200, 'パック': 200, 'ml': 1 }, per100g: { energy: 44, protein: 3.6, fat: 2.0, carb: 3.1, fiber: 0.2, Na: 2, K: 190, Ca: 15, Mg: 25, P: 49, Fe: 1.2, Zn: 0.3, vitE: 0.1, vitB1: 0.03, vitB2: 0.02, folate: 28 } }),
    butter: definePer100g({ id: 'butter', name: 'バター', source: '八訂', units: { '大さじ': 12, '小さじ': 4, 'g': 1 }, per100g: { energy: 700, protein: 0.6, fat: 81.0, saturatedFat: 50.5, carb: 0.2, salt: 1.9, Na: 750, K: 28, Ca: 15, P: 15, vitA: 520, vitD: 0.6, vitE: 1.5 } }),
    'cream-cheese': definePer100g({ id: 'cream-cheese', name: 'クリームチーズ', source: '八訂', units: { '大さじ': 15, 'g': 1 }, per100g: { energy: 313, protein: 8.2, fat: 33.0, saturatedFat: 21.1, carb: 2.3, salt: 0.7, Na: 260, K: 70, Ca: 70, P: 85, Fe: 0.1, vitA: 250, vitB2: 0.22, niacin: 0.1 } }),
    mozzarella: definePer100g({ id: 'mozzarella', name: 'モッツァレラ', source: '八訂', units: { '個': 100, '枚': 30, 'g': 1 }, per100g: { energy: 269, protein: 18.4, fat: 19.9, saturatedFat: 12.1, carb: 4.2, salt: 0.2, Na: 70, K: 20, Ca: 330, P: 260, Zn: 2.8, vitA: 280, vitB2: 0.19, vitB12: 1.6 } }),
    // 発酵・調味料
    miso: definePer100g({ id: 'miso', name: '味噌(淡色)', source: '八訂', units: { '大さじ': 18, '小さじ': 6, 'g': 1 }, per100g: { energy: 192, protein: 12.5, fat: 6.0, carb: 21.9, fiber: 4.9, salt: 12.4, Na: 4900, K: 380, Ca: 100, Mg: 75, P: 170, Fe: 4.0, Zn: 1.1, vitB1: 0.03, vitB2: 0.10, niacin: 1.5, vitB6: 0.11, folate: 68 } }),
    'soy-sauce': definePer100g({ id: 'soy-sauce', name: '醤油(濃口)', source: '八訂', units: { '大さじ': 18, '小さじ': 6, 'ml': 1 }, per100g: { energy: 76, protein: 7.7, fat: 0, carb: 7.9, salt: 14.5, Na: 5700, K: 390, Ca: 29, Mg: 65, P: 160, Fe: 1.7, vitB1: 0.05, vitB2: 0.17, niacin: 1.6, folate: 33 } }),
    vinegar: definePer100g({ id: 'vinegar', name: '酢(穀物)', source: '八訂', units: { '大さじ': 15, '小さじ': 5, 'ml': 1 }, per100g: { energy: 25, protein: 0.1, fat: 0, carb: 2.4, Na: 6, K: 4 } }),
    mayonnaise: definePer100g({ id: 'mayonnaise', name: 'マヨネーズ', source: '八訂', units: { '大さじ': 12, '小さじ': 4, 'g': 1 }, per100g: { energy: 668, protein: 1.4, fat: 76.0, saturatedFat: 6.0, carb: 3.6, salt: 1.9, Na: 730, K: 13, vitE: 13.0, vitK: 71 } }),
    ketchup: definePer100g({ id: 'ketchup', name: 'ケチャップ', source: '八訂', units: { '大さじ': 15, 'g': 1 }, per100g: { energy: 106, protein: 1.6, fat: 0.2, carb: 27.6, fiber: 1.7, salt: 3.1, Na: 1200, K: 380, Ca: 16, Mg: 13, vitA: 50, vitC: 8 } }),
    // 穀類・加工品
    'brown-rice': definePer100g({ id: 'brown-rice', name: '玄米(炊飯)', source: '八訂', units: { '膳': 150, '杯': 120, 'g': 1 }, per100g: { energy: 152, protein: 2.8, fat: 1.0, carb: 35.6, fiber: 1.4, K: 95, Ca: 7, Mg: 49, P: 130, Fe: 0.6, Zn: 0.8, Mn: 1.04, vitB1: 0.16, vitB2: 0.02, niacin: 2.9, vitB6: 0.21, folate: 10 } }),
    mochi: definePer100g({ id: 'mochi', name: 'もち', source: '八訂', units: { '個': 50, 'g': 1 }, per100g: { energy: 223, protein: 4.0, fat: 0.6, carb: 50.8, fiber: 0.5, K: 32, Ca: 3, Mg: 6, P: 22, Fe: 0.1, vitB1: 0.03 } }),
    'somen-dry': definePer100g({ id: 'somen-dry', name: 'そうめん(乾)', source: '八訂', units: { '束': 50, 'g': 1 }, per100g: { energy: 333, protein: 9.5, fat: 1.1, carb: 72.7, fiber: 2.5, salt: 5.8, Na: 2300, K: 110, Ca: 17, Mg: 22, P: 70, Fe: 0.6, Zn: 0.4, vitB1: 0.08, niacin: 0.9, folate: 8 } }),
    'roll-bread': definePer100g({ id: 'roll-bread', name: 'ロールパン', source: '八訂', units: { '個': 30, 'g': 1 }, per100g: { energy: 309, protein: 10.1, fat: 9.0, saturatedFat: 4.0, carb: 48.6, fiber: 2.0, salt: 1.2, Na: 490, K: 110, Ca: 44, Mg: 22, P: 97, Fe: 0.7, Zn: 0.8, vitA: 28, vitB1: 0.10, vitB2: 0.06, niacin: 1.3, folate: 38 } }),
    'ramen-noodle': definePer100g({ id: 'ramen-noodle', name: '中華麺(生)', source: '八訂', units: { '玉': 130, 'g': 1 }, per100g: { energy: 249, protein: 8.6, fat: 1.2, carb: 50.3, fiber: 2.1, salt: 1.0, Na: 410, K: 120, Ca: 21, Mg: 13, P: 70, Fe: 0.5, Zn: 0.4, vitB1: 0.02, vitB2: 0.02, niacin: 0.6 } }),
    // 卵料理
    tamagoyaki: definePer100g({ id: 'tamagoyaki', name: '卵焼き(出汁巻)', source: '八訂', units: { '切れ': 30, 'g': 1 }, per100g: { energy: 137, protein: 9.6, fat: 8.4, saturatedFat: 2.7, carb: 4.1, salt: 1.1, Na: 470, K: 130, Ca: 41, Mg: 11, P: 130, Fe: 1.3, Zn: 1.0, vitA: 130, vitD: 1.1, vitB2: 0.31, niacin: 0.4, vitB12: 0.7, folate: 31 } }),
    // 海藻
    nori: definePer100g({ id: 'nori', name: '焼きのり', source: '八訂', units: { '枚': 3, 'g': 1 }, per100g: { energy: 297, protein: 41.4, fat: 3.7, carb: 44.3, fiber: 36.0, salt: 1.3, Na: 530, K: 2400, Ca: 280, Mg: 300, P: 700, Fe: 11.4, Zn: 3.6, Cu: 0.55, vitA: 2300, vitB1: 0.69, vitB2: 2.33, niacin: 12.0, vitB6: 0.59, vitB12: 78, folate: 1900, vitC: 210 } }),
    'hijiki-dry': definePer100g({ id: 'hijiki-dry', name: 'ひじき(乾)', source: '八訂', units: { '大さじ': 3, 'g': 1 }, per100g: { energy: 180, protein: 9.2, fat: 3.2, carb: 58.4, fiber: 51.8, salt: 4.7, Na: 1800, K: 6400, Ca: 1000, Mg: 640, P: 93, Fe: 6.2, Zn: 1.0, I: 45000, vitA: 360, vitK: 580, folate: 93 } }),
    'kombu-dry': definePer100g({ id: 'kombu-dry', name: '昆布(乾)', source: '八訂', units: { '小さじ': 2, 'g': 1 }, per100g: { energy: 170, protein: 5.8, fat: 1.3, carb: 64.7, fiber: 27.1, salt: 7.1, Na: 2800, K: 6100, Ca: 780, Mg: 530, P: 180, Fe: 3.0, Zn: 0.9, I: 230000, vitB1: 0.26, vitB2: 0.31, folate: 230 } }),
    // 大豆製品
    atsuage: definePer100g({ id: 'atsuage', name: '厚揚げ', source: '八訂', units: { '丁': 200, '個': 100, 'g': 1 }, per100g: { energy: 143, protein: 10.7, fat: 11.3, saturatedFat: 1.6, carb: 0.9, fiber: 0.7, Na: 4, K: 120, Ca: 240, Mg: 55, P: 150, Fe: 2.6, Zn: 1.1, vitE: 0.8, vitK: 25, folate: 23 } }),
    'abura-age': definePer100g({ id: 'abura-age', name: '油揚げ', source: '八訂', units: { '枚': 30, 'g': 1 }, per100g: { energy: 377, protein: 23.4, fat: 34.4, saturatedFat: 4.5, carb: 0.4, fiber: 1.3, Na: 4, K: 86, Ca: 310, Mg: 130, P: 350, Fe: 3.2, Zn: 2.5, vitE: 1.3, vitK: 67, folate: 18 } }),
    'edamame-boiled': definePer100g({ id: 'edamame-boiled', name: 'ゆで枝豆', source: '八訂', units: { '皿': 80, 'g': 1 }, per100g: { energy: 134, protein: 11.5, fat: 6.1, saturatedFat: 0.9, n3: 0.5, carb: 8.9, fiber: 4.6, K: 490, Ca: 76, Mg: 65, P: 170, Fe: 2.5, Zn: 1.3, vitA: 22, vitE: 0.6, vitK: 33, vitB1: 0.24, vitB2: 0.13, folate: 260, vitC: 15 } }),
    'daizu-mushi': definePer100g({ id: 'daizu-mushi', name: '蒸し大豆', source: '八訂', units: { 'パック': 100, 'g': 1 }, per100g: { energy: 217, protein: 16.6, fat: 9.8, saturatedFat: 1.4, n3: 0.5, n6: 5.0, carb: 9.9, fiber: 6.8, K: 750, Ca: 79, Mg: 100, P: 250, Fe: 2.8, Zn: 1.9, vitE: 0.9, vitK: 11, vitB1: 0.17, vitB2: 0.08, folate: 41 } }),
    // ブランド商品（要監査）
    'prod-lunch-pack-egg': definePerUnit({ id: 'prod-lunch-pack-egg', name: 'ランチパック たまご', source: 'ヤマザキ公表値・要確認', unitLabel: '袋(2個)', perUnit: { energy: 296, protein: 8.6, fat: 12.4, carb: 38.6, salt: 1.0, Na: 410 } }),
    // === スーパー パンコーナー ===
    'whole-wheat-bread': definePer100g({ id: 'whole-wheat-bread', name: '全粒粉パン', source: '八訂', units: { '枚': 60, 'g': 1 }, per100g: { energy: 257, protein: 7.9, fat: 5.7, carb: 47.6, fiber: 5.7, salt: 1.3, Na: 510, K: 220, Ca: 18, Mg: 70, P: 130, Fe: 1.3, Zn: 1.3, vitB1: 0.16, niacin: 2.2, folate: 49 } }),
    baguette: definePer100g({ id: 'baguette', name: 'フランスパン', source: '八訂', units: { '切': 30, '本': 250, 'g': 1 }, per100g: { energy: 289, protein: 9.4, fat: 1.3, carb: 57.5, fiber: 2.7, salt: 1.6, Na: 620, K: 110, Ca: 16, Mg: 22, P: 72, Fe: 0.9, Zn: 0.8, vitB1: 0.08, folate: 33 } }),
    croissant: definePerUnit({ id: 'croissant', name: 'クロワッサン', source: '八訂', unitLabel: '個', perUnit: { energy: 175, protein: 3.2, fat: 10.7, saturatedFat: 6.1, carb: 17.6, salt: 0.6, Na: 240, Ca: 8 } }),
    'melon-bread': definePerUnit({ id: 'melon-bread', name: 'メロンパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 349, protein: 8.0, fat: 10.5, carb: 56.2, salt: 0.5, Na: 200 } }),
    'curry-bread': definePerUnit({ id: 'curry-bread', name: 'カレーパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 302, protein: 6.6, fat: 18.3, carb: 30.7, salt: 1.2, Na: 480 } }),
    'anpan': definePerUnit({ id: 'anpan', name: 'あんパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 280, protein: 7.9, fat: 5.3, carb: 50.2, salt: 0.3 } }),
    'cream-bread': definePerUnit({ id: 'cream-bread', name: 'クリームパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 286, protein: 7.9, fat: 8.0, carb: 47.7, salt: 0.4 } }),
    'english-muffin': definePerUnit({ id: 'english-muffin', name: 'イングリッシュマフィン', source: '商品近似', unitLabel: '個', perUnit: { energy: 134, protein: 4.5, fat: 0.9, carb: 23.8, fiber: 1.3, salt: 0.7, Na: 280, Ca: 32 } }),
    bagel: definePerUnit({ id: 'bagel', name: 'ベーグル', source: '商品近似', unitLabel: '個', perUnit: { energy: 196, protein: 7.7, fat: 1.3, carb: 39.8, fiber: 1.6, salt: 1.1 } }),
    'prod-lunch-pack-peanut': definePerUnit({ id: 'prod-lunch-pack-peanut', name: 'ランチパック ピーナッツ', source: 'ヤマザキ公表値・要確認', unitLabel: '袋(2個)', perUnit: { energy: 314, protein: 7.4, fat: 13.3, carb: 41.3, salt: 0.7 } }),
    'prod-lunch-pack-tuna': definePerUnit({ id: 'prod-lunch-pack-tuna', name: 'ランチパック ツナマヨ', source: 'ヤマザキ公表値・要確認', unitLabel: '袋(2個)', perUnit: { energy: 304, protein: 10.0, fat: 14.8, carb: 33.2, salt: 1.2 } }),
    // === パンコーナー追加 2026-05-27 (cowork): スーパーで見かける主要パン ===
    'fluffy-bread-6': definePer100g({ id: 'fluffy-bread-6', name: 'ふんわり食パン6枚切', source: 'パスコ超熟相当・要確認', units: { '枚': 60, 'g': 1 }, per100g: { energy: 260, protein: 9.5, fat: 3.2, carb: 48.5, fiber: 2.0, salt: 1.2, Na: 470, Ca: 30 } }),
    'yamazaki-choco-stick': definePerUnit({ id: 'yamazaki-choco-stick', name: '山崎 チョコスティックパン', source: 'ヤマザキ公表値・要確認', unitLabel: '本', perUnit: { energy: 174, protein: 3.0, fat: 8.5, carb: 22.0, salt: 0.3 } }),
    'yamazaki-raisin-margarine-roll': definePerUnit({ id: 'yamazaki-raisin-margarine-roll', name: '山崎 レーズンマーガリンロール', source: 'ヤマザキ公表値・要確認', unitLabel: '個', perUnit: { energy: 170, protein: 4.0, fat: 5.0, carb: 28.0, salt: 0.4 } }),
    'cheese-bread': definePerUnit({ id: 'cheese-bread', name: 'チーズパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 215, protein: 8.5, fat: 9.0, carb: 25.0, salt: 0.9, Ca: 100 } }),
    'pizza-pan': definePerUnit({ id: 'pizza-pan', name: 'ピザパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 270, protein: 11.0, fat: 9.0, carb: 35.0, salt: 1.4 } }),
    'ham-roll-pan': definePerUnit({ id: 'ham-roll-pan', name: 'ハムロールパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 220, protein: 7.0, fat: 9.5, carb: 26.0, salt: 1.1 } }),
    'koroke-pan': definePerUnit({ id: 'koroke-pan', name: 'コロッケパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 280, protein: 6.0, fat: 12.0, carb: 36.0, salt: 1.2 } }),
    'danish-pastry': definePerUnit({ id: 'danish-pastry', name: 'デニッシュ', source: '商品近似', unitLabel: '個', perUnit: { energy: 280, protein: 4.5, fat: 16.0, carb: 28.0, salt: 0.4 } }),
    'milk-france': definePerUnit({ id: 'milk-france', name: 'ミルクフランス', source: '商品近似', unitLabel: '本', perUnit: { energy: 280, protein: 5.0, fat: 10.0, carb: 41.0, salt: 0.8 } }),
    'soft-france': definePerUnit({ id: 'soft-france', name: 'ソフトフランス', source: '商品近似', unitLabel: '本', perUnit: { energy: 290, protein: 7.5, fat: 5.0, carb: 53.0, salt: 1.3 } }),
    'kinako-fried-bread': definePerUnit({ id: 'kinako-fried-bread', name: 'きなこ揚げパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 295, protein: 5.0, fat: 12.0, carb: 41.0, salt: 0.5 } }),
    'hotdog-pan': definePerUnit({ id: 'hotdog-pan', name: 'ホットドッグパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 180, protein: 6.0, fat: 3.0, carb: 32.0, salt: 0.7 } }),
    'chigiri-pan': definePerUnit({ id: 'chigiri-pan', name: 'ちぎりパン', source: '商品近似', unitLabel: '個', perUnit: { energy: 95, protein: 2.5, fat: 2.5, carb: 15.5, salt: 0.3 } }),
    'pizza-toast': definePerUnit({ id: 'pizza-toast', name: 'ピザトースト', source: '自作近似(食パン+チーズ+ハム+トマト)', unitLabel: '枚', perUnit: { energy: 320, protein: 14.0, fat: 13.0, carb: 35.0, salt: 1.8, Ca: 180 } }),
    'cheese-toast': definePerUnit({ id: 'cheese-toast', name: 'チーズトースト', source: '自作近似(食パン+スライスチーズ)', unitLabel: '枚', perUnit: { energy: 240, protein: 11.0, fat: 9.0, carb: 29.0, salt: 1.3, Ca: 130 } }),
    // === 冷凍食品コーナー ===
    'frozen-gyoza': definePerUnit({ id: 'frozen-gyoza', name: '冷凍餃子', source: '商品近似(味の素相当)', unitLabel: '個', perUnit: { energy: 46, protein: 1.6, fat: 2.0, carb: 5.2, salt: 0.18, Na: 70 } }),
    'frozen-shumai': definePerUnit({ id: 'frozen-shumai', name: '冷凍シュウマイ', source: '商品近似', unitLabel: '個', perUnit: { energy: 38, protein: 1.7, fat: 1.6, carb: 4.0, salt: 0.16 } }),
    'frozen-fried-rice': definePer100g({ id: 'frozen-fried-rice', name: '冷凍チャーハン', source: '商品近似', units: { '袋': 250, '皿': 250, 'g': 1 }, per100g: { energy: 165, protein: 4.0, fat: 5.0, carb: 26.0, fiber: 1.0, salt: 1.0, Na: 400, K: 100 } }),
    'frozen-pizza': definePerUnit({ id: 'frozen-pizza', name: '冷凍ピザ(マルゲリータ)', source: '商品近似', unitLabel: '枚', perUnit: { energy: 540, protein: 22.0, fat: 18.0, carb: 70.0, fiber: 3.5, salt: 2.4, Ca: 280 } }),
    'frozen-karaage': definePer100g({ id: 'frozen-karaage', name: '冷凍唐揚げ', source: '商品近似', units: { '個': 25, '皿': 100, 'g': 1 }, per100g: { energy: 250, protein: 14.0, fat: 15.0, carb: 12.0, salt: 1.3, Na: 500 } }),
    'frozen-shrimp-fry': definePerUnit({ id: 'frozen-shrimp-fry', name: '冷凍えびフライ', source: '商品近似', unitLabel: '個', perUnit: { energy: 90, protein: 4.0, fat: 4.8, carb: 8.0, salt: 0.3 } }),
    'frozen-croquette': definePerUnit({ id: 'frozen-croquette', name: '冷凍コロッケ', source: '商品近似', unitLabel: '個', perUnit: { energy: 140, protein: 2.8, fat: 5.6, carb: 19.6, salt: 0.5 } }),
    'frozen-hamburg': definePerUnit({ id: 'frozen-hamburg', name: '冷凍ハンバーグ', source: '商品近似', unitLabel: '個', perUnit: { energy: 230, protein: 11.0, fat: 17.0, carb: 8.0, salt: 1.4 } }),
    'frozen-mix-veg': definePer100g({ id: 'frozen-mix-veg', name: '冷凍野菜ミックス', source: '商品近似', units: { '皿': 100, 'g': 1 }, per100g: { energy: 35, protein: 2.0, fat: 0.2, carb: 7.0, fiber: 2.4, K: 200, vitA: 250, vitC: 15 } }),
    'frozen-broccoli': definePer100g({ id: 'frozen-broccoli', name: '冷凍ブロッコリー', source: '商品近似', units: { '皿': 100, 'g': 1 }, per100g: { energy: 28, protein: 3.0, fat: 0.2, carb: 4.5, fiber: 3.5, K: 380, Ca: 40, vitA: 60, vitE: 2.0, vitK: 130, folate: 180, vitC: 70 } }),
    'frozen-yaki-onigiri': definePerUnit({ id: 'frozen-yaki-onigiri', name: '冷凍焼きおにぎり', source: '商品近似', unitLabel: '個', perUnit: { energy: 165, protein: 3.0, fat: 0.5, carb: 36.0, salt: 1.0, Na: 400 } }),
    'frozen-takoyaki': definePerUnit({ id: 'frozen-takoyaki', name: '冷凍たこ焼き', source: '商品近似', unitLabel: '個', perUnit: { energy: 33, protein: 1.0, fat: 1.2, carb: 4.0, salt: 0.15 } }),
    // === アイスコーナー ===
    'ice-haagen-vanilla': definePerUnit({ id: 'ice-haagen-vanilla', name: 'ハーゲンダッツ バニラ', source: 'ハーゲンダッツ公表値', unitLabel: '個(110ml)', perUnit: { energy: 244, protein: 4.6, fat: 16.3, carb: 19.9, Ca: 120 } }),
    'ice-haagen-strawberry': definePerUnit({ id: 'ice-haagen-strawberry', name: 'ハーゲンダッツ ストロベリー', source: 'ハーゲンダッツ公表値', unitLabel: '個(110ml)', perUnit: { energy: 222, protein: 4.0, fat: 13.5, carb: 21.7, Ca: 110 } }),
    'ice-yukimi-daifuku': definePerUnit({ id: 'ice-yukimi-daifuku', name: '雪見だいふく', source: 'ロッテ公表値', unitLabel: '個(47ml)', perUnit: { energy: 80, protein: 0.8, fat: 3.6, carb: 11.2 } }),
    'ice-garigarikun-soda': definePerUnit({ id: 'ice-garigarikun-soda', name: 'ガリガリ君ソーダ', source: '赤城乳業公表値', unitLabel: '本', perUnit: { energy: 64, protein: 0.4, fat: 0, carb: 15.8 } }),
    'ice-papico-choco': definePerUnit({ id: 'ice-papico-choco', name: 'パピコ チョココーヒー', source: 'グリコ公表値', unitLabel: '本(1本)', perUnit: { energy: 84, protein: 1.6, fat: 3.2, carb: 12.3 } }),
    'ice-super-cup-vanilla': definePerUnit({ id: 'ice-super-cup-vanilla', name: 'スーパーカップ バニラ', source: '明治公表値', unitLabel: '個(200ml)', perUnit: { energy: 374, protein: 5.4, fat: 17.0, carb: 52.0, Ca: 150 } }),
    'ice-mow-vanilla': definePerUnit({ id: 'ice-mow-vanilla', name: 'MOW バニラ', source: '森永公表値', unitLabel: '個', perUnit: { energy: 196, protein: 3.6, fat: 10.2, carb: 22.4, Ca: 110 } }),
    'ice-pino': definePerUnit({ id: 'ice-pino', name: 'ピノ', source: '森永公表値', unitLabel: '粒', perUnit: { energy: 31, protein: 0.4, fat: 2.0, carb: 2.8 } }),
    'ice-palm-choco': definePerUnit({ id: 'ice-palm-choco', name: 'パルム チョコ', source: '森永公表値', unitLabel: '本', perUnit: { energy: 219, protein: 3.0, fat: 15.0, carb: 19.0, Ca: 90 } }),
    'ice-cream-generic': definePer100g({ id: 'ice-cream-generic', name: 'アイスクリーム(普通)', source: '八訂', units: { '皿': 100, 'g': 1 }, per100g: { energy: 178, protein: 3.5, fat: 8.0, saturatedFat: 5.0, carb: 23.2, salt: 0.2, Na: 80, Ca: 140, P: 110, vitA: 100, vitB2: 0.20 } }),
    // === 2026-05-29 (cowork) 和食常食+外食定番 一括拡充 ===
    'wa-nikujaga': definePer100g({ id: 'wa-nikujaga', name: '肉じゃが', source: '八訂2020近似', units: { '小鉢': 80, '皿': 150, 'g': 1 }, per100g: { energy: 78, protein: 4.3, fat: 1.3, carb: 13, salt: 1, Na: 400 } }),
    'wa-chikuzenni': definePer100g({ id: 'wa-chikuzenni', name: '筑前煮', source: '八訂2020近似', units: { '小鉢': 80, '皿': 150, 'g': 1 }, per100g: { energy: 85, protein: 4.4, fat: 3.5, carb: 10.2, salt: 1.2, Na: 480 } }),
    'wa-kinpira': definePer100g({ id: 'wa-kinpira', name: 'きんぴらごぼう', source: '八訂2020近似', units: { '小鉢': 50, '皿': 80, 'g': 1 }, per100g: { energy: 84, protein: 1.4, fat: 4.5, carb: 11.3, salt: 1.2, Na: 480 } }),
    'wa-hijiki-ni': definePer100g({ id: 'wa-hijiki-ni', name: 'ひじきの煮物', source: '八訂2020近似', units: { '小鉢': 50, '皿': 80, 'g': 1 }, per100g: { energy: 75, protein: 3, fat: 4, carb: 9.9, salt: 1.4, Na: 560 } }),
    'wa-kabocha-ni': definePer100g({ id: 'wa-kabocha-ni', name: 'かぼちゃの煮物', source: '八訂2020近似', units: { '小鉢': 80, '皿': 120, 'g': 1 }, per100g: { energy: 90, protein: 1.5, fat: 0.5, carb: 20, salt: 0.9, Na: 360 } }),
    'wa-kiriboshi': definePer100g({ id: 'wa-kiriboshi', name: '切り干し大根の煮物', source: '八訂2020近似', units: { '小鉢': 50, '皿': 80, 'g': 1 }, per100g: { energy: 70, protein: 2, fat: 2.5, carb: 11, salt: 1.2, Na: 480 } }),
    'wa-satoimo-ni': definePer100g({ id: 'wa-satoimo-ni', name: '里芋の煮物', source: '八訂2020近似', units: { '小鉢': 80, '皿': 120, 'g': 1 }, per100g: { energy: 80, protein: 2, fat: 0.5, carb: 17, salt: 1, Na: 400 } }),
    'wa-buri-daikon': definePer100g({ id: 'wa-buri-daikon', name: 'ぶり大根', source: '八訂2020近似', units: { '小鉢': 100, '皿': 150, 'g': 1 }, per100g: { energy: 120, protein: 9, fat: 6, carb: 6, salt: 1.2, Na: 480 } }),
    'wa-tonkatsu': definePer100g({ id: 'wa-tonkatsu', name: 'とんかつ(ロース)', source: '八訂2020近似', units: { '枚': 150, '100g': 100, 'g': 1 }, per100g: { energy: 333, protein: 19, fat: 23, carb: 11, salt: 0.8, Na: 320 } }),
    'wa-karaage': definePer100g({ id: 'wa-karaage', name: '鶏の唐揚げ(惣菜)', source: '八訂2020近似', units: { '個': 30, '皿': 120, 'g': 1 }, per100g: { energy: 290, protein: 17, fat: 18, carb: 13, salt: 1.2, Na: 480 } }),
    'wa-chicken-nanban': definePer100g({ id: 'wa-chicken-nanban', name: 'チキン南蛮', source: '八訂2020近似', units: { '皿': 180, '100g': 100, 'g': 1 }, per100g: { energy: 270, protein: 15, fat: 18, carb: 12, salt: 1.3, Na: 520 } }),
    'wa-tempura-shrimp': definePerUnit({ id: 'wa-tempura-shrimp', name: 'えびの天ぷら', source: '八訂2020近似', unitLabel: '本', perUnit: { energy: 75, protein: 5, fat: 3.5, carb: 6, salt: 0.3 } }),
    'wa-tempura-veg': definePerUnit({ id: 'wa-tempura-veg', name: '野菜の天ぷら', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 70, protein: 1, fat: 4, carb: 8, salt: 0.2 } }),
    'wa-aji-fry': definePerUnit({ id: 'wa-aji-fry', name: 'アジフライ', source: '八訂2020近似', unitLabel: '枚', perUnit: { energy: 190, protein: 12, fat: 12, carb: 8, salt: 0.6 } }),
    'wa-menchi': definePerUnit({ id: 'wa-menchi', name: 'メンチカツ', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 230, protein: 9, fat: 15, carb: 15, salt: 0.9 } }),
    'wa-korokke': definePerUnit({ id: 'wa-korokke', name: 'コロッケ(惣菜)', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 160, protein: 3.5, fat: 8, carb: 19, salt: 0.6 } }),
    'wa-agedashi': definePer100g({ id: 'wa-agedashi', name: '揚げ出し豆腐', source: '八訂2020近似', units: { '皿': 150, '100g': 100, 'g': 1 }, per100g: { energy: 110, protein: 6, fat: 7, carb: 6, salt: 1, Na: 400 } }),
    'wa-shogayaki': definePer100g({ id: 'wa-shogayaki', name: '豚の生姜焼き', source: '八訂2020近似', units: { '皿': 150, '100g': 100, 'g': 1 }, per100g: { energy: 230, protein: 14, fat: 16, carb: 6, salt: 1.3, Na: 520 } }),
    'wa-mabo': definePer100g({ id: 'wa-mabo', name: '麻婆豆腐', source: '八訂2020近似', units: { '皿': 200, '100g': 100, 'g': 1 }, per100g: { energy: 104, protein: 7, fat: 7, carb: 4, salt: 1.2, Na: 480 } }),
    'wa-hamburg-home': definePerUnit({ id: 'wa-hamburg-home', name: 'ハンバーグ(手作り)', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 300, protein: 17, fat: 21, carb: 11, salt: 1.4 } }),
    'wa-gyoza-yaki': definePerUnit({ id: 'wa-gyoza-yaki', name: '焼き餃子', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 50, protein: 1.8, fat: 2.5, carb: 5, salt: 0.3 } }),
    'wa-nikuyasai': definePer100g({ id: 'wa-nikuyasai', name: '肉野菜炒め', source: '八訂2020近似', units: { '皿': 200, '100g': 100, 'g': 1 }, per100g: { energy: 110, protein: 7, fat: 7, carb: 5, salt: 1, Na: 400 } }),
    'wa-tkg': definePerUnit({ id: 'wa-tkg', name: '卵かけご飯', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 320, protein: 9.5, fat: 5.5, carb: 58, salt: 0.8 } }),
    'wa-medamayaki': definePerUnit({ id: 'wa-medamayaki', name: '目玉焼き', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 90, protein: 6.2, fat: 7, carb: 0.2, salt: 0.3 } }),
    'wa-ohitashi': definePer100g({ id: 'wa-ohitashi', name: 'ほうれん草のおひたし', source: '八訂2020近似', units: { '小鉢': 60, '皿': 80, 'g': 1 }, per100g: { energy: 25, protein: 2.5, fat: 0.4, carb: 3.5, salt: 0.8, Na: 320 } }),
    'wa-hiyayakko': definePerUnit({ id: 'wa-hiyayakko', name: '冷奴', source: '八訂2020近似', unitLabel: 'パック', perUnit: { energy: 90, protein: 7.4, fat: 4.5, carb: 3, salt: 0.9 } }),
    'wa-saba-misoni': definePer100g({ id: 'wa-saba-misoni', name: 'さばの味噌煮', source: '八訂2020近似', units: { '切れ': 100, '100g': 100, 'g': 1 }, per100g: { energy: 210, protein: 16, fat: 12, carb: 7, salt: 1.2, Na: 480 } }),
    'wa-buri-teri': definePer100g({ id: 'wa-buri-teri', name: 'ぶりの照り焼き', source: '八訂2020近似', units: { '切れ': 100, '100g': 100, 'g': 1 }, per100g: { energy: 210, protein: 20, fat: 11, carb: 5, salt: 1.2, Na: 480 } }),
    'wa-yaki-shake': definePerUnit({ id: 'wa-yaki-shake', name: '焼き鮭(塩鮭)', source: '八訂2020近似', unitLabel: '切れ', perUnit: { energy: 110, protein: 18, fat: 3.5, carb: 0.1, salt: 0.8 } }),
    'wa-chawanmushi': definePerUnit({ id: 'wa-chawanmushi', name: '茶碗蒸し', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 60, protein: 5, fat: 3, carb: 3, salt: 1 } }),
    'wa-potato-salad': definePer100g({ id: 'wa-potato-salad', name: 'ポテトサラダ', source: '八訂2020近似', units: { '小鉢': 80, '皿': 120, 'g': 1 }, per100g: { energy: 150, protein: 2, fat: 10, carb: 13, salt: 0.9, Na: 360 } }),
    'wa-macaroni-salad': definePer100g({ id: 'wa-macaroni-salad', name: 'マカロニサラダ', source: '八訂2020近似', units: { '小鉢': 80, '皿': 120, 'g': 1 }, per100g: { energy: 170, protein: 3, fat: 11, carb: 15, salt: 0.9, Na: 360 } }),
    'wa-karei-nitsuke': definePer100g({ id: 'wa-karei-nitsuke', name: 'かれいの煮付け', source: '八訂2020近似', units: { '切れ': 100, '100g': 100, 'g': 1 }, per100g: { energy: 130, protein: 16, fat: 4, carb: 6, salt: 1.3, Na: 520 } }),
    'wa-yakitori-momo': definePerUnit({ id: 'wa-yakitori-momo', name: '焼き鳥(もも・タレ)', source: '八訂2020近似', unitLabel: '本', perUnit: { energy: 95, protein: 7, fat: 6, carb: 3, salt: 0.6 } }),
    'wa-yakitori-negima': definePerUnit({ id: 'wa-yakitori-negima', name: '焼き鳥(ねぎま・タレ)', source: '八訂2020近似', unitLabel: '本', perUnit: { energy: 80, protein: 7, fat: 4.5, carb: 2, salt: 0.6 } }),
    'wa-yakiniku-karubi': definePer100g({ id: 'wa-yakiniku-karubi', name: '牛カルビ(焼肉)', source: '八訂2020近似', units: { '皿': 120, '100g': 100, 'g': 1 }, per100g: { energy: 380, protein: 14, fat: 32, carb: 3, salt: 1, Na: 400 } }),
    'wa-yakiniku-harami': definePer100g({ id: 'wa-yakiniku-harami', name: 'ハラミ(焼肉)', source: '八訂2020近似', units: { '皿': 120, '100g': 100, 'g': 1 }, per100g: { energy: 290, protein: 16, fat: 24, carb: 2, salt: 1, Na: 400 } }),
    'wa-tonjiru': definePerUnit({ id: 'wa-tonjiru', name: '豚汁', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 130, protein: 7, fat: 7, carb: 10, salt: 1.5 } }),
    'wa-kenchin': definePerUnit({ id: 'wa-kenchin', name: 'けんちん汁', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 90, protein: 4, fat: 4, carb: 9, salt: 1.3 } }),
    'don-gyudon': definePerUnit({ id: 'don-gyudon', name: '牛丼(並)', source: 'チェーン公表値近似', unitLabel: '杯', perUnit: { energy: 700, protein: 22, fat: 23, carb: 100, salt: 2.6 } }),
    'don-gyudon-large': definePerUnit({ id: 'don-gyudon-large', name: '牛丼(大盛)', source: 'チェーン公表値近似', unitLabel: '杯', perUnit: { energy: 970, protein: 30, fat: 32, carb: 138, salt: 3.5 } }),
    'don-butadon': definePerUnit({ id: 'don-butadon', name: '豚丼', source: 'チェーン公表値近似', unitLabel: '杯', perUnit: { energy: 720, protein: 22, fat: 24, carb: 100, salt: 2.5 } }),
    'don-oyako': definePerUnit({ id: 'don-oyako', name: '親子丼', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 600, protein: 26, fat: 14, carb: 88, salt: 2.8 } }),
    'don-katsu': definePerUnit({ id: 'don-katsu', name: 'カツ丼', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 870, protein: 28, fat: 30, carb: 110, salt: 3.5 } }),
    'don-ten': definePerUnit({ id: 'don-ten', name: '天丼', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 700, protein: 18, fat: 18, carb: 110, salt: 2.5 } }),
    'don-una': definePerUnit({ id: 'don-una', name: 'うな丼', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 750, protein: 28, fat: 25, carb: 100, salt: 2.8 } }),
    'don-curry-rice': definePerUnit({ id: 'don-curry-rice', name: 'カレーライス', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 700, protein: 15, fat: 22, carb: 105, salt: 3 } }),
    'don-katsu-curry': definePerUnit({ id: 'don-katsu-curry', name: 'カツカレー', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 950, protein: 27, fat: 35, carb: 125, salt: 3.5 } }),
    'don-hayashi': definePerUnit({ id: 'don-hayashi', name: 'ハヤシライス', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 650, protein: 14, fat: 20, carb: 100, salt: 2.8 } }),
    'don-omurice': definePerUnit({ id: 'don-omurice', name: 'オムライス', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 650, protein: 18, fat: 24, carb: 85, salt: 2.5 } }),
    'don-doria': definePerUnit({ id: 'don-doria', name: 'ドリア', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 600, protein: 18, fat: 25, carb: 75, salt: 2.5 } }),
    'don-gratin': definePerUnit({ id: 'don-gratin', name: 'グラタン', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 480, protein: 18, fat: 24, carb: 48, salt: 2 } }),
    'don-chahan': definePer100g({ id: 'don-chahan', name: 'チャーハン(手作り)', source: '八訂2020近似', units: { '皿': 250, '100g': 100, 'g': 1 }, per100g: { energy: 190, protein: 4.5, fat: 6.5, carb: 28, salt: 1, Na: 400 } }),
    'don-ochazuke': definePerUnit({ id: 'don-ochazuke', name: 'お茶漬け', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 180, protein: 4, fat: 0.5, carb: 38, salt: 1.8 } }),
    'don-zosui': definePerUnit({ id: 'don-zosui', name: '雑炊', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 180, protein: 6, fat: 2, carb: 33, salt: 1.5 } }),
    'oni-shake': definePerUnit({ id: 'oni-shake', name: 'おにぎり(鮭)', source: 'コンビニ公表値近似', unitLabel: '個', perUnit: { energy: 180, protein: 4.5, fat: 1.5, carb: 36, salt: 1 } }),
    'oni-tuna': definePerUnit({ id: 'oni-tuna', name: 'おにぎり(ツナマヨ)', source: 'コンビニ公表値近似', unitLabel: '個', perUnit: { energy: 230, protein: 4.5, fat: 7, carb: 36, salt: 1 } }),
    'oni-kombu': definePerUnit({ id: 'oni-kombu', name: 'おにぎり(昆布)', source: 'コンビニ公表値近似', unitLabel: '個', perUnit: { energy: 170, protein: 3, fat: 0.5, carb: 37, salt: 1.1 } }),
    'oni-ume': definePerUnit({ id: 'oni-ume', name: 'おにぎり(梅)', source: 'コンビニ公表値近似', unitLabel: '個', perUnit: { energy: 165, protein: 3, fat: 0.4, carb: 36, salt: 1.2 } }),
    'sushi-maguro': definePerUnit({ id: 'sushi-maguro', name: '寿司 まぐろ(にぎり)', source: '八訂2020近似', unitLabel: '貫', perUnit: { energy: 45, protein: 4.5, fat: 0.5, carb: 6.5, salt: 0.2 } }),
    'sushi-salmon': definePerUnit({ id: 'sushi-salmon', name: '寿司 サーモン(にぎり)', source: '八訂2020近似', unitLabel: '貫', perUnit: { energy: 55, protein: 3.5, fat: 2, carb: 6.5, salt: 0.2 } }),
    'sushi-ebi': definePerUnit({ id: 'sushi-ebi', name: '寿司 えび(にぎり)', source: '八訂2020近似', unitLabel: '貫', perUnit: { energy: 40, protein: 3.5, fat: 0.2, carb: 6.5, salt: 0.2 } }),
    'sushi-tamago': definePerUnit({ id: 'sushi-tamago', name: '寿司 玉子(にぎり)', source: '八訂2020近似', unitLabel: '貫', perUnit: { energy: 55, protein: 2.5, fat: 1.5, carb: 8, salt: 0.3 } }),
    'sushi-hamachi': definePerUnit({ id: 'sushi-hamachi', name: '寿司 はまち(にぎり)', source: '八訂2020近似', unitLabel: '貫', perUnit: { energy: 60, protein: 4, fat: 2.5, carb: 6.5, salt: 0.2 } }),
    'sushi-inari': definePerUnit({ id: 'sushi-inari', name: 'いなり寿司', source: '八訂2020近似', unitLabel: '個', perUnit: { energy: 100, protein: 2.5, fat: 2.5, carb: 17, salt: 0.6 } }),
    'men-ramen-shoyu': definePerUnit({ id: 'men-ramen-shoyu', name: '醤油ラーメン', source: '外食公表値近似', unitLabel: '杯', perUnit: { energy: 470, protein: 20, fat: 10, carb: 72, salt: 6 } }),
    'men-ramen-miso': definePerUnit({ id: 'men-ramen-miso', name: '味噌ラーメン', source: '外食公表値近似', unitLabel: '杯', perUnit: { energy: 550, protein: 22, fat: 16, carb: 78, salt: 6.5 } }),
    'men-ramen-tonkotsu': definePerUnit({ id: 'men-ramen-tonkotsu', name: '豚骨ラーメン', source: '外食公表値近似', unitLabel: '杯', perUnit: { energy: 510, protein: 22, fat: 16, carb: 66, salt: 5.5 } }),
    'men-ramen-shio': definePerUnit({ id: 'men-ramen-shio', name: '塩ラーメン', source: '外食公表値近似', unitLabel: '杯', perUnit: { energy: 430, protein: 18, fat: 8, carb: 68, salt: 5.8 } }),
    'men-ramen-iekei': definePerUnit({ id: 'men-ramen-iekei', name: '家系ラーメン', source: '外食公表値近似', unitLabel: '杯', perUnit: { energy: 650, protein: 28, fat: 22, carb: 80, salt: 7 } }),
    'men-ramen-jiro': definePerUnit({ id: 'men-ramen-jiro', name: '二郎系ラーメン', source: '外食公表値近似', unitLabel: '杯', perUnit: { energy: 1100, protein: 45, fat: 40, carb: 140, salt: 8 } }),
    'men-tsukemen': definePerUnit({ id: 'men-tsukemen', name: 'つけ麺', source: '外食公表値近似', unitLabel: '杯', perUnit: { energy: 600, protein: 28, fat: 12, carb: 95, salt: 6 } }),
    'men-yakisoba': definePerUnit({ id: 'men-yakisoba', name: '焼きそば', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 540, protein: 14, fat: 18, carb: 78, salt: 2.8 } }),
    'men-napolitan': definePerUnit({ id: 'men-napolitan', name: 'ナポリタン', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 600, protein: 16, fat: 18, carb: 90, salt: 2.8 } }),
    'men-carbonara': definePerUnit({ id: 'men-carbonara', name: 'カルボナーラ', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 830, protein: 25, fat: 40, carb: 85, salt: 2.6 } }),
    'men-peperoncino': definePerUnit({ id: 'men-peperoncino', name: 'ペペロンチーノ', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 560, protein: 14, fat: 18, carb: 82, salt: 2 } }),
    'men-meat-sauce': definePerUnit({ id: 'men-meat-sauce', name: 'ミートソースパスタ', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 650, protein: 20, fat: 20, carb: 92, salt: 2.5 } }),
    'men-hiyashi-chuka': definePerUnit({ id: 'men-hiyashi-chuka', name: '冷やし中華', source: '八訂2020近似', unitLabel: '皿', perUnit: { energy: 500, protein: 18, fat: 12, carb: 78, salt: 3.5 } }),
    'men-curry-udon': definePerUnit({ id: 'men-curry-udon', name: 'カレーうどん', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 480, protein: 14, fat: 12, carb: 76, salt: 4 } }),
    'men-kake-udon': definePerUnit({ id: 'men-kake-udon', name: 'かけうどん', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 320, protein: 9, fat: 2, carb: 64, salt: 4.5 } }),
    'men-tempura-soba': definePerUnit({ id: 'men-tempura-soba', name: '天ぷらそば', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 470, protein: 16, fat: 10, carb: 78, salt: 4.5 } }),
    'men-zaru-soba': definePerUnit({ id: 'men-zaru-soba', name: 'ざるそば', source: '八訂2020近似', unitLabel: '盛', perUnit: { energy: 290, protein: 11, fat: 2, carb: 56, salt: 2.5 } }),
    'men-tanuki-udon': definePerUnit({ id: 'men-tanuki-udon', name: 'たぬきうどん', source: '八訂2020近似', unitLabel: '杯', perUnit: { energy: 380, protein: 10, fat: 6, carb: 70, salt: 4.5 } }),
    'mcd-bigmac': definePerUnit({ id: 'mcd-bigmac', name: 'マック ビッグマック', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 525, protein: 26, fat: 28.3, carb: 41.8, salt: 2.5 } }),
    'mcd-teriyaki': definePerUnit({ id: 'mcd-teriyaki', name: 'マック てりやきマックバーガー', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 478, protein: 15.2, fat: 28.9, carb: 38.6, salt: 2.1 } }),
    'mcd-filet-o-fish': definePerUnit({ id: 'mcd-filet-o-fish', name: 'マック フィレオフィッシュ', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 323, protein: 14.5, fat: 14, carb: 35, salt: 1.6 } }),
    'mcd-double-cheese': definePerUnit({ id: 'mcd-double-cheese', name: 'マック ダブルチーズバーガー', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 457, protein: 26.4, fat: 25, carb: 31.5, salt: 2.5 } }),
    'mcd-hamburger': definePerUnit({ id: 'mcd-hamburger', name: 'マック ハンバーガー', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 256, protein: 12.8, fat: 9.4, carb: 30.3, salt: 1.4 } }),
    'mcd-chicken-crisp': definePerUnit({ id: 'mcd-chicken-crisp', name: 'マック チキンクリスプ', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 345, protein: 14, fat: 16, carb: 36, salt: 1.8 } }),
    'mcd-fries-s': definePerUnit({ id: 'mcd-fries-s', name: 'マック ポテトS', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 225, protein: 2.9, fat: 11, carb: 28, salt: 0.5 } }),
    'mcd-shaka-chicken': definePerUnit({ id: 'mcd-shaka-chicken', name: 'マック シャカチキ', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 274, protein: 13.5, fat: 16, carb: 18, salt: 1.3 } }),
    'mcd-shake-vanilla': definePerUnit({ id: 'mcd-shake-vanilla', name: 'マック マックシェイク バニラ(M)', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 322, protein: 8.5, fat: 8.5, carb: 53, salt: 0.3 } }),
    'mcd-mcflurry': definePerUnit({ id: 'mcd-mcflurry', name: 'マック マックフルーリー オレオ', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 251, protein: 5.5, fat: 8, carb: 39, salt: 0.3 } }),
    'mcd-apple-pie': definePerUnit({ id: 'mcd-apple-pie', name: 'マック ホットアップルパイ', source: 'マクドナルド公表値', unitLabel: '個', perUnit: { energy: 211, protein: 1.8, fat: 10.6, carb: 27, salt: 0.5 } }),

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
    if (item && item.nutrients) {
      return {
        foodId: item.foodId,
        foodName: item.name || item.foodId,
        source: item.source || 'external-estimate',
        coverage: item.coverage || 'macro-only',
        verified: Boolean(item.verified),
        qty: Number(item.qty) || 0,
        unit: item.unit,
        grams: Number(item.grams) || null,
        pendingReview: Boolean(item.pendingReview),
        nutrients: mergeNutrients(item.nutrients)
      };
    }
    const food = getFood(item.foodId) || convertFoodToNutritionEntry(fallbackFood);
    const portion = calcPortion(food, item.qty, item.unit);
    const totals = portion ? portion.totals : blankNutrients();
    return {
      foodId: item.foodId,
      foodName: item.name || (food && food.name) || item.foodId,
      source: item.source || (food && food.source) || 'unknown',
      coverage: item.coverage || (food && food.coverage) || 'unknown',
      verified: Boolean(item.verified || (food && food.verified)),
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
