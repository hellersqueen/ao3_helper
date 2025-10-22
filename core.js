// ─── GM shim (fallback vers localStorage si on n'est pas dans le sandbox TM) ───
(() => {
  const hasGM =
    typeof window.GM_getValue === 'function' &&
    typeof window.GM_setValue === 'function' &&
    typeof window.GM_deleteValue === 'function' &&
    typeof window.GM_listValues === 'function';

  if (hasGM) return; // On est dans Tampermonkey: rien à faire.

  // Équivalents locaux (page-context) basés sur localStorage
  const lsGet = (k, d) => {
    try {
      const raw = localStorage.getItem(k);
      return raw == null ? d : JSON.parse(raw);
    } catch {
      return d;
    }
  };
  const lsSet = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  const lsDel = (k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  };
  const lsKeys = () => {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  };

  // On expose des fonctions avec les mêmes noms que GM_*
  window.GM_getValue = lsGet;
  window.GM_setValue = lsSet;
  window.GM_deleteValue = lsDel;
  window.GM_listValues = lsKeys;

  // (Optionnel) petit log discret pour debug
  try { console.debug('[AO3H] GM shim actif (fallback localStorage)'); } catch {}
})();

;(function(){
  'use strict';
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  /* ========================= ENV / NAMESPACE / LOG ========================= */
  const NS      = 'ao3h';
  const VERSION = '1.2.3';
  const DEBUG   = false;               // true for global debug
  const LOG_LVL = 1;                   // 0: silent, 1: info, 2: debug

  const log = {
    info: (...a)=>{ if (LOG_LVL>=1) console.log('[AO3H]', ...a); },
    dbg : (...a)=>{ if (DEBUG && LOG_LVL>=2) console.log('[AO3H][D]', ...a); },
    warn: (...a)=>{ console.warn('[AO3H][!]', ...a); },
    err : (...a)=>{ console.error('[AO3H][X]', ...a); },
  };

  /* ================================ UTILS ================================== */
  const onReady = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn();

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, cb, opts) => el && el.addEventListener(evt, cb, opts);
  const once = (el, evt, cb, opts)=> on(el, evt, (e)=>{ el.removeEventListener(evt, cb, opts); cb(e); }, opts);
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
  const debounce = (fn,ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
  const throttle = (fn,ms=200)=>{ let t=0; return (...a)=>{ const n=Date.now(); if(n-t>=ms){ t=n; fn(...a); } }; };

  function observe(rootOrCb, optsOrCb, maybeCb){
    let root = document.documentElement;
    let opts = { childList: true, subtree: true };
    let cb;

    if (typeof rootOrCb === 'function') {
      cb = rootOrCb;
    } else {
      if (rootOrCb) root = rootOrCb;
      if (typeof optsOrCb === 'function') cb = optsOrCb;
      else { if (optsOrCb) opts = optsOrCb; cb = maybeCb; }
    }

    if (typeof cb !== 'function') { console.warn('[AO3H] observe(): missing callback'); cb = ()=>{}; }
    const mo = new MutationObserver(cb);
    mo.observe(root, opts);
    return mo;
  }

  // CSS helper (idempotent)
  const _cssKeys = new Set();
  function css(first, ...rest){
    let text = '';
    let key  = `block-${_cssKeys.size}`;
    if (Array.isArray(first) && Object.prototype.hasOwnProperty.call(first, 'raw')) {
      const strings = first, vals = rest;
      text = strings.map((s,i)=> s + (i < vals.length ? vals[i] : '')).join('');
    } else {
      text = String(first ?? '');
      if (typeof rest[0] === 'string') key = rest[0];
    }
    if (_cssKeys.has(key)) return;
    _cssKeys.add(key);
    try { GM_addStyle(text); }
    catch {
      const style = document.createElement('style');
      style.textContent = text;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  /* ============================== STORAGE ================================== */
  const Storage = {
    key: (k)=> `${NS}:${k}`,
    async get(k, d=null){ try { return await GM_getValue(this.key(k), d); } catch { return d; } },
    async set(k, v){ try { GM_setValue(this.key(k), v); } catch(e){ log.err('GM_setValue failed', e); } return v; },
    async del(k){ try { GM_deleteValue(this.key(k)); } catch(e){ log.err('GM_deleteValue failed', e); } },
    lsGet(k, d=null){ try { const v = localStorage.getItem(this.key(k)); return v==null?d:JSON.parse(v); } catch { return d; } },
    lsSet(k, v){ try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch(e){ log.err('ls set failed', e); } return v; },
    lsDel(k){ try { localStorage.removeItem(this.key(k)); } catch(e){ log.err('ls del failed', e); } },
  };

  /* ================================ ROUTES ================================= */
  const Routes = {
    href: ()=> location.href,
    path: ()=> location.pathname,
    isWork: ()=> /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(location.pathname),
    isWorkShow: ()=> /^\/works\/\d+$/.test(location.pathname),
    isChapter: ()=> /^\/works\/\d+\/chapters\/\d+$/.test(location.pathname),
    isTagWorks: ()=> /^\/tags\/[^/]+\/works/.test(location.pathname),
    isSearch: ()=> /^\/works$/.test(location.pathname) && (new URLSearchParams(location.search).has('work_search[query]') || location.search.includes('tag_id')),
    isBookmarks: ()=> /^\/users\/[^/]+\/bookmarks/.test(location.pathname),
  };

  /* ============================== EVENT BUS ================================ */
  const Bus = (()=> {
    const map = new Map();
    function on(evt, fn){ if(!map.has(evt)) map.set(evt, new Set()); map.get(evt).add(fn); }
    function off(evt, fn){ const set = map.get(evt); if(set) set.delete(fn); }
    function emit(evt, data){ const set = map.get(evt); if(set) for(const fn of set) { try{ fn(data);}catch(e){ log.err('Bus handler', e); } } }
    return { on, off, emit };
  })();

  /* ========================= guard() GLOBAL UTILE ========================== */
  async function guard(fn, label=''){
    try { return await fn(); }
    catch(e){
      console.error('[AO3H][guard]', label, e);
      try { Bus.emit('error', { label, error:e }); } catch {}
      return undefined;
    }
  }

  /* ============================ FLAGS / SETTINGS =========================== */
  const Flags = (()=> {
    const DEF_KEY = 'flags';
    let cache = null;
    const watchers = new Map(); // key => Set<fn>

    function _ensureLoaded(){ if (cache) return cache; cache = Storage.lsGet(DEF_KEY, null); return cache; }
    async function init(defaults={}){
      const fromGM = await Storage.get(DEF_KEY, {});
      cache = Object.assign({}, defaults, fromGM);
      await Storage.set(DEF_KEY, cache);
      Storage.lsSet(DEF_KEY, cache);
      log.info('Flags initialized', cache);
    }
    function getAll(){ return cache || _ensureLoaded() || {}; }
    function get(key, d=null){ const all = getAll(); return (key in all)? all[key] : d; }

    // Change-detection to prevent feedback loops or redundant watcher fires
    async function set(key, val){
      const all  = getAll();
      const prev = all[key];
      if (prev === val) return val; // no-op

      all[key] = val;
      await Storage.set(DEF_KEY, all);
      Storage.lsSet(DEF_KEY, all);

      const set = watchers.get(key);
      if (set) for (const fn of set) try{ fn(val); }catch(e){ log.err('flag watcher', e); }
      return val;
    }

    function watch(key, fn){
      if(!watchers.has(key)) watchers.set(key, new Set());
      watchers.get(key).add(fn);
      return ()=> watchers.get(key)?.delete(fn);
    }
    return { init, getAll, get, set, watch };
  })();

  /* =========================== MODULE REGISTRY ============================ */
  function slugify(name){
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  const Modules = (()=>{
    // name => { meta, init, enabledKey, enabledKeyAlt, _booted, _dispose }
    const list = new Map();

    function _disposer(ret){
      if (typeof ret === 'function') return ret;
      if (ret && typeof ret.dispose === 'function') return ()=>ret.dispose();
      return null;
    }

    function _keyPair(name){
      const canonical = `mod:${name}:enabled`;
      const alt = `mod:${slugify(name)}:enabled`;
      return { canonical, alt };
    }

    function _effectiveOn(m){
      return !!Flags.get(m.enabledKey, !!m.meta?.enabledByDefault)
          || !!Flags.get(m.enabledKeyAlt, false);
    }

    async function bootOne(name){
      const m = list.get(name);
      if (!m || m._booted) return false;
      return await guard(async ()=>{
        log.info(`Boot ${name}`);
        const ret = await m.init?.();
        m._dispose = _disposer(ret);
        m._booted  = true;
        Bus.emit('module:started', { name });
        return true;
      }, `init:${name}`);
    }

    async function stopOne(name){
      const m = list.get(name);
      if (!m || !m._booted) return false;
      return await guard(async ()=>{
        log.info(`Stop ${name}`);
        try { m._dispose?.(); } catch(e){ log.err('dispose failed', e); }
        m._dispose = null;
        m._booted  = false;
        Bus.emit('module:stopped', { name });
        return true;
      }, `stop:${name}`);
    }

    async function _refresh(name){
      const m = list.get(name); if (!m) return;
      const want = _effectiveOn(m);
      if (want && !m._booted) await bootOne(name);
      else if (!want && m._booted) await stopOne(name);
    }

    function register(name, meta, init){
      const { canonical, alt } = _keyPair(name);
      const prev = list.get(name);
      const base = {
        meta: meta || prev?.meta || {},
        init: init || prev?.init,
        enabledKey: canonical,
        enabledKeyAlt: alt,
        _booted: false,
        _dispose: null,
      };
      list.set(name, base);

      // Watch both keys — ONLY start/stop, never write flags here.
      Flags.watch(canonical, ()=>{ _refresh(name); });
      if (alt !== canonical) Flags.watch(alt, ()=>{ _refresh(name); });
    }

    async function bootAll(){
      // Start whatever is enabled at boot time
      for (const [name, m] of list) {
        if (_effectiveOn(m)) await bootOne(name);
      }
    }
    async function stopAll(){ for (const [name] of list) await stopOne(name); }

    // Public: the single place that mirrors both keys
    async function setEnabled(name, val){
      const m = list.get(name); if (!m) return;
      await Flags.set(m.enabledKey, !!val);
      if (m.enabledKeyAlt !== m.enabledKey) await Flags.set(m.enabledKeyAlt, !!val);
      // Watchers will call _refresh; no need to call it again.
    }

    // Helper for UIs that only know a key
    async function onFlagChanged(key, val){
      for (const [name, m] of list){
        if (m.enabledKey === key || m.enabledKeyAlt === key) {
          await setEnabled(name, !!val);
          break;
        }
      }
    }

    function all(){
      return Array.from(list.entries()).map(([name, m])=>({ name, ...m }));
    }

    return { register, all, bootAll, stopAll, setEnabled, onFlagChanged, _bootOne: bootOne, _stopOne: stopOne, _list: list };
  })();

  /* ============================== STYLES BASE ============================= */
  css(`
    :root { --${NS}-ink:#222; --${NS}-bg:#111a; --${NS}-accent:#c21; }
    .${NS}-hidden { display:none !important; }
  `, 'base-colors');

  /* =============================== EXPORTS ================================ */
  const AO3H_API = {
    env: { NS, VERSION, DEBUG },
    util: { $, $$, on, once, onReady, observe, debounce, throttle, sleep, css, log, guard },
    store: Storage,
    routes: Routes,
    bus: Bus,
    flags: Flags,
    modules: Modules,
    // Filled by menu.js later
    menu: { addToggle:()=>{}, addAction:()=>{}, addSeparator:()=>{}, rebuild:()=>{} },
  };

  // Merge if AO3H existed already (avoid clobbering previous props)
  W.AO3H = W.AO3H ? Object.assign(W.AO3H, AO3H_API) : AO3H_API;
  try { window.AO3H = W.AO3H; } catch {}

  /* ===== Legacy register() shim ===== */
  if (!W.AO3H.register) {
    W.AO3H.register = function(defOrId, maybeDef){
      const defs = [];
      if (typeof defOrId === 'string') {
        defs.push({ id: defOrId, ...(maybeDef || {}) });
      } else if (defOrId && typeof defOrId === 'object' && !maybeDef) {
        if (defOrId.id) defs.push(defOrId);
        else for (const [id, v] of Object.entries(defOrId)) {
          if (v && typeof v === 'object') defs.push({ id, ...v });
        }
      } else { return; }

      for (const def of defs) {
        const id    = def.id;
        const title = def.title || id;

        W.AO3H.modules.register(id, { title, enabledByDefault: true }, async function init(){
          try { def.onFlagsUpdated?.({ enabled: true }); } catch {}
          let ret = undefined;
          try { ret = await def.init?.({ enabled: true }); }
          catch(e){ console.error('[AO3H] legacy init failed', id, e); }

          const disposer = (typeof ret === 'function') ? ret
                : (ret && typeof ret.dispose === 'function') ? ()=>ret.dispose()
                : (typeof def.dispose === 'function') ? ()=>def.dispose()
                : null;

          return () => {
            try { def.onFlagsUpdated?.({ enabled: false }); } catch {}
            try { disposer?.(); } catch(e){ console.error('[AO3H] legacy dispose failed', id, e); }
          };
        });

        const canonical = `mod:${id}:enabled`;
        const alt = `mod:${String(id).toLowerCase().replace(/[^a-z0-9]+/g,'')}:enabled`;
        Flags.watch(canonical, (val)=> { try { def.onFlagsUpdated?.({ enabled: !!val }); } catch {} });
        if (alt !== canonical) Flags.watch(alt, (val)=> { try { def.onFlagsUpdated?.({ enabled: !!val }); } catch {} });
      }
    };
  }

  /* =============================== BOOT =================================== */
  const DEFAULT_FLAGS = {
    'ui:showMenuButton': false,
    'mod:SaveScroll:enabled': true,
  };

  (async function boot(){
    await Flags.init(DEFAULT_FLAGS);
    Bus.emit('core:ready', { version: VERSION });
    await Modules.bootAll();
    log.info('Core ready', VERSION);

    try {
      Modules.all().forEach(m=>{
        log.info('Module registered:', m.name, 'keys:', m.enabledKey, m.enabledKeyAlt);
      });
    } catch {}
  })();

})();
