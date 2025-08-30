/* modules/hideFanficWithNotes.js — hide works with user notes (IndexedDB + note picker)
   Live-toggle safe, legacy-safe cleanup, CANCELABLE debounce, and TEMP-SHOW allowlist. */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, observe, css } = (AO3H.util || {});

  const MOD_ID   = 'HideFanficWithNotes';
  const FLAG_CAN = 'mod:HideFanficWithNotes:enabled';
  const FLAG_ALT = 'mod:hidefanficwithnotes:enabled';

  const DB_NAME = 'ao3h-hiddenWorksDB';
  const STORE   = 'works';

  /* ------------------------------- Styles -------------------------------- */
  css`
    .${NS}-hide-btn{ float:right; margin-right:8px; margin-top:-24px; }
    .${NS}-hidebar{
      display:flex; align-items:center; justify-content:space-between;
      padding:6px 10px; background:#f0f0f0; border-radius:6px; margin:.4em 0;
    }
    .${NS}-hidebar .reason{ font-weight:600; }
    .${NS}-picker{
      position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
      background:#fff; border:1px solid #bbb; border-radius:10px; padding:12px;
      box-shadow:0 10px 28px rgba(0,0,0,.18); display:none; z-index:99999; width:min(420px,92vw);
      font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .${NS}-picker.${NS}-open{ display:block; }
    .${NS}-picker .chips{ display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
    .${NS}-picker .chip{ border:1px solid #c7c7c7; border-radius:999px; padding:4px 10px; cursor:pointer; background:#fafafa; }
    .${NS}-picker .row{ display:flex; gap:8px; }
    .${NS}-picker input{ flex:1; padding:6px 8px; border:1px solid #cfcfcf; border-radius:6px; }
    .${NS}-picker button{ border:1px solid #bdbdbd; background:#f6f6f6; border-radius:6px; padding:6px 10px; cursor:pointer; }
    .${NS}-picker button:hover{ background:#efefef; }
  `;

  /* ----------------------------- IndexedDB ------------------------------- */
  let db;
  function openDB(){
    if (db) return Promise.resolve(db);
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME,1);
      req.onupgradeneeded = (ev)=>{
        const dbx = ev.target.result;
        const store = dbx.createObjectStore(STORE,{ keyPath:'workId' });
        store.createIndex('reason','reason',{ unique:false });
        store.createIndex('isHidden','isHidden',{ unique:false });
      };
      req.onsuccess = (ev)=>{ db=ev.target.result; resolve(db); };
      req.onerror   = (ev)=>reject(ev.target.error);
    });
  }
  function getAll(){ return new Promise((res,rej)=>{ const tx=db.transaction([STORE],'readonly'); const req=tx.objectStore(STORE).getAll(); req.onsuccess=()=>res(req.result||[]); req.onerror=()=>rej(); }); }
  function getOne(id){ return new Promise((res,rej)=>{ const tx=db.transaction([STORE],'readonly'); const req=tx.objectStore(STORE).get(id); req.onsuccess=()=>res(req.result||null); req.onerror=()=>rej(); }); }
  function put(rec){ return new Promise((res,rej)=>{ const tx=db.transaction([STORE],'readwrite'); const req=tx.objectStore(STORE).put(rec); req.onsuccess=()=>res(true); req.onerror=()=>rej(); }); }

  /* --------------------------- Quick-note picker -------------------------- */
  const DEFAULT_CHIPS = [
    'crossover','sequel','bad summary','parent/dad','unfinished',
    'POV 1st','established','not focused','always-a-girl'
  ];

  async function pickReason(seed=''){
    let panel = document.getElementById(`${NS}-picker`);
    if (!panel){
      panel = document.createElement('div');
      panel.id = `${NS}-picker`; panel.className = `${NS}-picker`;
      panel.innerHTML = `
        <div><strong>Choose a tag or write a note</strong></div>
        <div class="chips"></div>
        <div class="row">
          <input type="text" id="${NS}-pick-inp" placeholder="Write a note…" />
          <button id="${NS}-pick-add">Add</button>
        </div>
        <div style="margin-top:6px;display:flex;gap:8px;justify-content:flex-end">
          <button id="${NS}-pick-cancel">Cancel</button>
        </div>`;
      (document.body || document.documentElement).appendChild(panel);
    }
    const chips = panel.querySelector('.chips');
    chips.innerHTML = '';
    DEFAULT_CHIPS.forEach(tag=>{
      const chip = document.createElement('span');
      chip.className='chip'; chip.textContent=tag;
      chip.addEventListener('click', ()=>finish(tag), { once:true });
      chips.appendChild(chip);
    });

    const inp = panel.querySelector('#'+NS+'-pick-inp');
    const add = panel.querySelector('#'+NS+'-pick-add');
    const cancel = panel.querySelector('#'+NS+'-pick-cancel');
    inp.value = seed || '';

    let resolver; const p = new Promise(r=>resolver=r);
    function finish(val){ panel.classList.remove(`${NS}-open`); resolver(val); }

    add.onclick = ()=>{ const v=(inp.value||'').trim(); if (v) finish(v); };
    cancel.onclick = ()=>finish(null);
    panel.classList.add(`${NS}-open`); inp.focus();
    panel.addEventListener('keydown', (e)=>{ if (e.key==='Enter') add.click(); if (e.key==='Escape') cancel.click(); });

    return p;
  }

  /* ----------------------------- Utilities -------------------------------- */
  function queryAllBlurbs(root=document){
    const ls = Array.from(root.querySelectorAll('ol.index li.blurb'));
    if (ls.length) return ls;
    return Array.from(root.querySelectorAll('#main li.blurb, li.blurb'));
  }
  function ensureHideButton(blurb){
    if (blurb.querySelector('.'+NS+'-hide-btn')) return;
    const header = blurb.querySelector('.header') || blurb.querySelector('.heading') || blurb;
    const btn = document.createElement('button');
    btn.className = `${NS}-hide-btn`;
    btn.type = 'button';
    btn.textContent = 'Hide';
    btn.title = 'Hide (Shift-click to skip note)';
    header.appendChild(btn);
  }
  function removeHideButtons(){ document.querySelectorAll('.'+NS+'-hide-btn').forEach(b=>b.remove()); }

  function getWorkIdFromBlurb(blurb){
    // Null-safe + type guard
    if (!blurb || typeof blurb.querySelectorAll !== 'function') return null;
    const candidates = blurb.querySelectorAll('.header .heading a, .header a, a[href*="/works/"]');
    for (const a of candidates){
      const href = a.getAttribute('href') || '';
      if (/\/works\/\d+/.test(href)) return href.replace(/(#.*|\?.*)$/,'');
    }
    return null;
  }

  // Mark children we hide so we can restore later
  function hideWork(blurb, reason){
    if (blurb.querySelector('.'+NS+'-hidebar')) return;
    const bar = document.createElement('div');
    bar.className = `${NS}-hidebar`;
    bar.innerHTML = `
      <div>This work is hidden: <span class="reason"></span></div>
      <div>
        <button class="edit" type="button">Edit</button>
        <button class="show" type="button">Show</button>
        <button class="unhide" type="button" title="Unhide permanently (keeps note)">Unhide</button>
      </div>`;
    bar.querySelector('.reason').textContent = reason || '';
    blurb.appendChild(bar);

    Array.from(blurb.children).forEach(c=>{
      if (c !== bar) {
        c.dataset.ao3hHfn = '1';
        c.style.display = 'none';
      }
    });
  }
  function showWork(blurb){
    blurb.querySelectorAll('.'+NS+'-hidebar').forEach(x=>x.remove());
    Array.from(blurb.children).forEach(c=>{
      if (c.dataset && c.dataset.ao3hHfn === '1') {
        c.style.removeProperty('display');
        delete c.dataset.ao3hHfn;
      }
    });
  }
  // legacy-safe reveal (clear any inline display:none even without our marker)
  function forceReveal(blurb){
    blurb.querySelectorAll('.'+NS+'-hidebar').forEach(b=>b.remove());
    Array.from(blurb.children).forEach(c=>{
      if (c.style && c.style.display === 'none') c.style.removeProperty('display');
      if (c.dataset && c.dataset.ao3hHfn) delete c.dataset.ao3hHfn;
    });
  }
  function unhideAllOnPage(){ document.querySelectorAll('li.blurb, .blurb').forEach(forceReveal); }

  /* ------------------------------ Data cache ------------------------------ */
  let hiddenCache = new Map();   // workId -> record

  /* ---------------------- TEMP SHOW allowlist (per-path) ------------------ */
  let tempShow = new Set();
  const tempKey = ()=> `${NS}:hfn:tempShow:${location.pathname}`;
  function loadTempShow(){
    try {
      const raw = sessionStorage.getItem(tempKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  }
  function saveTempShow(){
    try { sessionStorage.setItem(tempKey(), JSON.stringify([...tempShow])); } catch {}
  }
  function clearTempShow(){
    tempShow.clear();
    try { sessionStorage.removeItem(tempKey()); } catch {}
  }

  /* -------------------------- cancelable debounce ------------------------- */
  function makeDebounce(fn, ms=120){
    let t = null;
    const deb = (...a)=>{
      clearTimeout(t);
      t = setTimeout(()=>{ fn(...a); }, ms);
    };
    deb.cancel = ()=>{ clearTimeout(t); t = null; };
    return deb;
  }

  let active = false;            // gate to ignore late timers
  let mo = null;
  let clickHandler = null;
  let navEvtHandler = null;
  let busUnsub = null;

  function guarded(fn){ return (...a)=>{ if (!active) return; fn(...a); }; }

  async function refreshCache(){
    await openDB();
    const all = await getAll();
    hiddenCache = new Map(all.map(r => [r.workId, r]));
  }

  function applyStoredHides(){
    if (!active) return;
    const blurbs = queryAllBlurbs();
    for (const blurb of blurbs){
      const id = getWorkIdFromBlurb(blurb);
      if (!id) continue;
      const rec = hiddenCache.get(id);

      // if user has temp-shown this work, keep it visible even if DB says hidden
      if (rec?.isHidden) {
        if (tempShow.has(id)) {
          showWork(blurb);          // ensure bar is gone and content visible
          ensureHideButton(blurb);
        } else {
          ensureHideButton(blurb);
          hideWork(blurb, rec.reason || '');
        }
      } else {
        // DB says visible
        showWork(blurb);
        ensureHideButton(blurb);
      }
    }
  }

  function enhanceListOnce(){
    if (!active) return;
    const blurbs = queryAllBlurbs();
    if (!blurbs.length) return;
    blurbs.forEach(ensureHideButton);
    applyStoredHides();
  }

  const enhance = makeDebounce(()=>{ if (active) try{ enhanceListOnce(); }catch(e){ console.error('[AO3H][HFN] enhance failed', e); } }, 120);

  /* ------------------------------- Lifecycle ------------------------------ */
  async function start(){
    active = true;

    // restore temp-show allowlist for this path
    tempShow = loadTempShow();

    await refreshCache();
    enhanceListOnce();

    // SINGLE, hardened, guarded click handler
    clickHandler = guarded(async (e)=>{
// ---- Hide button on blurb header ----
const hideBtn = e.target?.closest?.('.' + NS + '-hide-btn');
if (hideBtn){
  const blurb = hideBtn.closest('li.blurb') || hideBtn.closest('.blurb') || hideBtn.closest('li');
  const id = getWorkIdFromBlurb(blurb);
  if (!blurb || !id) return;

  try{
    const existing = hiddenCache.get(id);

    // 1) If it was temp-shown (or visible but marked hidden), re-hide with existing note — no picker.
    const wasTempShown = existing?.isHidden && tempShow.has(id);
    const isVisibleButShouldBeHidden = existing?.isHidden && !blurb.querySelector('.' + NS + '-hidebar');
    if (wasTempShown || isVisibleButShouldBeHidden){
      tempShow.delete(id); saveTempShow();
      const reason = existing?.reason || '';
      hideWork(blurb, reason);
      await put({ workId:id, reason:String(reason), isHidden:true });
      hiddenCache.set(id, { workId:id, reason:String(reason), isHidden:true });
      return;
    }

    // 2) Quick toggle — any modifier key skips the picker.
    const quick = e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;
    if (quick){
      tempShow.delete(id); saveTempShow();
      const reason = existing?.reason || '';
      hideWork(blurb, reason);
      await put({ workId:id, reason:String(reason), isHidden:true });
      hiddenCache.set(id, { workId:id, reason:String(reason), isHidden:true });
      return;
    }

    // 3) Default: open the picker (new hide or you want to edit the note).
    const picked = await pickReason(existing?.reason || '');
    if (picked == null) return;
    if (!blurb.isConnected) return; // re-check after await

    tempShow.delete(id); saveTempShow();
    hideWork(blurb, picked);
    await put({ workId:id, reason:String(picked), isHidden:true });
    hiddenCache.set(id, { workId:id, reason:String(picked), isHidden:true });
  }catch(err){
    console.error('[AO3H][HFN] hide click failed', err);
  }
  return;
}



      // ---- Actions inside the hide bar ----
      const bar = e.target?.closest?.('.' + NS + '-hidebar');
      if (!bar) return;

      // Resolve blurb + id *now*, before any async
      const blurb = bar.closest('li.blurb') || bar.closest('.blurb') || bar.closest('li');
      const id = getWorkIdFromBlurb(blurb);
      if (!blurb || !id) return;

      if (e.target.classList.contains('show')){
        // Temporary reveal: DB unchanged, but remember exemption
        showWork(blurb);
        tempShow.add(id); saveTempShow();
        return;
      }

      if (e.target.classList.contains('unhide')){
        if (!confirm('Unhide this work permanently? (Note will be kept)')) return;
        if (!blurb.isConnected) return; // safeguard

        showWork(blurb);
        tempShow.delete(id); saveTempShow();   // no exemption needed anymore
        const rec = hiddenCache.get(id);
        const reason = rec?.reason || bar.querySelector('.reason')?.textContent || '';
        await put({ workId:id, reason:String(reason), isHidden:false });
        hiddenCache.set(id, { workId:id, reason:String(reason), isHidden:false });
        return;
      }

      if (e.target.classList.contains('edit')){
        const current = bar.querySelector('.reason')?.textContent || '';
        const next = await pickReason(current);
        if (next == null) return;

        // after await, make sure blurb/bar still exist
        if (!blurb.isConnected) return;
        const barNow = blurb.querySelector('.' + NS + '-hidebar');
        if (!barNow) return;

        barNow.querySelector('.reason').textContent = String(next);
        await put({ workId:id, reason:String(next), isHidden:true });
        hiddenCache.set(id, { workId:id, reason:String(next), isHidden:true });
        // keep tempShow as-is (if they temporarily showed earlier, keep it visible)
        return;
      }
    });

    // ATTACH IT
    document.addEventListener('click', clickHandler, false);

    mo = observe(document.body, ()=> enhance()); // schedule only; enhance checks 'active'

    navEvtHandler = guarded(()=> enhance());
    document.addEventListener(`${NS}:navigated`, navEvtHandler);
    if (AO3H.bus?.on){
      const fn = guarded(()=> enhance());
      AO3H.bus.on('navigated', fn);
      busUnsub = ()=> { try{ AO3H.bus.off?.('navigated', fn); }catch{} };
    }
  }

  function stop(){
    active = false;

    try { document.removeEventListener('click', clickHandler, false); } catch {}
    clickHandler = null;

    try { document.removeEventListener(`${NS}:navigated`, navEvtHandler); } catch {}
    navEvtHandler = null;

    try { mo?.disconnect?.(); } catch {}
    mo = null;

    try { busUnsub?.(); } catch {}
    busUnsub = null;

    try { enhance.cancel?.(); } catch {}

    // Clear temp-show list when turning the module off (so re-enable respects DB)
    clearTempShow();

    // HARD RESET visuals (legacy-safe)
    unhideAllOnPage();
    removeHideButtons();
  }

  /* ===== Hidden works Import/Export hooks — place before AO3H.modules.register(...) ===== */
(() => {
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // Don’t redefine if already present
  if (typeof W.ao3hExportHiddenWorks === 'function' || typeof W.ao3hImportHiddenWorks === 'function') return;

  const NS = (W.AO3H && W.AO3H.env && W.AO3H.env.NS) || 'ao3h';
  const STORAGE_KEY = `${NS}.hiddenWorks`;

  // Read/write helpers — GM_* if available, else localStorage
  const readHidden = () => {
    try { if (typeof GM_getValue === 'function') return JSON.parse(GM_getValue(STORAGE_KEY, '[]')); } catch {}
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch {}
    return [];
  };
  const writeHidden = (val) => {
    const json = JSON.stringify(val, null, 2);
    try { if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, json); } catch {}
    try { (document.body || document.documentElement) && localStorage.setItem(STORAGE_KEY, json); } catch {}
  };

  const downloadJSON = (filename, text) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  };

  function exportHiddenWorks() {
    const data = readHidden();
    const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
    downloadJSON(`ao3-hidden-works-${stamp}.json`, JSON.stringify(data, null, 2));
  }

  function importHiddenWorks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const incoming = JSON.parse(String(reader.result || '[]'));
          const current  = readHidden();
          let next;
          if (Array.isArray(current) && Array.isArray(incoming)) {
            const keyOf = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v) : JSON.stringify(v);
            const seen = new Set(current.map(keyOf));
            next = current.slice();
            for (const item of incoming) {
              const k = keyOf(item);
              if (!seen.has(k)) { seen.add(k); next.push(item); }
            }
            alert(`Imported ${next.length - current.length} new item(s). Total: ${next.length}.`);
          } else {
            next = incoming;
            alert('Imported list (overwrote previous value).');
          }
          writeHidden(next);
          try { document.dispatchEvent(new CustomEvent(`${NS}:hidden-works-updated`, { detail:{ count: next?.length || 0 } })); } catch {}
        } catch (e) {
          alert('Invalid JSON: ' + e.message);
        } finally {
          input.remove();
        }
      };
      reader.readAsText(file);
    }, { once:true });
    (document.body || document.documentElement).appendChild(input);
    input.click();
  }

  // Expose to PAGE for the menu dialog
  W.ao3hExportHiddenWorks = exportHiddenWorks;
  W.ao3hImportHiddenWorks = importHiddenWorks;
})();

  /* --------------------------- Module registration ------------------------ */
  function register(){
    if (AO3H.modules && typeof AO3H.modules.register === 'function') {
      AO3H.modules.register(MOD_ID, { title: 'Hide fanfic (with notes)', enabledByDefault: true }, async ()=>{
        onReady(start);
        return () => stop();
      });
    } else {
      AO3H.register?.({
        id: MOD_ID,
        title: 'Hide fanfic (with notes)',
        defaultFlagKey: 'hideFanficWithNotes',
        init: async ({ enabled }) => { if (enabled) onReady(start); return ()=>stop(); },
        onFlagsUpdated: async ({ enabled }) => { enabled ? start() : stop(); },
      });
    }

    // Safety net: react if flags flip directly
    try {
      AO3H.flags?.watch?.(FLAG_CAN, v => { v ? onReady(start) : stop(); });
      if (FLAG_ALT !== FLAG_CAN) AO3H.flags?.watch?.(FLAG_ALT, v => { v ? onReady(start) : stop(); });
    } catch {}
  }

  register();

})();
