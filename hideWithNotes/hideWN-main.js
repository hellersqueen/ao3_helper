(function () {
  'use strict';

  const {
    W, AO3H, NS, MOD_ID, $, getAllWorks, getWork, putWork,
    openDB, tempShow, loadTempShow, saveTempShow, clearTempShow,
    transferFromLocalStorage, ensureHideButton, hideWork, showWork, observe
    // ⚠️ unhideWork intentionally NOT destructured
  } = window.AO3HHideWithNotes;

  const visibility = AO3H?.visibility || null;
  console.log('[AO3H:HideWithNotes] Main module loaded. Visibility linked:', !!visibility);

  /* ----------------------------- Import/Export ---------------------------- */
  async function exportHiddenWorks() {
    try {
      if (!window.AO3HHideWithNotes.db) await openDB();
      const all = await getAllWorks();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ao3-hidden-works-${new Date().toISOString().slice(0, 10)}.json`;
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

      if (!window.AO3HHideWithNotes.db) await openDB();

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

        if (visibility && rec.isHidden) {
          const blurb = document.querySelector(`[href*="/works/${workId}"]`)?.closest('li.blurb');
          if (blurb) visibility.hide(blurb, 'hideWithNotes');
        }
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

  // Global exports
  W.ao3hExportHiddenWorks = exportHiddenWorks;
  W.ao3hImportHiddenWorks = promptImportHiddenWorks;

  /* ----------------------- Lifecycle (initial pass) ------------------------ */
  async function initialPass() {
    const $jq = (W.jQuery || W.$);
    $jq('ol.index li.blurb').each((_, el) => ensureHideButton($jq(el)));

    const all = await getAllWorks();
    $jq('ol.index li.blurb').each((_, el) => {
      const $b = $jq(el);
      const id = window.AO3HHideWithNotes.workIdFromBlurb($b);
      const rec = all.find(r => r.workId === id);
      if (!id) return;

      if (visibility && visibility.isOverridden(el)) {
        showWork(el);
        return;
      }

      if (rec && rec.isHidden) {
        if (tempShow.has(id)) {
          showWork(el);
          if (visibility) visibility.override(el);
        } else {
          hideWork(el, rec.reason || '');
        }
      } else {
        if (visibility) visibility.unhide(el, 'hideWithNotes');
      }
    });
  }

  /* --------------------------- Event Delegates --------------------------- */
  let delegatesWired = false;
  function wireDelegatesOnce() {
    if (delegatesWired) return;
    const $doc = (W.jQuery || W.$)(document);

    // --- SHOW (temporary reveal) ---
    $doc.on('click', `.${NS}-m5-hidebar .show`, async function () {
      const $b = (W.jQuery || W.$)(this).closest('li');
      const blurbEl = $b[0];
      if (!blurbEl) return;
      const id = window.AO3HHideWithNotes.workIdFromBlurb($b);
      if (!id) return;

      showWork(blurbEl);
      tempShow.add(id);
      saveTempShow();

      if (visibility) visibility.override(blurbEl);
    });

    
   // --- UNHIDE (permanent restore) ---
$doc.on('click', `.${NS}-m5-hidebar .unhide`, async function () {
  const $b = (W.jQuery || W.$)(this).closest('li');
  const blurbEl = $b[0];
  if (!blurbEl) return;
  const id = window.AO3HHideWithNotes.workIdFromBlurb($b);
  if (!id) return;

  if (!confirm('Unhide this work permanently (until you hide it again)?')) return;

  // Robust runtime unhide
  async function tryUnhide(retries = 10) {
    const fn = window.AO3HHideWithNotes?.unhideWork;
    if (typeof fn === 'function') {
      await fn(blurbEl);
      console.log(`[AO3H:HideWithNotes] Work ${id} successfully unhidden.`);
      return true;
    }
    if (retries > 0) {
      console.warn(`[AO3H:HideWithNotes] unhideWork unavailable — retrying (${retries})…`);
      await new Promise(r => setTimeout(r, 500));
      return tryUnhide(retries - 1);
    }
    console.error('[AO3H:HideWithNotes] unhideWork permanently unavailable after retries.');
    return false;
  }

  await tryUnhide();

  tempShow.delete(id);
  saveTempShow();

  if (visibility) visibility.unhide(blurbEl, 'hideWithNotes');

  try {
    const rec = (await getWork(id)) || { workId: id, reason: '' };
    rec.isHidden = false;
    await putWork(rec);
  } catch (e) {
    console.error('[AO3H] unhide failed', e);
  }
});

    // --- EDIT REASON ---
    $doc.on('click', `.${NS}-m5-hidebar .edit-reason`, async function () {
      const $b = (W.jQuery || W.$)(this).closest('li');
      const blurbEl = $b[0];
      if (!blurbEl) return;
      const id = window.AO3HHideWithNotes.workIdFromBlurb($b);
      const $reason = (W.jQuery || W.$)(this)
        .closest(`.${NS}-m5-hidebar`)
        .find('.reason-text');
      const current = $reason.text();
      const nextPicked = await window.AO3HHideWithNotes.pickReasonCenteredMinimal(current || '');
      if (nextPicked === null) return;
      const next = String(nextPicked).trim();
      if (!next) return;
      $reason.text(next);
      try {
        const rec = (await getWork(id)) || { workId: id };
        rec.reason = next;
        rec.isHidden = true;
        await putWork(rec);

        hideWork(blurbEl, next);
      } catch (e) {
        console.error('[AO3H] edit failed', e);
      }
    });

    delegatesWired = true;
  }

  /* ---------------------------- Observer ---------------------------- */
  function observeList() {
    const root = document.querySelector('ol.index');
    if (!root || !observe) return;
    observe(root, { childList: true, subtree: true }, () => {
      const $jq = (W.jQuery || W.$);
      $jq('ol.index li.blurb').each((_, el) => ensureHideButton($jq(el)));
    });
  }

  /* ---------------------------- Init Routine ---------------------------- */
  async function init() {
    if (!W.jQuery && !W.$) {
      console.error('[AO3H] jQuery not found on page');
      return;
    }
    if (!window.AO3HHideWithNotes.db) await openDB();
    window.AO3HHideWithNotes.tempShow = loadTempShow();

    await transferFromLocalStorage();

    wireDelegatesOnce();
    await initialPass();
    observeList();

    console.log('[AO3H:HideWithNotes] Initialization complete.');
  }

  /* ---------------------------- Module Registration ---------------------------- */
  if (AO3H.modules && AO3H.modules.register) {
    AO3H.modules.register(MOD_ID, {
      title: 'Hide Fanfic (with notes)',
      enabledByDefault: true
    }, init);
  } else {
    const ready =
      (AO3H.util?.onReady) ||
      ((fn) =>
        document.readyState !== 'loading'
          ? fn()
          : document.addEventListener('DOMContentLoaded', fn));
    ready(init);
  }

  /* ---------------------------- Stop (cleanup) ---------------------------- */
  function stop() {
    clearTempShow();
  }

  Object.assign(window.AO3HHideWithNotes, {
    exportHiddenWorks,
    importHiddenWorksFromFile,
    promptImportHiddenWorks,
    init,
    stop,
  });

})();
