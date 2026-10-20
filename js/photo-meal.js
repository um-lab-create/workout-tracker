// Photo estimates use the user's AI app; no image upload or model API is used here.
'use strict';
window.HSPhotoMeal = (() => {
  const unsafe = /(https?:\/\/|www\.|maps\.|goo\.gl|[-+]?\d{1,3}\.\d{3,}\s*,\s*[-+]?\d{1,3}\.\d{3,})/i;
  function prompt() {
    return [
      '添付した料理写真の、写っている全量のカロリーとPFCを推定してください。',
      '複数の写真が同じ料理の別角度なら重複計上しないでください。食べた割合は後でアプリ側で指定します。',
      '料理ごとに分け、主食・飲料・ソース・油を可能な範囲で含めてください。分からないものを断定せず assumptions に短く記載してください。',
      '量が全く判断できない場合は質問し、回答後にJSONを作ってください。写っていない料理は追加しないでください。',
      '人物・場所・店名・URL・位置情報などは回答に含めないでください。写真由来の値はすべて推定です。ビタミン等は推定しないでください。',
      '数値は単位なしの数字。kcal/protein_g/fat_g/carb_g は写真に写った料理1品の全量の値（100gあたりではない）。',
      '説明文なしで次のJSONだけを返してください。最大30品。',
      '{"version":1,"items":[{"name":"料理名","portion":"茶碗1杯 約150g","kcal":234,"protein_g":3.8,"fat_g":0.5,"carb_g":55.7,"assumptions":"ご飯の重量は見た目から推定"}]}'
    ].join('\n');
  }
  function cleanText(value, label, max, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || unsafe.test(value)) {
      throw new Error(`${label}を確認してください（URL・座標は取り込めません）`);
    }
    return value.trim();
  }
  function number(value, label, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
      throw new Error(`${label}は0〜${max}の数値で指定してください`);
    }
    return value;
  }
  function validate(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.items) || !data.items.length || data.items.length > 30) {
      throw new Error('version:1 と、1〜30品の items が必要です');
    }
    return data.items.map((row) => {
      if (!row || typeof row !== 'object') throw new Error('料理の形式を確認してください');
      return {
        name: cleanText(row.name, '料理名', 80, true),
        portion: cleanText(row.portion, '量の説明', 100, true),
        kcal: number(row.kcal, 'kcal', 10000),
        p: number(row.protein_g, 'たんぱく質(g)', 1000),
        f: number(row.fat_g, '脂質(g)', 1000),
        c: number(row.carb_g, '炭水化物(g)', 2000),
        assumptions: cleanText(row.assumptions, '推定条件', 300)
      };
    });
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > 60000) throw new Error('回答が長すぎます');
    const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('JSON形式の回答を貼り付けてください'); }
    return validate(data);
  }
  function toItem(row, ratio, id) {
    const checked = validate({ version: 1, items: [{ name: row.name, portion: row.portion,
      kcal: row.kcal, protein_g: row.p, fat_g: row.f, carb_g: row.c, assumptions: row.assumptions }] })[0];
    if (!Number.isFinite(ratio) || ratio < 0.01 || ratio > 5) throw new Error('食べた量は1〜500%で指定してください');
    const nutrients = { energy: checked.kcal * ratio, protein: checked.p * ratio,
      fat: checked.f * ratio, carb: checked.c * ratio };
    return { id, foodId: id, name: checked.name, qty: ratio, unit: '写真の量', grams: null,
      kcal: nutrients.energy, p: nutrients.protein, f: nutrients.fat, c: nutrients.carb,
      nutrients, pendingReview: true, source: 'photo-estimate', coverage: 'macro-only',
      verified: false, sourceType: 'food', brand: '', frozen: true };
  }
  return { prompt, parse, toItem };
})();
