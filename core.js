;(function () {
  'use strict';

  // ---------------------------- ENV & NAMESPACE ----------------------------
  const NS = 'ao3h';
  const DEBUG = false;
  const dlog = (...a)=>{ if (DEBUG) console.log('[AO3H]', ...a); };

  // Expose a single AO3H object for everyone
  const AO3H = window.AO3H = window.AO3H || { env:{NS,DEBUG}, util:{}, flags:{}, store:null, modules:{} };

  // ------------------------------- UTILITIES -------------------------------
  const onReady = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn();

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, cb, opts) => el.addEventListener(evt, cb, opts);
  const debounce = (fn,ms=200)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
  const throttle = (fn,ms=200)=>{let t=0;return(...a)=>{const n=Date.now();if(n-t>ms){t=n;fn(...a);}};};

  // Simple router used by modules if they need it
  const route = {
    path: () => location.pathname,
    isWork: () => /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(location.pathname),
    isWorkShow: () => /^\/works\/\d+$/.test(location.pathname),
    isSearch: () => /^\/works$/.test(location.pathname) &&
      (new URLSearchParams(location.search).has('work_search[query]') || location.search.includes('tag_id')),
    isChapter: () => /^\/works\/\d+\/chapters\/\d+$/.test(location.pathname),
    isBookmarks: () => /^\/users\/[^/]+\/bookmarks/.test(location.pathname),
  };

  // CSS helper (modules can call AO3H.util.css`...`)
  const css = (strings, ...vals) => {
    const text = strings.map((s,i)=>s+(vals[i]??'')).join('');
    GM_addStyle(`/* ${NS} */\n${text}`);
  };

  // MutationObserver helper
  const observe = (root, cb, opts={childList:true,subtree:true}) => {
    const mo = new MutationObserver(cb); mo.observe(root, opts); return mo;
  };

  // Storage wrapper (Tampermonkey + sane fallback)
  const Storage = {
    key: (k) => `${NS}:${k}`,
    async get(k, d=null){ try { return await GM_getValue(this.key(k), d); } catch { return d; } },
    async set(k, v){ return GM_setValue(this.key(k), v); },
    async del(k){ return GM_deleteValue(this.key(k)); },
  };

  AO3H.util = { onReady, $, $$, on, debounce, throttle, observe, css, route, dlog };
  AO3H.store = Storage;

  // ------------------------------ FLAGS (toggles) ------------------------------
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
    if (!saved) { await Storage.set('flags', Defaults.features); return {...Defaults.features}; }
    const merged = {...Defaults.features, ...saved};
    if (JSON.stringify(merged) !== JSON.stringify(saved)) await Storage.set('flags', merged);
    return merged;
  }
  async function setFlag(key, val) {
    const flags = await getFlags();
    flags[key] = !!val;
    await Storage.set('flags', flags);
    return flags;
  }

  AO3H.flags = { getFlags, setFlag, Defaults };

  // ------------------------------ MODULE REGISTRY ------------------------------
  // Each module file should do: AO3H.modules[<id>] = { id, title, init }
  AO3H.modules = AO3H.modules || {};

  // ------------------------------ BOOT -----------------------------------------
  onReady(async () => {
    const flags = await getFlags();
    // Menu builds itself from AO3H.flags (menu.js will run after this file is loaded)
    document.dispatchEvent(new CustomEvent(`${NS}:boot-flags-ready`, { detail: flags }));

    // Start modules if present
    const start = async (id) => {
      try {
        const mod = AO3H.modules[id];
        if (mod && typeof mod.init === 'function') await mod.init(flags);
      } catch (e) { console.error(`[AO3H] failed to init ${id}`, e); }
    };

    if (flags.saveScroll)           await start('SaveScroll');
    if (flags.chapterWordCount)     await start('ChapterWordCount');
    if (flags.hideByTags)           await start('HideByTags');
    if (flags.autoSearchFilters)    await start('AutoSearchFilters');
    if (flags.hideFanficWithNotes)  await start('HideFanficWithNotes');

    // When toggles change, let modules react (each module listens if needed)
    document.addEventListener(`${NS}:flags-updated`, async () => {
      const f = await getFlags();
      // No hard reload here; modules should handle their own enable/disable
    });
  });
})();
