/*
 * sw.js — Cockpit Service Worker (2026-05-29 cowork)
 * 目的: ホーム画面追加(PWA)後、電波が弱い/オフラインでもアプリシェルとCDN資産が動くように。
 * 方針:
 *   - ナビゲーション(HTML): network-first（オンライン時は最新、オフライン時はキャッシュ）。
 *   - 静的資産/CDN: stale-while-revalidate（即キャッシュ応答＋裏で更新）。
 *   - GAS(script.google.com) と 非GET(POST送信)は SW を素通し（キャッシュしない）。
 * デプロイ時の注意: 中身を更新したら CACHE のバージョンを上げると確実に再取得される。
 */
'use strict';

const CACHE = 'cockpit-cache-v29';

// 同一オリジンのコア資産（個別 add で 1 件失敗しても install を止めない）
// 旧4ページ（workout/meal/day/body.html）は SPEC-012 Step6.5 で退役・削除済み
const CORE = [
  './',
  'index.html', 'health-import.html', 'app.html',
  'nutrition-db.js', 'js/storage.js', 'js/nutrition-calc.js', 'js/food-catalog.js',
  'js/supabase-client.js',
  'manifest.webmanifest', 'manifest-app.webmanifest',
  'icons/cockpit.svg', 'icons/cockpit-192.png', 'icons/cockpit-512.png', 'icons/apple-touch-icon.png'
];

// 外部CDN（opaque レスポンスを no-cors で取得してキャッシュ）
const CDN = [
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.20.0/dist/tabler-icons.min.css',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://unpkg.com/@zxing/browser@0.2.0/umd/zxing-browser.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map((u) => cache.add(u).catch(() => { /* 欠落しても継続 */ })));
    await Promise.all(CDN.map((u) => cache.add(new Request(u, { mode: 'no-cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // GASへのPOST送信などは素通し

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // GAS API は常にネットワーク（古いサーバ応答をキャッシュしない）
  if (/(^|\.)script\.google\.com$/.test(url.hostname) || /(^|\.)googleusercontent\.com$/.test(url.hostname)) return;

  // Supabase API（REST/Auth）も常にネットワーク（select は GET のため、キャッシュすると古いデータを返してしまう）
  if (/(^|\.)supabase\.co$/.test(url.hostname)) return;

  // HTML ナビゲーションは network-first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || (await caches.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // その他(JS/CSS/画像/CDN)は stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const fetching = fetch(req).then((fresh) => {
      if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(req, fresh.clone());
      return fresh;
    }).catch(() => null);
    return cached || (await fetching) || Response.error();
  })());
});
