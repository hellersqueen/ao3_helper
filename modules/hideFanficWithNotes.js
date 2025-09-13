;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, observe, css } = (AO3H.util || {});

  const MOD_ID   = 'HideFanficWithNotes';

  const DB_NAME = 'ao3h-hiddenWorksDB';
  const STORE   = 'works';

  /* ------------------------------- Styles -------------------------------- */
 if (css) css`
  /* Hide bar attached inside a blurb (unique class to avoid collisions) */
  .${NS}-m5-hidebar{
    display:flex; align-items:center; justify-content:space-between;
    gap:10px;
    padding:6px 10px; background:#f5f6f8; border:1px solid #d7dbe3; border-radius:8px;
    margin:.5em 0;
    font:14px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color:#1b2430;
  }
  .${NS}-m5-hidebar .left{
    display:flex; gap:.5em; align-items:center; min-width:0;
  }
  .${NS}-m5-hidebar .label{ opacity:.8 }
  .${NS}-m5-hidebar .reason-text{
    font-weight:600;
    white-space:normal;       /* allow wrapping */
    overflow:visible;         /* no clipping */
    text-overflow:unset;      /* no ellipsis */
    max-width:none;           /* no fixed width */
    overflow-wrap:anywhere;   /* break long words/URLs if needed */
    word-break:break-word;
  }

  .${NS}-m5-hidebar .right{ display:flex; gap:6px }
  .${NS}-m5-btn{
    border:1px solid #cfd6e2; background:#fff; border-radius:6px; padding:4px 8px; cursor:pointer;
  }
  .${NS}-m5-btn:hover{ background:#f1f5fb }

  /* The "Hide" trigger button near the blurb header */
  .${NS}-m5-hide-btn{
    float:right; margin-right:8px; margin-top:-24px;
    border:1px solid #cfd6e2; background:#fff; border-radius:6px; padding:2px 8px; cursor:pointer;
    font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  }
  .${NS}-m5-hide-btn:hover{ background:#f1f5fb }

  /* ===== Centered minimal picker ===== */
  .${NS}-m5-picker{
    position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
    background:#fff; border:1px solid #cfd6e2; border-radius:12px; padding:14px;
    box-shadow:0 18px 48px rgba(0,0,0,.18); display:none; z-index:99999; width:min(520px,92vw);
    font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color:#0f172a;
  }
  .${NS}-m5-picker.${NS}-open{ display:block; }

  .${NS}-m5p-title{ font-weight:700; }
  .${NS}-m5p-chips{ display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
  .${NS}-m5p-chip{
    border:1px solid #c7cbd3; border-radius:999px; padding:4px 10px; cursor:pointer; background:#f8fafc;
  }
  .${NS}-m5p-chip:hover{ background:#eef2f8 }
  .${NS}-m5p-row{ display:flex; gap:8px; }
  .${NS}-m5p-input{ flex:1; padding:6px 8px; border:1px solid #cfd6e2; border-radius:6px; }
  .${NS}-m5p-add, .${NS}-m5p-cancel{
    border:1px solid #cfd6e2; background:#f6f8fb; border-radius:6px; padding:6px 10px; cursor:pointer;
  }
  .${NS}-m5p-add:hover, .${NS}-m5p-cancel:hover{ background:#eef2f8 }
  .${NS}-m5p-hint{ opacity:.7; font-size:12px; margin-top:8px }
  .${NS}-m5p-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:10px }
`;

  /* ----------------------------- IndexedDB ------------------------------- */
  let db;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (event) => {
        const dbx = event.target.result;
        if (!dbx.objectStoreNames.contains(STORE)) {
          const objectStore = dbx.createObjectStore(STORE, { keyPath: 'workId' });
          objectStore.createIndex('reason', 'reason', { unique: false });
          objectStore.createIndex('isHidden', 'isHidden', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        db = e.target.result;
        db.onversionchange = () => { try { db.close(); } catch {} };
        resolve(db);
      };
      req.onerror = (e) => reject(e.target.error);
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

  /* ----------------------------- TEMP-SHOW ------------------------------- */
  // Per-path allowlist of works temporarily revealed (so Hide can instantly re-hide with the saved note).
  let tempShow = new Set();
  const tempKey = () => `${NS}:m5:tempShow:${location.pathname}`;
  function loadTempShow(){
    try{
      const raw = sessionStorage.getItem(tempKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    }catch{ return new Set(); }
  }
  function saveTempShow(){
    try{ sessionStorage.setItem(tempKey(), JSON.stringify([...tempShow])); }catch{}
  }
  function clearTempShow(){
    tempShow.clear();
    try{ sessionStorage.removeItem(tempKey()); }catch{}
  }

  /* ----------------------------- Utilities -------------------------------- */
  // jQuery is available on AO3; use the page copy.
  function $(sel, root){ return (W.jQuery || W.$)(sel, root); }

  function workIdFromBlurb($blurb) {
    // Prefer the first heading link with /works/ID; normalize to path-only without query/hash
    const a = $blurb.find('.header .heading a[href*="/works/"]').first();
    const href = (a.attr('href') || '').replace(/(#.*|\?.*)$/, '');
    // If not found, fallback to any anchor with /works/
    return href || ($blurb.find('a[href*="/works/"]').first().attr('href') || '').replace(/(#.*|\?.*)$/, '');
  }

  /* --------------------------- Quick-note picker -------------------------- */
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

  async function pickReasonCenteredMinimal(seed=''){
    let panel = document.getElementById(`${NS}-m5-picker`);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = `${NS}-m5-picker`;
      panel.className = `${NS}-m5-picker`;
      panel.innerHTML = `
        <div class="${NS}-m5p-title">Choose a tag or write a note</div>
        <div class="${NS}-m5p-chips"></div>
        <div class="${NS}-m5p-row">
          <input type="text" class="${NS}-m5p-input" placeholder="Write a note here…" />
          <button type="button" class="${NS}-m5p-add">Add</button>
        </div>
        <div class="${NS}-m5p-hint">Tip: click a tag to save immediately • Press Esc to cancel • Enter = Add</div>
        <div class="${NS}-m5p-actions">
          <button type="button" class="${NS}-m5p-cancel">Cancel</button>
        </div>
      `;
      document.body.appendChild(panel);
    }

    // Populate chips
    const chipsWrap = panel.querySelector(`.${NS}-m5p-chips`);
    chipsWrap.innerHTML = '';
    for (const tag of getUserQuickTags()) {
      const chip = document.createElement('span');
      chip.className = `${NS}-m5p-chip`;
      chip.textContent = tag;
      chip.addEventListener('click', () => finish(tag)); // instant save
      chipsWrap.appendChild(chip);
    }

    const input     = panel.querySelector(`.${NS}-m5p-input`);
    const addBtn    = panel.querySelector(`.${NS}-m5p-add`);
    const cancelBtn = panel.querySelector(`.${NS}-m5p-cancel`);

    input.value = seed || '';

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

    // show & focus
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

  /* -------------------------- Blurb UI helpers ---------------------------- */
  function ensureHideButton($blurb) {
    if ($blurb.find(`.${NS}-m5-hide-btn`).length) return;
    const $header = $blurb.find('.header').first();
    if (!$header.length) return;

    const btn = document.createElement('button');
    btn.textContent = 'Hide';
    btn.type = 'button';
    btn.className = `${NS}-m5-hide-btn`;
    $header.append(btn);

    // ===== Auto-restore prior note on Hide if one exists, and support temp-show rehide =====
    btn.addEventListener('click', async (e) => {
      const workId = workIdFromBlurb($blurb);
      if (!workId) return;
      try {
        const existing = await getWork(workId);

        // quick toggle: any modifier skips the picker (uses stored note if available)
        const quick = e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;

        const blurbEl = $blurb[0];
        const barPresent = !!$blurb.find(`.${NS}-m5-hidebar`).length;

        const wasHidden = !!(existing && existing.isHidden);
        const wasTempShown = wasHidden && tempShow.has(workId);
        const visibleButShouldBeHidden = wasHidden && !barPresent;

        // Case A: re-hide without picker (temp show or visible-but-should-be-hidden)
        if (wasTempShown || visibleButShouldBeHidden || quick){
          tempShow.delete(workId); saveTempShow();
          const reason = (existing && typeof existing.reason === 'string') ? existing.reason.trim() : '';
          hideWork(blurbEl, reason);
          await putWork({ workId, reason, isHidden: true });
          return;
        }

        // Case B: first-time hide OR editing note via picker
        const seed = (existing && typeof existing.reason === 'string') ? existing.reason : '';
        let reason = await pickReasonCenteredMinimal(seed || '');
        if (reason === null) return; // cancelled
        reason = String(reason).trim();
        if (!reason && !seed) return; // nothing chosen on first-time

        tempShow.delete(workId); saveTempShow();
        hideWork(blurbEl, reason || seed || '');
        await putWork({ workId, reason: (reason || seed || ''), isHidden: true });
      } catch (err) { console.error('[AO3H] hide click failed', err); }
    });
  }

  function hideWork(blurbEl, reason) {
    const $blurb = $(blurbEl);
    if ($blurb.find(`.${NS}-m5-hidebar`).length) return;

    // Build bar
    const bar = document.createElement('div');
    bar.className = `${NS}-m5-hidebar`;
    bar.innerHTML = `
      <div class="left">
        <span class="label">Hidden:</span>
        <span class="reason-text"></span>
      </div>
      <div class="right">
        <button type="button" class="${NS}-m5-btn edit-reason">Edit</button>
        <button type="button" class="${NS}-m5-btn show">Show</button>
        <button type="button" class="${NS}-m5-btn unhide">Unhide</button>
      </div>
    `;
    bar.querySelector('.reason-text').textContent = reason || '';

    // Hide original blurb content (except our bar)
    const children = Array.from(blurbEl.children);
    for (const ch of children) {
      if (ch !== bar) ch.style.display = 'none';
    }
    blurbEl.appendChild(bar);

    // Also hide the Hide button itself while hidden
    $blurb.find(`.${NS}-m5-hide-btn`).hide();
  }

  function showWork(blurbEl) {
    const $blurb = $(blurbEl);
    // Reveal original content
    const children = Array.from(blurbEl.children);
    for (const ch of children) ch.style.display = '';
    // Remove our bar
    $blurb.find(`.${NS}-m5-hidebar`).remove();
    // Re-show the Hide button
    $blurb.find(`.${NS}-m5-hide-btn`).show();
  }

  /* ----------------------------- Import/Export ---------------------------- */
  async function exportHiddenWorks() {
    try {
      if (!db) await openDB();
      const all = await getAllWorks();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
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
  W.ao3hExportHiddenWorks = exportHiddenWorks;

  async function importHiddenWorksFromFile(file) {
    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        alert('Import failed: invalid JSON file.');
        return;
      }

      if (!Array.isArray(parsed)) {
        alert('Import failed: JSON must be an array.');
        return;
      }

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

  W.ao3hImportHiddenWorks = promptImportHiddenWorks;

  /* ------------------------------- Lifecycle ------------------------------ */
  // Legacy migration: localStorage -> IndexedDB (ignore malformed values gracefully)
  async function transferFromLocalStorage() {
    try {
      const raw = localStorage.getItem('ao3HiddenWorks');
      if (!raw) return;
      let legacy = {};
      try {
        legacy = JSON.parse(raw);
      } catch {
        // Handle accidental "[object Object]" or other junk without throwing UI errors
        console.warn('[AO3H] legacy store invalid JSON; skipping migration');
        localStorage.removeItem('ao3HiddenWorks');
        return;
      }
      const keys = Object.keys(legacy || {});
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

  async function initialPass() {
    const $ = (W.jQuery || W.$);
    $('ol.index li.blurb').each((_, el) => {
      const $b = $(el);
      ensureHideButton($b);
    });

    // Re-apply persisted hidden state (skip re-hiding items currently temp-shown)
    const all = await getAllWorks();
    $('ol.index li.blurb').each((_, el) => {
      const $b = $(el);
      const id = workIdFromBlurb($b);
      const rec = all.find(r => r.workId === id);
      if (rec && rec.isHidden) {
        if (tempShow.has(id)) {
          showWork(el); // keep it shown temporarily
        } else {
          hideWork(el, rec.reason || '');
        }
      }
    });
  }

  // Delegated events (one-time wire)
  let delegatesWired = false;
  function wireDelegatesOnce(){
    if (delegatesWired) return;
    const $doc = (W.jQuery || W.$)(document);

    // SHOW = temporary reveal (DB unchanged, mark in tempShow)
    $doc.on('click', `.${NS}-m5-hidebar .show`, async function () {
      const $b = (W.jQuery || W.$)(this).closest('li');
      const blurbEl = $b[0];
      if (!blurbEl) return;
      const id = workIdFromBlurb($b);
      if (!id) return;
      showWork(blurbEl);
      tempShow.add(id); saveTempShow();
    });

    // UNHIDE = permanent (set isHidden=false but keep the note)
    $doc.on('click', `.${NS}-m5-hidebar .unhide`, async function () {
      const $b = (W.jQuery || W.$)(this).closest('li');
      const blurbEl = $b[0];
      if (!blurbEl) return;
      const id = workIdFromBlurb($b);
      if (!id) return;
      if (!confirm('Unhide this work permanently (until you hide it again)?')) return;
      showWork(blurbEl);
      tempShow.delete(id); saveTempShow();
      try {
        const rec = (await getWork(id)) || { workId: id, reason: '' };
        rec.isHidden = false;
        await putWork(rec);
      } catch (e) { console.error('[AO3H] unhide failed', e); }
    });

    // EDIT = update reason and keep hidden
    $doc.on('click', `.${NS}-m5-hidebar .edit-reason`, async function () {
      const $b = (W.jQuery || W.$)(this).closest('li');
      const blurbEl = $b[0];
      if (!blurbEl) return;
      const id = workIdFromBlurb($b);
      const $reason = (W.jQuery || W.$)(this).closest(`.${NS}-m5-hidebar`).find('.reason-text');
      const current = $reason.text();
      const nextPicked = await pickReasonCenteredMinimal(current || '');
      if (nextPicked === null) return; // cancelled
      const next = String(nextPicked).trim();
      if (!next) return;
      $reason.text(next);
      try {
        const rec = (await getWork(id)) || { workId: id };
        rec.reason = next;
        rec.isHidden = true;
        await putWork(rec);
      } catch (e) { console.error('[AO3H] edit failed', e); }
    });

    delegatesWired = true;
  }

  // Auto-observe list updates (AJAX pagination, filters, etc.)
  function observeList(){
    const root = document.querySelector('ol.index');
    if (!root || !observe) return;
    observe(root, { childList:true, subtree:true }, () => {
      const $ = (W.jQuery || W.$);
      $('ol.index li.blurb').each((_, el) => ensureHideButton($(el)));
    });
  }

  async function init() {
    // Light route guard; keep if desired
    // if (!/\/works\b/.test(location.pathname)) return;
    if (!W.jQuery && !W.$) { console.error('[AO3H] jQuery not found on page'); return; }

    if (!db) await openDB();
    tempShow = loadTempShow();

    await transferFromLocalStorage();

    wireDelegatesOnce();
    await initialPass();
    observeList();
  }

  // Register for AO3H (if present) or run standalone on ready
  if (AO3H.modules && AO3H.modules.register) {
    AO3H.modules.register(MOD_ID, { title: 'Hide Fanfic (with notes)', enabledByDefault: true }, init);
  } else {
    // Fallback: run immediately when DOM is ready
    const ready = onReady || ((fn)=>document.readyState!=='loading'?fn():document.addEventListener('DOMContentLoaded',fn));
    ready(init);
  }

  // Optional cleanup hook if you wire enable/disable later
  function stop(){
    clearTempShow();
  }

})();
