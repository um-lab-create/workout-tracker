/*
 * Cockpit shared theme switcher.
 * All standalone screens read the same localStorage key so the app feels like
 * one cockpit, not a collection of separate pages.
 */
(function () {
  'use strict';

  var STORE = 'cockpit_theme_v1';
  var root = document.documentElement;

  function readTheme() {
    try {
      return localStorage.getItem(STORE) === 'dark' ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function writeTheme(theme) {
    try {
      localStorage.setItem(STORE, theme);
    } catch (_) {}
  }

  function applyTheme(theme) {
    var safe = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = safe;
    root.style.colorScheme = safe;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', safe === 'dark' ? '#090a0f' : '#fff8ef');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.textContent = safe === 'dark' ? '白' : '黒';
      button.setAttribute('aria-label', safe === 'dark' ? '白テーマに切り替え' : '黒テーマに切り替え');
      button.setAttribute('aria-pressed', safe === 'dark' ? 'true' : 'false');
    });
  }

  window.CockpitTheme = {
    get: readTheme,
    set: function (theme) {
      writeTheme(theme);
      applyTheme(theme);
    },
    toggle: function () {
      var next = readTheme() === 'dark' ? 'light' : 'dark';
      writeTheme(next);
      applyTheme(next);
    }
  };

  applyTheme(readTheme());
  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(readTheme());
  });
}());
