/* core.js — AO3 Helper core (namespace, utils, flags, registry, boot) */
;(function(){
  'use strict';

  /* ========================== ENV & NAMESPACE ========================== */
  const NS = 'ao3h';
  const DEBUG = false;
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // public logger (quiet by default)
  const dlog = (...a)=>{ if (DEBUG) console.log('[AO3H]', ...a); };

  /* ============================== UTILITIES ============================ */
  const onReady = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, { once: true })
    : fn();

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, cb, opts) => el && el.addEventListener(evt, cb, opts);

  const debounce = (fn, ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const throttle = (fn, ms=200)=>{ let t=0; return (...a)=>{ const n=Date.now(); if (n-t>ms){ t=n; fn(...a); } }; };

  // Safe CSS injector (works at @run-at document-start even if <head> isn't parsed yet)
  const css = (strings, ...vals) => {
    const text = strings.map((s,i)=>s+(vals[i]??'')).join('');
    if (typeof W.GM_addStyle === 'function') {
      W.GM_addStyle(`/* ${NS} */\n${text}`);
      return;
    }
    const apply = () => {
      const el = document.createElement('style');
      el.textContent = `/* ${NS} */\n${text}`;
      (document.head || document.documentElement).appendChild(el);
    };
    if (document.head) apply();
    else document.addEventListener('DOMContentLoaded', apply, { once:true });
  };

  // MutationObserver helper
  const observe = (root, cb, opts={ childList:true, subtree:true }) => {
    if (!root) return { disconnect(){/*noop*/} };
    const mo = new MutationObserver(cb);
    mo.observe(root, opts);
    return mo;
  };

  /* ============================== STORAGE ============================== */
  // Prefer GM_* (Tampermonkey) with graceful fallback to localStorage.
  const Storage = {
    key: (k) => `${NS}:${k}`,
    async get(k, d=null){
      try {
        if (typeof W.GM_getValue === 'function') return await W.GM_getValue(this.key(k), d);
      } catch {}
      try {
        const raw = localStorage.getItem(this.key(k));
        return raw == null ? d : JSON.parse(raw);
      } catch { return d; }
    },
    async set(k, v){
      try {
        if (typeof W.GM_setValue === 'function') return W.GM_setValue(this.key(k), v);
      } catch {}
      try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch {}
    },
    async del(k){
      try {
        if (typeof W.GM_deleteValue === 'function') return W.GM_deleteValue(this.key(k));
      } catch {}
      try { localStorage.removeItem(this.key(k)); } catch {}
    },
  };

  /* ============================== ROUTER =============================== */
  const routes = {
    path: () => location.pathname,
    isWork: () => /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(location.pathname),
    isWorkShow: () => /^\/works\/\d+$/.test(location.pathname),
    isChapter: () => /^\/works\/\d+\/chapters\/\d+$/.test(location.pathname),
    isBookmarks: () => /^\/users\/[^/]+\/bookmarks/.test(location.pathname),

    // Works listing (search/index) — used by AutoSearchFilters & HideByTags
    isWorksIndex: () => /^\/works\/?$/.test(location.pathname),
    isSearch: () => {
      if (!/^\/works\/?$/.test(location.pathname)) return false;
      const qs = new URLSearchParams(location.search);
      return qs.has('work_search[query]') || location.search.includes('tag_id');
    },
  };

  /* ============================== FLAGS ================================ */
  const Defaults = {
    features: {
      saveScroll: true,
      chapterWordCount: true,
      hideByTags: true,
      autoSearchFilters: true,
      hideFanficWithNotes: true,
    }
  };

  async function getFlags() {
    const saved = await Storage.get('flags', null);
    if (!saved) {
      await Storage.set('flags', Defaults.features);
      return { ...Defaults.features };
    }
    const merged = { ...Defaults.features, ...saved };
    // Backfill if new defaults were added later
    if (JSON.stringify(merged) !== JSON.stringify(saved)) await Storage.set('flags', merged);
    return merged;
  }

  async function setFlag(key, val){
    const flags = await getFlags();
    flags[key] = !!val;
    await Storage.set('flags', flags);
    // notify listeners (menu, modules)
    document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`, { detail: flags }));
    return flags;
  }

  /* =========================== MODULE REGISTRY ========================== */
  // Modules call AO3H.register({ id, title, init, onFlagsUpdated?, defaultFlagKey? })
  const _queue = [];
  let _realRegistrarInstalled = false;

  function _getFlagForModule(flags, mod){
    // Prefer explicit defaultFlagKey; else try to derive from id in a lenient way.
    if (mod.defaultFlagKey && mod.defaultFlagKey in flags) return !!flags[mod.defaultFlagKey];
    const guess = String(mod.id || '').charAt(0).toLowerCase() + String(mod.id || '').slice(1);
    return (guess in flags) ? !!flags[guess] : true; // default ON if unknown
  }

  // Allow menu.js to provide a settings root element (mount point for per-module panels)
  let _settingsRoot = null;
  function provideSettingsRoot(el){
    _settingsRoot = el || null;
  }

  function installRealRegistrar(){
    if (_realRegistrarInstalled) return;
    _realRegistrarInstalled = true;

    // Replace stub with real function that stores modules and (if booted) can init them later if needed.
    AO3H.register = (mod) => {
      if (!mod || !mod.id) return;
      _queue.push(mod);
      dlog('registered module:', mod.id);
    };

    // Let dependents know register is ready
    document.dispatchEvent(new CustomEvent(`${NS}:register-ready`));
  }

  /* =============================== BOOT ================================= */
  // Build AO3H object early so other files can attach even before boot.
  const AO3H = W.AO3H || (W.AO3H = {});
  AO3H.env   = { NS, DEBUG };
  AO3H.util  = AO3H.util  || { $, $$, on, onReady, debounce, throttle, css, observe };
  AO3H.store = AO3H.store || Storage;
  AO3H.routes= AO3H.routes|| routes;

  // Temporary stub: queue modules until real registrar is installed
  if (typeof AO3H.register !== 'function') {
    AO3H.register = (mod) => { _queue.push(mod); };
  }

  // Flags API (menu.js uses these)
  AO3H.flags = {
    Defaults,
    get: getFlags,
    set: setFlag,
  };

  // Menu -> core hook to hand over a mount node for settings panels
  AO3H.provideSettingsRoot = provideSettingsRoot;

  // Optional: soft-navigation signal for modules that need to re-run on PJAX
  AO3H.signalNavigated = () => {
    document.dispatchEvent(new CustomEvent(`${NS}:navigated`));
  };

  installRealRegistrar();

  // Main boot: wait for menu (optionally) to announce its mount, then init modules with flags
  onReady(async () => {
    const flags = await getFlags();

    // Notify that flags are available very early (menu can read these)
    document.dispatchEvent(new CustomEvent(`${NS}:boot-flags-ready`, { detail: flags }));

    // If menu.js will provide a settings root, give it a moment to load and call AO3H.provideSettingsRoot(...)
    let booted = false;

    const initAll = async () => {
      if (booted) return;
      booted = true;

      // Initialize each registered module
      for (const mod of _queue) {
        try {
          const enabled = _getFlagForModule(flags, mod);
          // Give modules a chance to mount settings panel inside the menu's container (if provided)
          await Promise.resolve(mod.init && mod.init({ enabled, settingsRoot: _settingsRoot }));
          dlog('init ->', mod.id, 'enabled=', enabled);
        } catch (e) {
          console.error(`[AO3H] Module init failed (${mod.id}):`, e);
        }
      }

      // Wire global flag updates to module handlers
      document.addEventListener(`${NS}:flags-updated`, async (e) => {
        const f = e && e.detail ? e.detail : await getFlags();
        for (const mod of _queue) {
          try {
            const enabled = _getFlagForModule(f, mod);
            mod.onFlagsUpdated && mod.onFlagsUpdated({ enabled, settingsRoot: _settingsRoot });
          } catch (err) {
            console.error(`[AO3H] Module onFlagsUpdated failed (${mod.id}):`, err);
          }
        }
      });
    };

    // If menu has already provided the settings root, init immediately.
    if (_settingsRoot) {
      initAll();
      return;
    }

    // Otherwise, wait briefly for menu to report a settings mount; then continue regardless.
    let waited = false;
    const kick = () => { if (!waited) { waited = true; initAll(); } };

    // Menu is expected to dispatch `${NS}:menu-ready` with { detail: { settingsRoot } }
    const onMenuReady = (ev) => {
      try {
        if (ev?.detail?.settingsRoot) provideSettingsRoot(ev.detail.settingsRoot);
      } catch {}
      kick();
      document.removeEventListener(`${NS}:menu-ready`, onMenuReady);
    };
    document.addEventListener(`${NS}:menu-ready`, onMenuReady, { once: true });

    // Safety timeout: don't block boot if menu loads much later or isn't present.
    setTimeout(kick, 700);
  });

})();
