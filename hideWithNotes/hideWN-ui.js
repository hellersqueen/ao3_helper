// == hideWN-ui.js ==
// Gestion de l’interface utilisateur (picker, boutons, hide/show/unhide)

(function(){
  'use strict';

  const {
    W, NS, $, getWork, putWork, getAllWorks,
    tempShow, saveTempShow, clearTempShow
  } = window.AO3HHideWithNotes;

  /* -------------------------- Quick-note picker -------------------------- */
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

    btn.addEventListener('click', async (e) => {
      const workId = window.AO3HHideWithNotes.workIdFromBlurb($blurb);
      if (!workId) return;
      try {
        const existing = await getWork(workId);
        const quick = e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;

        const blurbEl = $blurb[0];
        const barPresent = !!$blurb.find(`.${NS}-m5-hidebar`).length;
        const wasHidden = !!(existing && existing.isHidden);
        const wasTempShown = wasHidden && tempShow.has(workId);
        const visibleButShouldBeHidden = wasHidden && !barPresent;

        if (wasTempShown || visibleButShouldBeHidden || quick){
          tempShow.delete(workId); saveTempShow();
          const reason = (existing && typeof existing.reason === 'string') ? existing.reason.trim() : '';
          hideWork(blurbEl, reason);
          await putWork({ workId, reason, isHidden: true });
          return;
        }

        const seed = (existing && typeof existing.reason === 'string') ? existing.reason : '';
        let reason = await pickReasonCenteredMinimal(seed || '');
        if (reason === null) return;
        reason = String(reason).trim();
        if (!reason && !seed) return;

        tempShow.delete(workId); saveTempShow();
        hideWork(blurbEl, reason || seed || '');
        await putWork({ workId, reason: (reason || seed || ''), isHidden: true });
      } catch (err) { console.error('[AO3H] hide click failed', err); }
    });
  }

  function hideWork(blurbEl, reason) {
    const $blurb = $(blurbEl);
    if ($blurb.find(`.${NS}-m5-hidebar`).length) return;

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

    const children = Array.from(blurbEl.children);
    for (const ch of children) {
      if (ch !== bar) ch.style.display = 'none';
    }
    blurbEl.appendChild(bar);
    $blurb.find(`.${NS}-m5-hide-btn`).hide();
  }

  function showWork(blurbEl) {
    const $blurb = $(blurbEl);
    const children = Array.from(blurbEl.children);
    for (const ch of children) ch.style.display = '';
    $blurb.find(`.${NS}-m5-hidebar`).remove();
    $blurb.find(`.${NS}-m5-hide-btn`).show();
   }

  // NEW: explicit unhide implementation used by the main module's click handler
  async function unhideWork(blurbEl) {
    // purely UI: reverse what hideWork did
    showWork(blurbEl);
    // (DB update is performed by the main click handler after calling us)
  }

  Object.assign(window.AO3HHideWithNotes, {
    getUserQuickTags, pickReasonCenteredMinimal,
    ensureHideButton, hideWork, showWork,
    unhideWork // <— export so the main module finds it
  });

})();
