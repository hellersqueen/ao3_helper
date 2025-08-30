/* modules/saveScroll.js — Persist & restore reading position for AO3 works/chapters
   Toast-first ONLY on fresh open; keep native restoration on refresh/back-forward.
   Press Enter to "Resume reading" when the toast is visible.
   Robust registration so it always appears in the AO3 Helper menu.
*/
;(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // Ensure a shared AO3H object *before* core loads, so core merges into it.
  let AO3H = W.AO3H || (W.AO3H = {});

  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';
  const {
    onReady,
    debounce,
    throttle,
    sleep,
    log,
    css: cssFromCore
  } = (AO3H.util || {
    onReady: (fn)=> (document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn()),
    debounce: (fn,ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; },
    throttle: (fn,ms=200)=>{ let t=0; return (...a)=>{ const n=Date.now(); if(n-t>=ms){ t=n; fn(...a); } }; },
    sleep: (ms)=> new Promise(r=>setTimeout(r,ms)),
    log: console
  });

  // Minimal CSS injector fallback if core.css isn't present
  const css = cssFromCore || function injectCSS(first, ...rest){
    let text = '';
    if (Array.isArray(first) && Object.prototype.hasOwnProperty.call(first, 'raw')) {
      const strings = first, vals = rest;
      text = strings.map((s,i)=> s + (i < vals.length ? vals[i] : '')).join('');
    } else {
      text = String(first ?? '');
    }
    try { if (typeof GM_addStyle === 'function') { GM_addStyle(text); return; } } catch {}
    const el = document.createElement('style');
    el.textContent = text;
    (document.head || document.documentElement).appendChild(el);
  };

  // Fallback mini store (only used if core.store not there yet)
  const Store = AO3H.store || {
    lsGet: (k, d=null)=>{ try{ const v = localStorage.getItem(k); return v==null?d:JSON.parse(v);}catch{return d;} },
    lsSet: (k, v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{}; return v; },
    lsDel: (k)=>{ try{ localStorage.removeItem(k); }catch{}; },
  };

  const MOD_ID = 'SaveScroll';
  const TITLE  = 'Save scroll position';

  // ---------- Styles (toast) ----------
  css`
    #${NS}-resume-toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999999;
      background: #111c;
      backdrop-filter: blur(6px);
      color: #fff;
      padding: 10px 12px;
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.25);
      display: none;
      gap: 10px;
      align-items: center;
      max-width: min(80vw, 520px);
      font: 14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    #${NS}-resume-toast.${NS}-show { display: flex; animation: ${NS}-fadein .15s ease-out; }
    #${NS}-resume-toast .msg { margin-right: 8px; }
    #${NS}-resume-toast button {
      border: 1px solid rgba(255,255,255,.35);
      background: rgba(255,255,255,.12);
      color: #fff;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    #${NS}-resume-toast button:hover { background: rgba(255,255,255,.18); }
    #${NS}-resume-toast button.primary {
      background: #22c55e;
      border-color: #22c55e;
      color: #111;
      font-weight: 600;
    }
    #${NS}-resume-toast button.primary:hover { filter: brightness(.95); }
    @keyframes ${NS}-fadein { from{ opacity: 0; transform: translateY(4px); } to{ opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce){
      #${NS}-resume-toast { animation: none !important; }
    }
  `;

  // ---------- Page detection ----------
  function isWorkOrChapterPath(pathname) {
    return /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(pathname);
  }

  function parseIds() {
    const m = location.pathname.match(/^\/works\/(\d+)(?:\/chapters\/(\d+))?$/);
    if (!m) return null;
    const workId = m[1];
    const chapterId = m[2] || null;
    const usp = new URLSearchParams(location.search);
    const isFull = usp.has('view_full_work');
    return { workId, chapterId, isFull };
  }

  // Key per work/chapter/view
  function key() {
    const ids = parseIds();
    if (!ids) return `${NS}:scroll:${location.pathname}`;
    const { workId, chapterId, isFull } = ids;
    return `${NS}:scroll:${workId}:${chapterId || 'work'}:${isFull?'full':'single'}`;
  }

  // ---------- Persistence ----------
  function readState(k = key()) { return Store.lsGet(k, null); }
  function writeState(state, k = key()) { return Store.lsSet(k, state); }
  function clearState(k = key()) { try { Store.lsDel(k); } catch {} }

  // ---------- Geometry helpers ----------
  const docEl = () => document.scrollingElement || document.documentElement || document.body;
  const getScrollY = () => (docEl().scrollTop || window.pageYOffset || 0);
  const setScrollY = (y) => { try { window.scrollTo(0, Math.max(0, y|0)); } catch {} };
  const getMaxScroll = () => Math.max(0, (docEl().scrollHeight || 0) - window.innerHeight);

  // ---------- Save logic ----------
  function snapshotNow() {
    const y  = getScrollY();
    const mx = getMaxScroll();
    const ratio = mx > 0 ? Math.min(1, Math.max(0, y / mx)) : 0;
    const state = {
      y, ratio,
      mx,
      vh: window.innerHeight,
      ts: Date.now(),
      href: location.href,
      title: document.title
    };
    writeState(state);
    return state;
  }

  // ---------- Restore logic (we use this only when we need to) ----------
  async function restoreFromState(state) {
    if (!state) return false;
    const maxTries = 20; // ~2s total if 100ms
    for (let i = 0; i < maxTries; i++) {
      const mx  = getMaxScroll();
      const tgt = Math.round((state.ratio || 0) * mx);
      setScrollY(tgt);
      await sleep(100);
      const cur = getScrollY();
      if (Math.abs(cur - tgt) < 20) break;
    }
    return true;
  }

  // ---------- Detect how we arrived ----------
  function navType(){
    try {
      const e = performance.getEntriesByType('navigation')[0];
      if (e && e.type) return e.type; // 'navigate' | 'reload' | 'back_forward' | 'prerender'
    } catch {}
    // Fallback (deprecated API)
    try {
      const t = performance.navigation && performance.navigation.type;
      if (t === 1) return 'reload';
      if (t === 2) return 'back_forward';
      return 'navigate';
    } catch {}
    return 'navigate';
  }

  // ---------- Toast UI ----------
  let toastEl = null;
  function ensureToast() {
    if (toastEl && toastEl.isConnected) return toastEl;
    const el = document.createElement('div');
    el.id = `${NS}-resume-toast`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <span class="msg">Resume reading where you left off?</span>
      <div class="actions">
        <button type="button" class="primary" id="${NS}-resume-go">Resume reading</button>
        <button type="button" id="${NS}-resume-dismiss" aria-label="Dismiss">Dismiss</button>
      </div>
    `;
    (document.body || document.documentElement).appendChild(el);
    toastEl = el;
    return el;
  }
  function showToast() { ensureToast().classList.add(`${NS}-show`); }
  function hideToast() { if (toastEl) toastEl.classList.remove(`${NS}-show`); detachKeyHandler(); }
  function destroyToast() { if (toastEl && toastEl.isConnected) toastEl.remove(); toastEl = null; detachKeyHandler(); }

  // ---------- Enter-to-resume support ----------
  let keyHandler = null;
  function isTypingTarget(t){
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = (t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }
  function attachKeyHandler(onGo){
    if (keyHandler) return;
    keyHandler = (e)=>{
      if (e.key !== 'Enter') return;
      // Only if toast is visible and user isn't typing
      if (!toastEl || !toastEl.classList.contains(`${NS}-show`)) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      onGo();
    };
    // Capture phase so we beat site-level shortcuts
    window.addEventListener('keydown', keyHandler, true);
  }
  function detachKeyHandler(){
    if (!keyHandler) return;
    try { window.removeEventListener('keydown', keyHandler, true); } catch {}
    keyHandler = null;
  }

  // ---------- Live wiring ----------
  let active = false;
  let scrollSaver   = null;
  let resizeSaver   = null;
  let beforeUnload  = null;
  let prevScrollRestoration = null;
  let toastBound    = false;

  function start() {
    if (active) return;
    if (!isWorkOrChapterPath(location.pathname)) return;
    active = true;

    const state = readState();
    const qualifies = state && ((state.ratio || 0) > 0.02 || (state.y || 0) > 200);
    const nType = navType();
    const isNavigate    = (nType === 'navigate');
    const isReload      = (nType === 'reload');
    const isBackForward = (nType === 'back_forward');

    // --- Behavior matrix ---
    // navigate (fresh open, no hash): toast-first, start at top, no auto-restore
    // reload/back_forward: DO NOT interfere; rely on browser. If browser fails,
    //                      assist once after a short delay.

    if (qualifies && isNavigate && !location.hash) {
      // Force top-of-page start (disable auto-restoration just for this load)
      if ('scrollRestoration' in history) {
        prevScrollRestoration = history.scrollRestoration;
        try { history.scrollRestoration = 'manual'; } catch {}
      }
      onReady(() => { setScrollY(0); });   // ensure at top
      onReady(() => { showToast(); bindToastHandlers(state); });
    } else if (qualifies && (isReload || isBackForward)) {
      // Let the browser do its native restoration.
      // If after a short while we still seem near top (and no anchor), assist once.
      onReady(() => {
        setTimeout(async () => {
          if (!active) return;
          if (location.hash) return;             // respect anchors
          const y = getScrollY();
          if (y < 40) {                          // likely not restored
            try { await restoreFromState(state); } catch {}
          }
        }, 600);
      });
    }

    // Save on scroll/resize (throttled) + beforeunload (final)
    const saveThrottled = throttle(() => { if (active) snapshotNow(); }, 400);
    const saveDebounced = debounce(() => { if (active) snapshotNow(); }, 400);

    scrollSaver  = () => saveThrottled();
    resizeSaver  = () => saveDebounced();
    beforeUnload = () => { try { snapshotNow(); } catch {} };

    window.addEventListener('scroll',  scrollSaver, { passive: true });
    window.addEventListener('resize',  resizeSaver, { passive: true });
    window.addEventListener('beforeunload', beforeUnload);

    log?.info?.('[AO3H]', `SaveScroll started (${nType}) for`, key());
  }

  function bindToastHandlers(state){
    if (toastBound) return;
    toastBound = true;

    const el  = ensureToast();
    const go  = el.querySelector('#' + NS + '-resume-go');
    const dis = el.querySelector('#' + NS + '-resume-dismiss');

    const onGo = async () => {
      try { await restoreFromState(state); } catch {}
      hideToast();
    };
    const onDis = () => hideToast();

    go?.addEventListener('click', onGo);
    dis?.addEventListener('click', onDis);

    // 🔑 Enter-to-resume
    attachKeyHandler(onGo);
  }

  function stop() {
    if (!active) return;
    active = false;

    try { window.removeEventListener('scroll',  scrollSaver,  { passive: true }); } catch {}
    try { window.removeEventListener('resize',  resizeSaver,  { passive: true }); } catch {}
    try { window.removeEventListener('beforeunload', beforeUnload); } catch {}
    scrollSaver = resizeSaver = beforeUnload = null;

    // restore browser behavior
    if ('scrollRestoration' in history && prevScrollRestoration != null) {
      try { history.scrollRestoration = prevScrollRestoration; } catch {}
      prevScrollRestoration = null;
    }

    toastBound = false;
    destroyToast();  // also detaches key handler
    log?.info?.('[AO3H]', 'SaveScroll stopped');
  }

  // ---------- Robust registration (handles load order) ----------
  function registerNow(A) {
    if (A.modules && typeof A.modules.register === 'function') {
      A.modules.register(MOD_ID, { title: TITLE, enabledByDefault: true }, async () => {
        start();
        return () => stop();
      });
      A.menu?.rebuild?.(); // refresh menu so the toggle appears immediately
      return true;
    }
    if (A.register) {
      A.register({
        id: MOD_ID,
        title: TITLE,
        defaultFlagKey: 'SaveScroll',
        init: async ({ enabled }) => { if (enabled) start(); return () => stop(); },
        onFlagsUpdated: async ({ enabled }) => { enabled ? start() : stop(); },
      });
      A.menu?.rebuild?.();
      return true;
    }
    return false;
  }

  (function robustRegister(){
    // try immediately
    if (registerNow(W.AO3H)) return;

    // wait until core is ready (poll briefly)
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      // AO3H might have been created by core now; update our local ref to it
      if (W.AO3H && AO3H !== W.AO3H) AO3H = W.AO3H;

      if (registerNow(W.AO3H)) { clearInterval(iv); return; }
      if (tries > 120) { clearInterval(iv); } // ~6s safety cap
    }, 50);
  })();

})();
