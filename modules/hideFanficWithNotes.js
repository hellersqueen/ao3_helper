/* modules/hideFanficWithNotes.js — hide works with user notes (IndexedDB + minimal note picker)
   Robust version: observes DOM, supports works/tags/bookmarks listings, lazy-safe globals. */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, observe, debounce, css } = (AO3H.util || {});
  const dlog = (...a)=>{ if (AO3H.env?.DEBUG) console.log('[AO3H][HideFanficWithNotes]', ...a); };

  const MOD_ID  = 'HideFanficWithNotes';
  const DB_NAME = 'ao3h-hiddenWorksDB';
  const STORE   = 'works';

  /* ---------------------------- Page detection ---------------------------- */
  function isListPage(){
    const p = location.pathname;
    return (
      /^\/works\/?$/.test(p) ||
      /^\/tags\/[^/]+\/works\/?$/.test(p) ||
      /^\/users\/[^/]+\/bookmarks/.test(p) ||
      document.querySelector('ol.index li.blurb, #main li.blurb') // fallback check
    );
  }

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
    'crossover', 'sequel', 'bad summary', 'parent/dad', 'unfinished',
    'POV 1st', 'established', 'not focused', 'always-a-girl'
  ];

  async function pickReason(seed=''){
    let panel = document.getElementById(`${NS}-picker`);
    if (!panel){
      panel = document.createElement('div');
      panel.id = `${NS}-picker`; panel.className = `${NS}-picker`;
      panel.innerHTML = `
        <div><strong>Choose a tag or write a note</strong></div>
        <div class="chips"></div>
        <div class="row"><input type="text" id="${NS}-pick-inp" placeholder="Write a note…" /><button id="${NS}-pick-add">Add</button></div>
        <div style="margin-top:6px;display:flex;gap:8px;justify-content:flex-end">
          <button id="${NS}-pick-cancel">Cancel</button>
        </div>
      `;
      (document.body || document.documentElement).appendChild(panel);
    }
    const chips = panel.querySelector('.chips');
    chips.innerHTML = '';
    DEFAULT_CHIPS.forEach(tag=>{
      const chip = document.createElement('span');
      chip.className='chip'; chip.textContent=tag;
      chip.addEventListener('click', ()=>finish(tag));
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
    panel.addEventListener('keydown', (e)=>{ if (e.key==='Enter') add.click(); if (e.key==='Escape') cancel.click(); }, { once:false });

    return p;
  }

  /* ---------------------------- DOM utilities ---------------------------- */
  function queryAllBlurbs(root=document){
    // AO3 list items are usually <li class="blurb"> inside <ol class="index">.
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
    header.appendChild(btn);
  }

  function getWorkIdFromBlurb(blurb){
    // Prefer first link in the heading that points to /works/<id>
    const candidates = blurb.querySelectorAll('.header .heading a, .header a, a[href*="/works/"]');
    for (const a of candidates){
      const href = a.getAttribute('href') || '';
      if (/\/works\/\d+/.test(href)) return href.replace(/(#.*|\?.*)$/,'');
    }
    return null;
  }

  function hideWork(blurb, reason){
    if (blurb.querySelector('.'+NS+'-hidebar')) return;
    const bar = document.createElement('div');
    bar.className = `${NS}-hidebar`;
    bar.innerHTML = `
      <div>This work is hidden: <span class="reason"></span></div>
      <div>
        <button class="edit" type="button">Edit</button>
        <button class="show" type="button">Show</button>
        <button class="unhide" type="button">Unhide</button>
      </div>`;
    bar.querySelector('.reason').textContent = reason;
    blurb.appendChild(bar);

    // temporarily hide the rest of the blurb
    Array.from(blurb.children).forEach(c=>{ if (c!==bar) c.style.display='none'; });
  }

  function showWork(blurb){
    blurb.querySelectorAll('.'+NS+'-hidebar').forEach(x=>x.remove());
    Array.from(blurb.children).forEach(c=> c.style.removeProperty('display'));
  }

  /* -------------------------- Export / Import ---------------------------- */
  async function exportHidden(){
    await openDB();
    const all = await getAll();
    const blob = new Blob([JSON.stringify(all,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ao3h-hidden-works-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  async function importHidden(){
    const input = document.createElement('input');
    input.type='file'; input.accept='application/json';
    input.addEventListener('change', async ()=>{
      const f = input.files?.[0]; if (!f) return;
      try{
        const parsed = JSON.parse(await f.text());
        if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
        await openDB();
        let count = 0;
        for (const rec of parsed){
          if (rec && rec.workId) { await put({ workId: rec.workId, reason: String(rec.reason||''), isHidden: rec.isHidden !== false }); count++; }
        }
        alert(`Imported ${count} records. Reload to apply on this page.`);
      }catch(err){
        alert('Import failed: '+err.message);
      }
    }, { once:true });
    input.click();
  }

  // expose globals for menu
  W.ao3hExportHiddenWorks = exportHidden;
  W.ao3hImportHiddenWorks = importHidden;

  /* ------------------------------ Enhancer ------------------------------- */
  let hiddenCache = new Map(); // workId -> record
  let initDone = false;

  async function refreshCache(){
    await openDB();
    const all = await getAll();
    hiddenCache = new Map(all.map(r => [r.workId, r]));
  }

  function enhanceListOnce(){
    // Add buttons and apply existing hides
    const blurbs = queryAllBlurbs();
    if (!blurbs.length) return;

    blurbs.forEach(blurb=>{
      ensureHideButton(blurb);
      const id = getWorkIdFromBlurb(blurb);
      if (!id) return;
      const rec = hiddenCache.get(id);
      if (rec?.isHidden) hideWork(blurb, rec.reason || '');
    });
  }

  const enhance = debounce(() => {
    try {
      enhanceListOnce();
    } catch (e) { console.error('[AO3H][HideFanficWithNotes] enhance failed', e); }
  }, 120);

  /* ------------------------------- Init ---------------------------------- */
  async function init(){
    if (!isListPage()) return;
    await refreshCache();
    enhanceListOnce();

    // Click handlers (delegated)
    document.addEventListener('click', async (e)=>{
      // Hide button
      const hideBtn = e.target.closest?.('.'+NS+'-hide-btn');
      if (hideBtn){
        const blurb = hideBtn.closest('li.blurb') || hideBtn.closest('.blurb') || hideBtn.closest('li');
        if (!blurb) return;
        const id = getWorkIdFromBlurb(blurb);
        if (!id) return;
        try{
          const existing = hiddenCache.get(id);
          const picked = await pickReason(existing?.reason || '');
          if (picked == null) return; // canceled
          hideWork(blurb, picked);
          await put({ workId:id, reason:String(picked), isHidden:true });
          hiddenCache.set(id, { workId:id, reason:String(picked), isHidden:true });
        }catch(err){ console.error('[AO3H][HideFanficWithNotes] hide click failed', err); }
        return;
      }

      // Bar actions
      const bar = e.target.closest?.('.'+NS+'-hidebar');
      if (!bar) return;
      const blurb = bar.closest('li.blurb') || bar.closest('.blurb') || bar.closest('li');
      const id = getWorkIdFromBlurb(blurb);
      if (!id) return;

      if (e.target.classList.contains('show')){
        // temporary show; do not change DB
        showWork(blurb);
      } else if (e.target.classList.contains('unhide')){
        if (!confirm('Unhide this work permanently?')) return;
        showWork(blurb);
        await put({ workId:id, reason:'', isHidden:false });
        hiddenCache.set(id, { workId:id, reason:'', isHidden:false });
      } else if (e.target.classList.contains('edit')){
        const current = bar.querySelector('.reason')?.textContent || '';
        const next = await pickReason(current);
        if (next == null) return;
        bar.querySelector('.reason').textContent = String(next);
        await put({ workId:id, reason:String(next), isHidden:true });
        hiddenCache.set(id, { workId:id, reason:String(next), isHidden:true });
      }
    }, false);

    // Watch for DOM changes (pagination, AO3 dynamic inserts, etc.)
    observe(document.body, enhance);
    // Also rerun if our flags or route change
    document.addEventListener(`${NS}:navigated`, enhance);
  }

  AO3H.register?.({
    id: MOD_ID,
    title: 'Hide fanfic (with notes)',
    defaultFlagKey: 'hideFanficWithNotes',
    init: async ({ enabled }) => { if (enabled) onReady(init); },
  });

})();
