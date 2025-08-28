/* modules/hideFanficWithNotes.js — hide works with user notes (IndexedDB + minimal note picker) */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, css } = (AO3H.util || {});
  const dlog = (...a)=>{ if (AO3H.env?.DEBUG) console.log('[AO3H][HideFanficWithNotes]', ...a); };

  const MOD_ID = 'HideFanficWithNotes';
  const DB_NAME = 'ao3h-hiddenWorksDB';
  const STORE   = 'works';

  let db;

  /* ---------------------------- CSS ---------------------------- */
  css`
    .${NS}-hide-btn{ float:right; margin-right:8px; margin-top:-24px; }
    .${NS}-hidebar{
      display:flex; align-items:center; justify-content:space-between;
      padding:5px 10px; background:#f0f0f0; border-radius:5px; margin:.4em 0;
    }
    .${NS}-hidebar .reason{ font-weight:600; }
    .${NS}-picker{
      position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
      background:#fff; border:1px solid #bbb; border-radius:10px; padding:12px;
      box-shadow:0 10px 28px rgba(0,0,0,.18); display:none; z-index:99999;
    }
    .${NS}-picker.${NS}-open{ display:block; }
    .${NS}-picker .chips{ display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
    .${NS}-picker .chip{ border:1px solid #c7c7c7; border-radius:999px; padding:4px 10px; cursor:pointer; background:#fafafa; }
  `;

  /* -------------------------- IndexedDB ------------------------- */
  function openDB(){
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

  /* -------------------------- Helpers --------------------------- */
  function workIdFromBlurb(blurb){
    const a = blurb.querySelector('.header .heading a');
    return a ? a.getAttribute('href').replace(/(#.*|\?.*)$/,'') : null;
  }

  const DEFAULT_QUICK = ['crossover','sequel','bad summary','parent/dad','unfinished','POV 1st','established'];

  async function pickReason(seed=''){
    let panel = document.getElementById(`${NS}-picker`);
    if (!panel){
      panel = document.createElement('div');
      panel.id = `${NS}-picker`; panel.className = `${NS}-picker`;
      panel.innerHTML = `
        <div><strong>Choose a tag or write a note</strong></div>
        <div class="chips"></div>
        <div><input type="text" id="${NS}-picker-input" style="width:70%"/><button id="${NS}-picker-add">Add</button></div>
        <div style="margin-top:6px"><button id="${NS}-picker-cancel">Cancel</button></div>
      `;
      document.body.appendChild(panel);
    }
    const chips = panel.querySelector('.chips');
    chips.innerHTML='';
    for (const tag of DEFAULT_QUICK){
      const chip = document.createElement('span');
      chip.className='chip'; chip.textContent=tag;
      chip.addEventListener('click',()=>finish(tag));
      chips.appendChild(chip);
    }
    const inp = panel.querySelector('#'+NS+'-picker-input');
    inp.value = seed;
    const addBtn = panel.querySelector('#'+NS+'-picker-add');
    const cancelBtn = panel.querySelector('#'+NS+'-picker-cancel');

    let resolver;
    const p = new Promise(r=>resolver=r);

    function finish(val){
      panel.classList.remove(`${NS}-open`);
      resolver(val);
    }
    addBtn.onclick=()=>finish(inp.value.trim());
    cancelBtn.onclick=()=>finish(null);

    panel.classList.add(`${NS}-open`);
    inp.focus();

    return p;
  }

  function hideWork(blurb,reason){
    if (blurb.querySelector('.'+NS+'-hidebar')) return;
    const bar = document.createElement('div');
    bar.className = `${NS}-hidebar`;
    bar.innerHTML = `<div>This work is hidden: <span class="reason">${reason}</span></div>
                     <div><button class="edit">Edit</button><button class="show">Show</button><button class="unhide">Unhide</button></div>`;
    blurb.appendChild(bar);
    Array.from(blurb.children).forEach(c=>{ if (c!==bar) c.style.display='none'; });
  }
  function showWork(blurb){
    blurb.querySelectorAll('.'+NS+'-hidebar').forEach(x=>x.remove());
    Array.from(blurb.children).forEach(c=> c.style.removeProperty('display'));
  }

  /* --------------------------- EXPORT/IMPORT --------------------------- */
  async function exportHidden(){
    if (!db) await openDB();
    const all = await getAll();
    const blob = new Blob([JSON.stringify(all,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ao3h-hidden-works.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  W.ao3hExportHiddenWorks = exportHidden;

  async function importHidden(){
    const input = document.createElement('input');
    input.type='file'; input.accept='application/json';
    input.addEventListener('change', async ()=>{
      const f=input.files[0]; if (!f) return;
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) return alert('Invalid JSON (expected array)');
      if (!db) await openDB();
      for (const rec of arr){ if (rec.workId) await put(rec); }
      alert(`Imported ${arr.length} works. Reload page to apply.`);
    },{once:true});
    input.click();
  }
  W.ao3hImportHiddenWorks = importHidden;

  /* --------------------------- MAIN INIT --------------------------- */
  async function init(){
    if (!/\/works\b/.test(location.pathname)) return;
    if (!db) await openDB();
    const all = await getAll();

    document.querySelectorAll('ol.index li.blurb').forEach(blurb=>{
      const id = workIdFromBlurb(blurb);
      if (!id) return;
      // add hide button
      if (!blurb.querySelector('.'+NS+'-hide-btn')){
        const btn = document.createElement('button');
        btn.textContent='Hide'; btn.className=`${NS}-hide-btn`;
        btn.addEventListener('click', async ()=>{
          const existing = await getOne(id);
          let reason = await pickReason(existing?.reason||'');
          if (!reason) return;
          hideWork(blurb,reason);
          await put({ workId:id, reason, isHidden:true });
        });
        blurb.querySelector('.header').appendChild(btn);
      }
      // apply persisted hides
      const rec = all.find(r=>r.workId===id);
      if (rec?.isHidden) hideWork(blurb, rec.reason);
    });

    // Delegated show/unhide/edit
    document.addEventListener('click', async e=>{
      const bar = e.target.closest?.('.'+NS+'-hidebar');
      if (!bar) return;
      const blurb = bar.closest('li.blurb');
      const id = workIdFromBlurb(blurb);
      if (e.target.classList.contains('show')){
        showWork(blurb);
      } else if (e.target.classList.contains('unhide')){
        if (!confirm('Unhide permanently?')) return;
        showWork(blurb);
        await put({ workId:id, reason:'', isHidden:false });
      } else if (e.target.classList.contains('edit')){
        const curr = bar.querySelector('.reason').textContent;
        const next = await pickReason(curr);
        if (!next) return;
        bar.querySelector('.reason').textContent=next;
        await put({ workId:id, reason:next, isHidden:true });
      }
    });
  }

  AO3H.register?.({
    id: MOD_ID,
    title: 'Hide fanfic (with notes)',
    defaultFlagKey: 'hideFanficWithNotes',

    init: async ({ enabled }) => {
      if (enabled) onReady(init);
    },
  });

})();
