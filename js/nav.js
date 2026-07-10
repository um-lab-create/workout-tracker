/*
 * Shared Cockpit bottom navigation.
 * Keep the primary app tabs identical across standalone HTML screens.
 */
(function () {
  'use strict';

  // 旧4ページ（workout/meal/day/body.html）は SPEC-012 Step6.5 で退役・削除済み
  var tabs = [
    { key: 'app', href: 'app.html', icon: '⌂', label: 'アプリ', match: ['app.html'] },
    { key: 'import', href: 'health-import.html', icon: '取', label: '取込', match: ['health-import.html'] },
    { key: 'home', href: 'index.html', icon: 'ハ', label: 'ハブ', match: ['index.html', ''] }
  ];

  function currentFile() {
    var file = window.location.pathname.split('/').pop();
    return file || 'index.html';
  }

  function injectStyle() {
    if (document.getElementById('cockpit-nav-style')) return;
    var style = document.createElement('style');
    style.id = 'cockpit-nav-style';
    style.textContent = [
      '.cockpit-nav{position:fixed;left:14px;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:90;width:min(calc(100% - 28px),560px);margin:0 auto;padding:8px;border:1px solid var(--line,rgba(0,0,0,.08));border-radius:24px;background:rgba(255,250,242,.95);backdrop-filter:blur(16px);box-shadow:0 18px 54px rgba(0,0,0,.12)}',
      ':root[data-theme="dark"] .cockpit-nav{background:rgba(24,25,29,.94);box-shadow:0 22px 70px rgba(0,0,0,.48)}',
      '.cockpit-nav-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}',
      '.cockpit-nav-link{min-width:0;text-decoration:none;color:var(--muted,#6b6f76)}',
      '.cockpit-nav-item{min-height:56px;display:grid;place-items:center;gap:2px;padding:7px 3px;border:1px solid var(--line,rgba(0,0,0,.08));border-radius:17px;background:var(--glass,rgba(0,0,0,.04));text-align:center}',
      '.cockpit-nav-icon{font-size:20px;line-height:1;font-weight:950;color:var(--ink,#1b1d1f)}',
      '.cockpit-nav-label{font-size:10px;line-height:1;font-weight:900;color:var(--muted,#6b6f76);white-space:nowrap}',
      '.cockpit-nav-link.is-active .cockpit-nav-item{border-color:rgba(92,194,109,.34);background:rgba(92,194,109,.14)}',
      '.cockpit-nav-link.is-active .cockpit-nav-label{color:var(--ink,#1b1d1f)}',
      ':root[data-theme="dark"] .cockpit-nav-link.is-active .cockpit-nav-item{border-color:rgba(66,231,155,.36);background:rgba(66,231,155,.14)}'
    ].join('');
    document.head.appendChild(style);
  }

  function render() {
    if (document.querySelector('.cockpit-nav')) return;
    injectStyle();
    document.documentElement.classList.add('has-cockpit-nav');
    var file = currentFile();
    var nav = document.createElement('nav');
    nav.className = 'cockpit-nav';
    nav.setAttribute('aria-label', 'Cockpit main tabs');
    nav.innerHTML = '<div class="cockpit-nav-grid">' + tabs.map(function (tab) {
      var active = tab.match.indexOf(file) !== -1;
      return '<a class="cockpit-nav-link' + (active ? ' is-active' : '') + '" href="' + tab.href + '" data-nav-key="' + tab.key + '">' +
        '<span class="cockpit-nav-item"><span class="cockpit-nav-icon">' + tab.icon + '</span><span class="cockpit-nav-label">' + tab.label + '</span></span>' +
      '</a>';
    }).join('') + '</div>';
    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
}());
