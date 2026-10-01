// chrome.js — sheet and toast helpers shared by every OL app.
(function (root) {
  'use strict';

  function openSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
    return el;
  }

  function closeSheet(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    return el;
  }

  let toastTimer = 0;
  function toast(text, ms = 2400) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  /** Backdrop click and [data-close] buttons dismiss a sheet. */
  function bindSheetDismiss(rootEl) {
    const scope = rootEl || document;
    scope.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeSheet(btn.dataset.close));
    });
    scope.querySelectorAll('.sheet').forEach((sheet) => {
      sheet.addEventListener('click', (event) => {
        if (event.target === sheet) sheet.classList.add('hidden');
      });
    });
  }

  root.OL.Chrome = { openSheet, closeSheet, toast, bindSheetDismiss };
})(globalThis);
