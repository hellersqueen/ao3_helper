;(function(){
  'use strict';

  /* ========================= ENV / NAMESPACE / LOG ========================= */
  const NS      = 'ao3h';
  const VERSION = '1.1.0';
  const DEBUG   = false;               // true pour debug global
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

  function observe(root, opts, cb){
    const ob = new MutationObserver(cb);
    ob.observe(root || document.documentElement, opts || {childList:true,subtree:true});
    return ob;
  }

  // CSS helper (clé = pour éviter doublons si ré-injecté)
  const _cssKeys = new Set();
  function css(str, key=`block-${_cssKeys.size}`){
    if (_cssKeys.has(key)) return;
    _cssKeys.add(key);
    try { GM_addStyle(str); } catch {
      const style = document.createElement('style');
      style.textContent = str;
      document.documentElement.appendChild(style);
    }
  }

  /* ============================== STORAGE ================================== */
  const Storage = {
    key: (k)=> `${NS}:${k}`,
    async get(k, d=null){ try { return await GM_getValue(this.key(k), d); } catch { return d; } },
    async set(k, v){ try { GM_setValue(this.key(k), v); } catch(e){ log.err('GM_setValue failed', e); } return v; },
    async del(k){ try { GM_deleteValue(this.key(k)); } catch(e){ log.err('GM_deleteValue failed', e); } },
    // miroirs LS (optionnels)
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
    const map = new Map(); // evt => Set<fn>
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
    async function set(key, val){
      const all = getAll(); all[key] = val;
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
  const Modules = (()=> {
    const list = new Map(); // name => { meta, init, enabledKey }
    function register(name, meta, init){
      if (list.has(name)) { log.warn('Module already registered', name); return; }
      const enabledKey = `mod:${name}:enabled`;
      list.set(name, { meta: meta||{}, init, enabledKey });
    }
    function all(){ return Array.from(list.entries()).map(([name, m])=>({name, ...m})); }
    async function bootAll(){
      for (const [name, m] of list){
        const shouldOn = !!Flags.get(m.enabledKey, !!m.meta?.enabledByDefault);
        if (!shouldOn) { log.dbg(`Skip ${name} (disabled)`); continue; }
        await guard(async ()=>{
          log.info(`Boot ${name}`);
          await m.init?.();
          Bus.emit('module:started', { name });
        }, `init:${name}`);
      }
    }
    return { register, all, bootAll };
  })();

  /* ============================== STYLES BASE ============================= */
  css(`
    :root { --${NS}-ink:#222; --${NS}-bg:#111a; --${NS}-accent:#c21; }
    .${NS}-hidden { display:none !important; }
  `, 'base-colors');

  /* =============================== EXPORTS ================================ */
  window.AO3H = {
    env: { NS, VERSION, DEBUG },
    util: { $, $$, on, once, onReady, observe, debounce, throttle, sleep, css, log, guard },
    store: Storage,
    routes: Routes,
    bus: Bus,
    flags: Flags,
    modules: Modules,
    // API de menu complétée par menu.js
    menu: { addToggle:()=>{}, addAction:()=>{}, addSeparator:()=>{}, rebuild:()=>{} },
  };

  /* =============================== BOOT =================================== */
  const DEFAULT_FLAGS = {
    'ui:showMenuButton': false, // pas de bouton flottant dans ce skin
    // exemples (modules)
    'mod:SaveScroll:enabled': true,
  };

(async function boot(){
  await Flags.init(DEFAULT_FLAGS);
  Bus.emit('core:ready', { version: VERSION });
  await Modules.bootAll();                 // ← démarre effectivement les modules enregistrés
  log.info('Core ready', VERSION);
})();


})();
