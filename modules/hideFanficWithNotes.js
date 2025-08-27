// modules/hideFanficWithNotes.js
;(function () {
  'use strict';

  const AO3H = window.AO3H || {};
  const { env:{ NS } = {}, util = {}, flags } = AO3H;
  const { onReady, on, css } = util || {};
  const { getFlags } = flags || {};

  if (!NS || !onReady || !on || !css || !getFlags) {
    console.error('[AO3H][HideFanficWithNotes] core not ready');
    return;
  }

  const MOD_ID  = 'HideFanficWithNotes';
  const DB_NAME = 'hiddenWorksDB';
  const STORE   = 'works';

  /* ------------------------------ Styles ------------------------------ */
  css`
    .custom-hide-button { position: relative; float: right; margin-right: 10px; top: -25px; }
    .hide { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: #f0f0f0; border-radius: 5px; }
    .hide .hideleft { width: 85%; font-size: 0.9em; line-height: 1.2em; margin-right: 10px; }
    .hide .hideright { display: flex; gap: 6px; }
    li.blurb { padding: 5px 5px; }

    /* ===== Quick-Note Picker (centered, single-click to save) ===== */
    #${NS}-m5-picker{
      position: fixed; z-index: 99999;
      min-width: 280px; max-width: 420px;
      background: #fff; border: 1px solid #d0d0d0; border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0,0,0,.18); padding: 12px; display: none;
      font: 14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#222;
      left: 50%; top: 50%; transform: translate(-50%, -50%);
    }
    #${NS}-m5-picker.${NS}-open{ display:block; }
    #${NS}-m5-picker .${NS}-m5p-title{ font-weight:600; margin-bottom:6px; }
    #${NS}-m5-picker .${NS}-m5p-chips{ display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 10px; }
    #${NS}-m5-picker .${NS}-m5p-chip{
      border:1px solid #c7c7c7; border-radius:999px; padding:4px 10px; cursor:pointer;
      user-select:none; background:#fafafa;
    }
    #${NS}-m5-picker .${NS}-m5p-row{ display:flex; gap:8px; }
    #${NS}-m5-picker input[type="text"]{
      flex:1; padding:6px 8px; border:1px solid #cfcfcf; border-radius:6px;
    }
    #${NS}-m5-picker button{
      border:1px solid #bdbdbd; background:#f6f6f6; border-radius:6px; padding:6px 10px; cursor:pointer;
    }
    #${NS}-m5-picker button:hover{ background:#efefef; }
    #${NS}-m5-picker .${NS}-m5p-hint{ font-size:12px; color:#666; margin-top:8px; }
    #${NS}-m5-picker .${NS}-bar{ display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
  `;

  /* -------------------------- IndexedDB helpers -------------------------- */
  let db;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (event) => {
        const dbx = event.target.result;
        const objectStore = dbx.createObjectStore(STORE, { keyPath: 'workId' });
        objectStore.createIndex('reason', 'reason', { unique: false });
        objectStore.createIndex('isHidden', 'isHidden', { unique: false });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }
  function getAllWorks() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(new Error('getAll failed'));
    });
  }
  function getWork(workId) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readonly');
      const req = tx.objectStore(STORE).get(workId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(new Error('get failed'));
    });
  }
  function putWork(rec) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readwrite');
      const req = tx.objectStore(STORE).put(rec);
      req.onsuccess = () => resolve(true);
      req.onerror   = () => reject(new Error('put failed'));
    });
  }

  /* ------------------------------ UI helpers ------------------------------ */
  function workIdFromBlurb(jQblurb) {
    const href = jQblurb.find('.header .heading a:first').attr('href') || '';
    return href.replace(/(#.*|\?.*)$/, ''); // normalize
  }

  // User-editable quick chips (stored in localStorage)
  const USER_QUICK_TAGS_DEFAULT = [
    'crossover', 'sequel', 'bad summary', 'parent/dad', 'unfinished',
    'growing up together', 'not sterek focused', '1rst pov', 'established', 'always-a-girl'
  ];
  const QUICK_TAGS_KEY = `${NS}:m5QuickTagsUser`;
  function getUserQuickTags(){
    try {
      const v = JSON.parse(localStorage.getItem(QUICK_TAGS_KEY) || 'null');
      if (Array.isArray(v) && v.every(x => typeof x === 'string')) return v;
    } catch {}
    return USER_QUICK_TAGS_DEFAULT;
  }

  async function m5_pickReasonCenteredMinimal(seedText = ''){
    let panel = document.getElementById(`${NS}-m5-picker`);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = `${NS}-m5-picker`;
      panel.innerHTML = `
        <div class="${NS}-m5p-title">Choose a tag or write a note</div>
        <div class="${NS}-m5p-chips"></div>
        <div class="${NS}-m5p-row">
          <input type="text" class="${NS}-m5p-input" placeholder="Write a note here…" />
          <button type="button" class="${NS}-m5p-add">Add</button>
        </div>
        <div class="${NS}-m5p-hint">Tip: click a tag to save immediately • Press Esc to cancel • Enter = Add</div>
        <div class="${NS}-bar">
          <button type="button" class="${NS}-m5p-cancel">Cancel</button>
        </div>
      `;
      document.body.appendChild(panel);
    }

    // fill chips
    const chipsWrap = panel.querySelector(`.${NS}-m5p-chips`);
    chipsWrap.innerHTML = '';
    for (const tag of getUserQuickTags()) {
      const chip = document.createElement('span');
      chip.className = `${NS}-m5p-chip`;
      chip.textContent = tag;
      chip.addEventListener('click', () => finish(tag));
      chipsWrap.appendChild(chip);
    }

    const input     = panel.querySelector(`.${NS}-m5p-input`);
    const addBtn    = panel.querySelector(`.${NS}-m5p-add`);
    const cancelBtn = panel.querySelector(`.${NS}-m5p-cancel`);

    input.value = seedText || '';

    const onAdd = () => {
      const val = (input.value || '').trim();
      if (!val) return;
      finish(val);
    };
    const onCancel = () => finish(null);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      if (e.key === 'Enter')  { e.preventDefault(); onAdd(); }
    };

    addBtn.onclick = onAdd;
    cancelBtn.onclick = onCancel;

    panel.classList.add(`${NS}-open`);
    input.focus();
    document.addEventListener('keydown', onKey, true);

    let resolver;
    const p = new Promise(r => resolver = r);
    function finish(result){
      panel.classList.remove(`${NS}-open`);
      document.removeEventListener('keydown', onKey, true);
      resolver(result);
    }
    return p;
  }

  function ensureHideButton(jQ, jQblurb) {
    if (jQblurb.find('.custom-hide-button').length) return;
    const btn = document.createElement('button');
    btn.textContent = 'Hide';
    btn.className   = 'custom-hide-button';
    jQblurb.find('.header').append(btn);

    btn.addEventListener('click', async () => {
      const workId = workIdFromBlurb(jQblurb);
      try {
        const existing = await getWork(workId);
        let reason = await m5_pickReasonCenteredMinimal(existing && existing.reason ? existing.reason : '');
        if (reason === null) return; // cancelled
        reason = String(reason).trim();
        if (!reason) return;

        hideWork(jQ, jQblurb[0], reason);
        await putWork({ workId, reason, isHidden: true });
      } catch (e) { console.error('[AO3H] hide click failed', e); }
    });
  }

  function hideWork(jQ, blurbEl, reason) {
    const jQblurb = jQ(blurbEl);
    if (jQblurb.find('.hide').length) return;
    const hideDiv = document.createElement('div');
    hideDiv.className = 'hide';
    hideDiv.innerHTML = `
      <div class="hideleft">This work is hidden: <strong class="reason-text"></strong></div>
      <div class="hideright">
        <button type="button" class="edit-reason">Edit</button>
        <button type="button" class="show">Show</button>
        <button type="button" class="unhide">Unhide</button>
      </div>`;
    hideDiv.querySelector('.reason-text').textContent = reason;
    blurbEl.appendChild(hideDiv);
    jQblurb.children(':not(.hide)').css('display', 'none');
    jQblurb.find('.custom-hide-button').hide();
  }

  function showWork(jQ, blurbEl) {
    const jQblurb = jQ(blurbEl);
    jQblurb.children(':not(.hide)').show(); // temporary reveal
    jQblurb.find('.hide').remove();
    jQblurb.find('.custom-hide-button').show();
  }

  /* ------------------------- Export / Import hooks ------------------------- */
  async function exportHiddenWorks() {
    try {
      if (!db) await openDB();
      const all  = await getAllWorks();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `ao3-hidden-works-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      alert('Exported ' + all.length + ' hidden works.');
    } catch (e) {
      console.error('[AO3H] export failed', e);
      alert('Export failed. See console for details.');
    }
  }

  async function importHiddenWorksFromFile(file) {
    try {
      const text   = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) { alert('Import failed: JSON must be an array.'); return; }
      if (!db) await openDB();

      let created = 0, updated = 0, skipped = 0;
      for (const rec of parsed) {
        if (!rec || typeof rec !== 'object') { skipped++; continue; }
        const workId = rec.workId || rec.id || rec.href;
        const reason = rec.reason ?? '';
        if (!workId) { skipped++; continue; }
        const toPut = { workId, reason, isHidden: rec.isHidden ?? true };
        const existing = await getWork(workId);
        existing ? updated++ : created++;
        await putWork(toPut);
      }

      alert(`Import complete.\nCreated: ${created}\nUpdated: ${updated}\nSkipped: ${skipped}`);
      if (confirm('Reload now to apply hides on this page?')) location.reload();
    } catch (e) {
      console.error('[AO3H] import failed', e);
      alert('Import failed. See console for details.');
    }
  }

  function promptImportHiddenWorks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) importHiddenWorksFromFile(input.files[0]);
    }, { once: true });
    input.click();
  }

  // Expose for your menu dialog (menu.js uses these)
  window.ao3hExportHiddenWorks  = exportHiddenWorks;
  window.ao3hImportHiddenWorks  = promptImportHiddenWorks;

  // Also add optional Tampermonkey context menu items
  try {
    if (typeof GM_registerMenuCommand !== 'undefined') {
      GM_registerMenuCommand('Export hidden works (JSON)', exportHiddenWorks);
      GM_registerMenuCommand('Import hidden works (JSON)', promptImportHiddenWorks);
    }
  } catch {}

  /* ----------------------- Legacy localStorage -> IDB ---------------------- */
  async function transferFromLocalStorage() {
    try {
      const legacy = JSON.parse(localStorage.getItem('ao3HiddenWorks') || '{}');
      const keys = Object.keys(legacy);
      if (!keys.length) return;
      if (!db) await openDB();
      for (const workId of keys) {
        const reason = legacy[workId];
        const existing = await getWork(workId);
        if (!existing) await putWork({ workId, reason, isHidden: true });
      }
      localStorage.removeItem('ao3HiddenWorks');
    } catch (e) { console.warn('[AO3H] legacy transfer skipped', e); }
  }

  /* --------------------------------- init --------------------------------- */
  async function init(initialFlags) {
    const enabled = !!(initialFlags && initialFlags.hideFanficWithNotes);
    if (!enabled) return;
    if (!/\/works\b/.test(location.pathname)) return;

    // AO3 / jQuery available thanks to @require
    const jQ = window.jQuery;
    if (!jQ) { console.error('[AO3H] jQuery missing'); return; }

    if (!db) await openDB();
    await transferFromLocalStorage();

    // initial pass: buttons + re-hide persisted
    const all = await getAllWorks();
    jQ('ol.index li.blurb').each((_, el) => {
      const jQb = jQ(el);
      const id  = workIdFromBlurb(jQb);
      ensureHideButton(jQ, jQb);
      const rec = all.find(r => r.workId === id);
      if (rec && rec.isHidden) hideWork(jQ, el, rec.reason);
    });

    // delegated events
    jQ(document).on('click', '.hide .show', async function () {
      const blurbEl = jQ(this).closest('li')[0];
      const jQb = jQ(blurbEl);
      const id  = workIdFromBlurb(jQb);
      showWork(jQ, blurbEl); // temporary reveal; DB unchanged
      try { await getWork(id); } catch (e) { console.error('[AO3H] show failed', e); }
    });

    jQ(document).on('click', '.hide .unhide', async function () {
      const blurbEl = jQ(this).closest('li')[0];
      const jQb = jQ(blurbEl);
      const id  = workIdFromBlurb(jQb);
      if (!confirm('Unhide this work permanently (until you hide it again)?')) return;
      showWork(jQ, blurbEl);
      try {
        const rec = (await getWork(id)) || { workId: id };
        rec.isHidden = false;
        await putWork(rec);
      } catch (e) { console.error('[AO3H] unhide failed', e); }
    });

    jQ(document).on('click', '.edit-reason', async function () {
      const blurbEl  = jQ(this).closest('li')[0];
      const jQb      = jQ(blurbEl);
      const id       = workIdFromBlurb(jQb);
      const jQreason = jQ(this).closest('.hide').find('.reason-text');
      const current  = jQreason.text();
      const nextPicked = await m5_pickReasonCenteredMinimal(current || '');
      if (nextPicked === null) return; // cancelled
      const next = String(nextPicked).trim();
      if (!next) return;
      jQreason.text(next);
      try {
        const rec = (await getWork(id)) || { workId: id };
        rec.reason = next;
        rec.isHidden = true;
        await putWork(rec);
      } catch (e) { console.error('[AO3H] edit failed', e); }
    });
  }

  /* ----------------------- Register in module registry --------------------- */
  AO3H.modules = AO3H.modules || {};
  AO3H.modules[MOD_ID] = { id: MOD_ID, title: 'Hide Fanfic (with notes)', init };
})();
