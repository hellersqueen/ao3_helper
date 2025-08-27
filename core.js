// core.js
;(function () {
  'use strict';

  /* =========================
   * AO3H global + namespaces
   * ========================= */
  window.AO3H = window.AO3H || {};
  const AO3H = window.AO3H;

  // Environment / constants
  AO3H.env    = AO3H.env    || { NS: 'ao3h', DEBUG: false };
  AO3H.util   = AO3H.util   || {};
  AO3H.flags  = AO3H.flags  || {};
  AO3H.modules= AO3H.modules|| {};

  const { NS, DEBUG } = AO3H.env;

  // ---- Compatibility shim: allow multiple calling styles ----
  //   AO3H.register('ID', def)
  //   AO3H.register(defWithId)
  //   AO3H.register({ ID1: def1, ID2: def2 })
  //   (if a def in the map has .id, that takes precedence over the key)
  if (typeof AO3H.register !== 'function') {
    AO3H.register = (arg1, arg2) => {
      // Style: AO3H.register('ID', def)
      if (typeof arg1 === 'string') {
        AO3H.modules[arg1] = arg2;
        return;
      }
      // Style: AO3H.register(defWithId)
      if (arg1 && typeof arg1 === 'object' && !arg2) {
        // Single module object with .id
        if (typeof arg1.id === 'string' && arg1.id) {
          AO3H.modules[arg1.id] = arg1;
          return;
        }
        // Style: AO3H.register({ key: def, ... })
        for (const [k, v] of Object.entries(arg1)) {
          if (v && typeof v === 'object') {
            const id = (typeof v.id === 'string' && v.id) ? v.id : k;
            AO3H.modules[id] = v;
          } else {
            AO3H.modules[k] = v;
          }
        }
      }
    };
  }

  /* ======================
   * Tiny logging helper
   * ====================== */
  function dlog(...a){ if (DEBUG) console.log('[AO3H]', ...a); }
  AO3H.util.dlog = dlog;

  /* ======================
   * Storage (GM + namesp.)
   * ====================== */
  const Storage = {
    key: (k) => `${NS}:${k}`,
    async get(k, d=null){
      try {
        return (typeof GM_getValue === 'function')
          ? await GM_getValue(Storage.key(k), d)
          : (JSON.parse(localStorage.getItem(Storage.key(k))) ?? d);
      } catch { return d; }
    },
    async set(k, v){
      try {
        if (typeof GM_setValue === 'function') return GM_setValue(Storage.key(k), v);
        localStorage.setItem(Storage.key(k), JSON.stringify(v));
      } catch {}
      return v;
    },
    async del(k){
      try {
        if (typeof GM_deleteValue === 'function') return GM_deleteValue(Storage.key(k));
        localStorage.removeItem(Storage.key(k));
      } catch {}
    }
  };
  AO3H.util.Storage = Storage;

  /* ======================
   * Small DOM utilities
   * ====================== */
  const onReady = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, { once:true })
    : fn();

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, cb, opts) => el.addEventListener(evt, cb, opts);

  const debounce = (fn,ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const throttle = (fn,ms=200)=>{ let t=0; return (...a)=>{ const n=Date.now(); if (n-t>ms){ t=n; fn(...a); } }; };

  const observe = (root, cb, opts={childList:true,subtree:true}) => {
    const mo = new MutationObserver(cb); mo.observe(root, opts); return mo;
  };

  const css = (strings, ...vals) => {
    const text = strings.map((s,i)=>s+(vals[i]??'')).join('');
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(`/* ${NS} */\n${text}`);
    } else {
      const el = document.createElement('style');
      el.textContent = `/* ${NS} */\n${text}`;
      document.head.appendChild(el);
    }
  };

  AO3H.util.onReady  = onReady;
  AO3H.util.$        = $;
  AO3H.util.$$       = $$;
  AO3H.util.on       = on;
  AO3H.util.debounce = debounce;
  AO3H.util.throttle = throttle;
  AO3H.util.observe  = observe;
  AO3H.util.css      = css;

  // Optional router
  AO3H.util.route = {
    path: () => location.pathname,
    isWork: () => /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(location.pathname),
    isWorkShow: () => /^\/works\/\d+$/.test(location.pathname),
    isSearch: () => /^\/works$/.test(location.pathname) && (new URLSearchParams(location.search).has('work_search[query]') || location.search.includes('tag_id')),
    isChapter: () => /^\/works\/\d+\/chapters\/\d+$/.test(location.pathname),
    isBookmarks: () => /^\/users\/[^/]+\/bookmarks/.test(location.pathname),
  };

  /* ======================
   * Flags (feature toggles)
   * ====================== */
  const Defaults = {
    features: {
      saveScroll: true,
      chapterWordCount: true,
      hideByTags: true,
      autoSearchFilters: true,
      hideFanficWithNotes: true
    }
  };

  async function getFlags() {
    const saved = await Storage.get('flags', null);
    if (!saved) {
      await Storage.set('flags', Defaults.features);
      return { ...Defaults.features };
    }
    const merged = { ...Defaults.features, ...saved };
    try {
      const same = JSON.stringify(merged) === JSON.stringify(saved);
      if (!same) await Storage.set('flags', merged);
    } catch {}
    return merged;
  }

  async function setFlag(key, val) {
    const flags = await getFlags();
    flags[key] = !!val;
    await Storage.set('flags', flags);
    document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`, { detail: { key, value: !!val, flags } }));
    return flags;
  }

  AO3H.flags.getFlags = getFlags;
  AO3H.flags.setFlag  = setFlag;
  AO3H.flags.Defaults = Defaults;

  /* ======================
   * Boot: init each module
   * ====================== */
  (async function boot(){
    try {
      const f = await getFlags();
      // Call init(flags) on every registered module
      for (const mod of Object.values(AO3H.modules)) {
        try { await mod.init?.(f); }
        catch (e) { console.error('[AO3H] init failed:', mod?.id || '(unknown)', e); }
      }

      // Notify modules when flags change (optional hook)
      on(document, `${NS}:flags-updated`, async () => {
        const nf = await getFlags();
        for (const mod of Object.values(AO3H.modules)) {
          try { mod.onFlagsUpdated?.(nf); } catch (e) { /* optional */ }
        }
      });
    } catch (e) {
      console.error('[AO3H] boot failed', e);
    }
  })();

})();
