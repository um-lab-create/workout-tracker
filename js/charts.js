// charts.js — チャート基盤（状態を持たない描画ユーティリティ）。app.html から切り出し（監査 9-1）。
// 注意: attachScrub は app.html のグローバル escapeHtml に依存する（classic script。
//       読み込み順は app.html の inline より前だが、呼び出しは実行時解決なので関数参照でよい）。

'use strict';

// ---- 週次レビュー用フォーマッタ ----
function wkInt(v) { return v == null ? '–' : String(Math.round(Number(v))); }               // 平均タンパク質/カロリー=整数
function wkDec1(v) { return v == null ? '–' : (Math.round(Number(v) * 10) / 10).toFixed(1); } // 平均系=小数1桁
function wkPct(v) { return v == null ? '–' : `${Math.round(Number(v) * 100)}%`; }            // 達成率=%
function wkWeekLabel(weekStart) {
  const d = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(weekStart || '');
  const end = new Date(d.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`;
}
function wkXLabel(weekStart) {
  const d = new Date(`${weekStart}T00:00:00+09:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ============================================================
// グラフのスクラブ（2026-07-14 マネージャー要望）
// 「チャート上を長押し/スライドすると縦線が指に追従し、その時点の数値が出る」
// 体組成計アプリなどでおなじみの操作。全グラフ共通の仕組みとして1回だけ実装する。
//
// 使い方: カードを描いた後に attachScrub(cardEl, { W, padL, padR, points })
//   points = [{ x: viewBox上のX, label: '7/8(火)', vals: [{name,text,color}] }]
// ============================================================
function attachScrub(card, meta) {
  const svg = card.querySelector('svg');
  if (!svg || !meta.points || meta.points.length < 2) return;
  card.classList.add('scrubbable');
  const tip = document.createElement('div');
  tip.className = 'scrub-tip';
  card.appendChild(tip);

  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('class', 'scrub-line');
  line.setAttribute('y1', '0');
  line.setAttribute('y2', String(meta.H || 120));
  svg.appendChild(line);

  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * meta.W;      // 画面X → viewBox X
    let best = meta.points[0];
    meta.points.forEach((p) => { if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p; });
    line.setAttribute('x1', String(best.x));
    line.setAttribute('x2', String(best.x));
    svg.classList.add('scrubbing');
    tip.innerHTML = `<b>${escapeHtml(best.label)}</b>` +
      best.vals.map((v) => `<span><i style="background:${v.color}"></i>${escapeHtml(v.name)} <b>${escapeHtml(v.text)}</b></span>`).join('');
    // 吹き出しはカード内に収める（指の上あたり）
    const px = (best.x / meta.W) * r.width;
    tip.style.display = 'flex';
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.round(Math.min(Math.max(px - tw / 2, 6), r.width - tw - 6))}px`;
  };
  const hide = () => { svg.classList.remove('scrubbing'); tip.style.display = 'none'; };

  svg.addEventListener('touchstart', (e) => { show(e.touches[0].clientX); }, { passive: true });
  svg.addEventListener('touchmove', (e) => { show(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  svg.addEventListener('touchend', hide);
  svg.addEventListener('touchcancel', hide);
  svg.addEventListener('mousemove', (e) => show(e.clientX));
  svg.addEventListener('mouseleave', hide);
}

// [fix] 主要系列の最小・最大の2目盛りを右端に淡色で置く共通ヘルパー（スクラブせず値が読めるように。監査 4-1）
// 色は既存軸ラベルと同系（ダークは .wk-chart-svg text の !important 反転が効く）
function wkYTicks(minV, maxV, yAt, fmt, W = 320) {
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return '';
  const f = fmt || ((v) => String(Math.round(v)));
  const ticks = minV === maxV ? [maxV] : [maxV, minV];
  return ticks.map((v) =>
    `<text x="${W - 2}" y="${(yAt(v) + 2.5).toFixed(1)}" font-size="8" fill="rgba(0,0,0,.35)" text-anchor="end">${f(v)}</text>`).join('');
}

// ---- ミニトレンド（Phase D-2: 体重と筋トレの成長をホームで見せる） ----
function miniSpark(values, color) {
  if (values.length < 2) return '';
  const W = 120, H = 30;
  const min = Math.min(...values), max = Math.max(...values);
  const pad = Math.max((max - min) * 0.2, 0.1);
  const lo = min - pad, hi = max + pad;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (W - 6) + 3;
    const y = H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}
