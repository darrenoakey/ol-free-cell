// store.js — Capacitor Preferences on device, localStorage in the browser.
// Keys are chosen by the caller. Core never invents a second store.
(function (root) {
  'use strict';

  function prefs() {
    const cap = root.Capacitor;
    return cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Preferences
      ? cap.Plugins.Preferences
      : null;
  }

  async function get(key) {
    const p = prefs();
    if (p) return (await p.get({ key })).value;
    if (!root.localStorage) return null;
    return root.localStorage.getItem(key);
  }

  async function set(key, value) {
    const p = prefs();
    if (p) {
      await p.set({ key, value });
      return;
    }
    root.localStorage.setItem(key, value);
  }

  async function remove(key) {
    const p = prefs();
    if (p) {
      await p.remove({ key });
      return;
    }
    root.localStorage.removeItem(key);
  }

  async function getJSON(key, fallback) {
    const raw = await get(key);
    if (raw === null || raw === undefined || raw === '') return fallback;
    return JSON.parse(raw);
  }

  async function setJSON(key, value) {
    await set(key, JSON.stringify(value));
  }

  /** `<appId>.<name>.v1` — the only key shape core writes. */
  function key(appId, name) {
    return `${appId}.${name}.v1`;
  }

  root.OL = root.OL || {};
  root.OL.Store = { get, set, remove, getJSON, setJSON, key, prefs };
})(globalThis);
