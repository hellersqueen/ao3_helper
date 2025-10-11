(function (global) {
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';
  const W    = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // Stable IDs & guards
  const PANEL_ID    = `${NS}-mgr-panel`;
  const BACKDROP_ID = `${NS}-mgr-backdrop`;
  const OPEN_GUARD  = `${NS}:mgrOpen`;
  const RELOAD_KEY  = `${NS}:mgrReload`;

  // ──────────────────────────────────────────────────────────────
  // Scroll lock (unchanged behavior, with a small safety guard)
  // ──────────────────────────────────────────────────────────────
  function lockScroll() {
    if (document.body.dataset[`${NS}ScrollLocked`] === '1') return; // already locked
    document.documentElement.classList.add(`${NS}-lock`);
    document.body.classList.add(`${NS}-lock`);
    const y = window.scrollY || window.pageYOffset || 0;
    document.body.dataset[`${NS}ScrollY`] = String(y);
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.dataset[`${NS}ScrollLocked`] = '1';
  }
  function unlockScroll() {
    if (document.body.dataset[`${NS}ScrollLocked`] !== '1') return; // wasn't locked by us
    document.documentElement.classList.remove(`${NS}-lock`);
    document.body.classList.remove(`${NS}-lock`);
    const y = parseInt(document.body.dataset[`${NS}ScrollY`] || '0', 10);
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    delete document.body.dataset[`${NS}ScrollY`];
    delete document.body.dataset[`${NS}ScrollLocked`];
    window.scrollTo(0, y);
  }

  function wireOutsideToClose(pop, onClose) {
    const onDocClick = (e) => { if (!pop.contains(e.target)) { cleanup(); onClose(); } };
    const onKey = (e) => { if (e.key === 'Escape') { cleanup(); onClose(); } };
    function cleanup(){
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
    }
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    return cleanup;
  }

  // ──────────────────────────────────────────────────────────────
  // Group picker (as you had it; unchanged logic)
  // ──────────────────────────────────────────────────────────────
  async function openGroupPicker(anchorBtn, currentTag, currentGroup, getHidden, getGroupsMap, setGroupsMap, onApplied) {
    const hidden = await getHidden();
    const map = await getGroupsMap();
    const groups = [...new Set(hidden.map(t => (map[t]||'').trim()).filter(Boolean))]
      .sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));

    const pop = document.createElement('div');
    pop.className = `${NS}-gp-pop`;
    pop.innerHTML = `
      <div class="${NS}-gp-head">Groupes</div>
      <div class="${NS}-gp-list"></div>
      <input class="${NS}-gp-input" type="text" placeholder="Nouveau groupe…" value="">
      <div class="${NS}-gp-actions">
        <button class="${NS}-gp-btn apply" type="button">Appliquer</button>
        <button class="${NS}-gp-btn cancel" type="button">Fermer</button>
      </div>
    `;

    const r = anchorBtn.getBoundingClientRect();
    Object.assign(pop.style, {
      left: `${Math.round(window.scrollX + r.left)}px`,
      top:  `${Math.round(window.scrollY + r.bottom + 6)}px`,
      position: 'absolute',
      zIndex: 100001
    });

    document.body.appendChild(pop);
    const cleanup = wireOutsideToClose(pop, () => pop.remove());

    const list = pop.querySelector(`.${NS}-gp-list`);
    const input = pop.querySelector(`.${NS}-gp-input`);
    const btnApply = pop.querySelector('.apply');
    const btnCancel = pop.querySelector('.cancel');

    function itemLabel(name){ return name || '(sans groupe)'; }

    groups.forEach(name => {
      const row = document.createElement('div');
      row.className = `${NS}-gp-item`;
      row.innerHTML =
        `<span>${itemLabel(name)}</span>` +
        (name === currentGroup ? '<span>•</span>' : '');
      row.addEventListener('click', async () => {
        map[currentTag] = String(name || '').trim();
        await setGroupsMap(map);
        pop.remove(); cleanup();
        onApplied();
      });
      list.appendChild(row);
    });

    btnApply.addEventListener('click', async () => {
      const newName = String(input.value || '').trim();
      map[currentTag] = newName;
      await setGroupsMap(map);
      pop.remove(); cleanup();
      onApplied();
    });
    btnCancel.addEventListener('click', () => { pop.remove(); cleanup(); });

    input.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { btnApply.click(); } });
    input.focus();
  }

  // ──────────────────────────────────────────────────────────────
  // Hidden Tags Manager — SINGLETON implementation
  // ──────────────────────────────────────────────────────────────
  function ensureRoot() {
    // Backdrop
    let backdrop = document.getElementById(BACKDROP_ID);
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = BACKDROP_ID;
      backdrop.className = `${NS}-mgr-backdrop`;
      backdrop.style.zIndex = 100000;
      document.body.appendChild(backdrop);
    }

    // Panel
    let box = document.getElementById(PANEL_ID);
    let isNew = false;
    if (!box) {
      isNew = true;
      box = document.createElement('div');
      box.id = PANEL_ID;
      box.className = `${NS}-mgr`;
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.innerHTML = `
        <button class="${NS}-close-x" type="button" aria-label="Close" title="Close">×</button>
        <h3>AO3 Helper — Hidden Tags (Groups)</h3>
        <div class="${NS}-ul-head">
          <input class="${NS}-ul-search" type="search" placeholder="Rechercher par tag ou groupe…" />
          <span class="${NS}-ul-count">0 / 0</span>
        </div>
        <div class="${NS}-ul-actions">
          <button class="${NS}-ul-btn export"  type="button">Export JSON (tags)</button>
          <button class="${NS}-ul-btn import"  type="button">Import JSON (tags)</button>
          <button class="${NS}-ul-btn exportg" type="button" title="Export groups mapping">Export Groups</button>
          <button class="${NS}-ul-btn importg" type="button" title="Import Groups">Import Groups</button>
        </div>
        <div class="${NS}-ul-list" aria-live="polite"></div>
      `;
      box.style.zIndex = 100002; // above backdrop & picker
      document.body.appendChild(box);
    }

    // Make visible
    backdrop.style.display = '';
    box.style.display = '';

    return { backdrop, box, isNew };
  }

  async function openManager() {
    // Persisted across calls; if already open, just focus + reload.
    const { getHidden, setHidden, getGroupsMap, setGroupsMap, processList } = global.hideByTagsPersistence;

    const { backdrop, box, isNew } = ensureRoot();
    if (W[OPEN_GUARD] === true) {
      // already open: just refresh data and bring to front
      try { box.focus(); } catch {}
      if (typeof W[RELOAD_KEY] === 'function') await W[RELOAD_KEY]();
      return;
    }
    W[OPEN_GUARD] = true;
    lockScroll();

    const $search = box.querySelector(`.${NS}-ul-search`);
    const $count  = box.querySelector(`.${NS}-ul-count`);
    const $list   = box.querySelector(`.${NS}-ul-list`);

    // Close (idempotent)
    const close = () => {
      if (!W[OPEN_GUARD]) return;
      W[OPEN_GUARD] = false;
      backdrop.style.display = 'none';
      box.style.display = 'none';
      unlockScroll();
    };

    // Clean previous listeners if panel was reused
    const oldClose = box._close;
    if (typeof oldClose === 'function') {
      // remove handlers bound below if they existed (we’ll rebind)
      document.removeEventListener('keydown', box._escHandler, true);
      backdrop.removeEventListener('click', box._backdropClick, false);
      backdrop.removeEventListener('wheel', box._backdropWheel, { passive: false });
      backdrop.removeEventListener('touchmove', box._backdropTouch, { passive: false });
      box.querySelector(`.${NS}-close-x`)?.removeEventListener('click', oldClose, false);
    }

    // Fresh handlers
    box._escHandler = function esc(e){ if (e.key === 'Escape') close(); };
    box._backdropClick = () => close();
    box._backdropWheel = (e) => e.preventDefault();
    box._backdropTouch = (e) => e.preventDefault();

    document.addEventListener('keydown', box._escHandler, true);
    backdrop.addEventListener('click', box._backdropClick);
    backdrop.addEventListener('wheel',     box._backdropWheel, { passive: false });
    backdrop.addEventListener('touchmove', box._backdropTouch, { passive: false });
    box.querySelector(`.${NS}-close-x`).addEventListener('click', close);

    let searchTimer = 0;
    function onSearch(cb){ clearTimeout(searchTimer); searchTimer = setTimeout(cb,150); }

    async function reload(){
      const hidden    = await getHidden();
      const groupsMap = await getGroupsMap();
      const norm = (s)=>String(s||'').normalize('NFD').toLowerCase();
      const qn = norm($search.value||'');

      // remember expanded groups for continuity
      const expandedNow = new Set(
        Array.from($list.querySelectorAll(`.${NS}-ul-group[aria-expanded="true"]`))
          .map(el => el?.dataset?.gname || '')
          .filter(Boolean)
      );

      const filtered = hidden.filter(t =>
        !qn || norm(t).includes(qn) || norm(groupsMap[t]||'').includes(qn)
      );

      const grouped = new Map();
      for (const t of filtered) {
        const g = (groupsMap[t] || '').trim();
        const key = g ? g : 'sans groupe';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(t);
      }

      for (const [, arr] of grouped) arr.sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
      const entries = [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'}));

      const prevScrollTop = $list.scrollTop;
      $list.innerHTML = '';
      let shown = 0;

      for (const [gname, tags] of entries) {
        const block = document.createElement('div');
        block.className = `${NS}-ul-group`;
        block.dataset.gname = gname;
        const shouldBeExpanded = expandedNow.has(gname);
        block.setAttribute('aria-expanded', String(!!shouldBeExpanded));

        const head = document.createElement('div');
        head.className = `${NS}-ul-ghead`;
        head.setAttribute('role','button');
        head.setAttribute('tabindex','0');

        const chev = document.createElement('span');
        chev.className = `${NS}-ul-chevron`;
        const glabel = document.createElement('span');
        glabel.className = `${NS}-ul-glabel`;
        glabel.textContent = `${gname || ''} — ${tags.length}`;
        head.append(chev, glabel);
        block.append(head);

        const wrap = document.createElement('div');
        wrap.className = `${NS}-ul-gwrap`;
        wrap.style.maxHeight = shouldBeExpanded ? 'none' : '0px';
        wrap.style.overflow  = shouldBeExpanded ? 'visible' : 'hidden';

        for (const tag of tags) {
          const row = document.createElement('div');
          row.className = `${NS}-ul-row`;

          const label = document.createElement('span');
          label.className = `${NS}-ul-tag`;
          label.textContent = tag;

          const gbtn = document.createElement('button');
          gbtn.className = `${NS}-ul-gbtn`;
          gbtn.type = 'button';
          gbtn.title = 'Changer de groupe';
          gbtn.textContent = '📁';
          gbtn.addEventListener('click', () => {
            openGroupPicker(gbtn, tag, (groupsMap[tag]||'').trim(),
              getHidden, getGroupsMap, setGroupsMap, reload);
          });

          const del = document.createElement('button');
          del.className = `${NS}-ul-btn ${NS}-ul-del`;
          del.textContent = '🗑️';
          del.title = 'Supprimer ce tag caché';
          del.addEventListener('click', async () => {
            if (!confirm(`Delete "${tag}" from hidden list?`)) return;
            const cur = await getHidden();
            const idx = cur.indexOf(tag);
            if (idx >= 0) cur.splice(idx, 1);
            await setHidden(cur);
            const map2 = await getGroupsMap();
            if (tag in map2) { delete map2[tag]; await setGroupsMap(map2); }
            await processList();
            reload();
          });

          row.append(label, gbtn, del);
          wrap.append(row);
          shown++;
        }

        block.append(wrap);
        $list.append(block);

        function toggleGroup(){
          const expanded = block.getAttribute('aria-expanded') !== 'true';
          block.setAttribute('aria-expanded', String(expanded));
          wrap.style.maxHeight = expanded ? 'none' : '0px';
          wrap.style.overflow  = expanded ? 'visible' : 'hidden';
        }
        head.addEventListener('click', toggleGroup);
        head.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleGroup();} });
      }

      const total = (await getHidden()).length;
      $count.textContent = `${shown} / ${total}`;
      try { $list.scrollTop = prevScrollTop; } catch {}
    }

    // Save reload so subsequent opens refresh instead of duplicating UI
    W[RELOAD_KEY] = reload;

    // Search & I/O wiring (bind fresh each open; panel is singleton)
    $search.oninput = () => { clearTimeout($search._t); $search._t = setTimeout(reload, 150); };

    box.querySelector('.export').onclick = async () => {
      const list = await hideByTagsPersistence.getHidden();
      const blob = new Blob([JSON.stringify(list,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ao3h-hidden-tags.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    };

    box.querySelector('.import').onclick = async () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const incoming = JSON.parse(text);
          if (!Array.isArray(incoming)) throw new Error('Not array');
          const current = await hideByTagsPersistence.getHidden();
          const merged = Array.from(new Set(current.concat(incoming.map(s=>String(s).trim().toLowerCase())))).filter(Boolean);
          await hideByTagsPersistence.setHidden(merged);
          await hideByTagsPersistence.processList();
          reload();
          alert(`Imported ${incoming.length} tags.`);
        } catch (err) { alert('Invalid JSON: '+(err?.message||'')); }
      };
      input.click();
    };

    box.querySelector('.exportg').onclick = async () => {
      const map = await hideByTagsPersistence.getGroupsMap();
      const blob = new Blob([JSON.stringify(map,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ao3h-hidden-tags-groups.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    };

    box.querySelector('.importg').onclick = async () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json';
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const incoming = JSON.parse(text);
          if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Not object');
          const map = await hideByTagsPersistence.getGroupsMap();
          const merged = { ...map, ...incoming };
          await hideByTagsPersistence.setGroupsMap(merged);
          reload();
          alert('Imported groups mapping.');
        } catch (err) { alert('Invalid JSON: '+(err?.message||'')); }
      };
      input.click();
    };

    // Initial load + focus
    await reload();
    try { box.focus(); } catch {}
  }

  global.hideByTagsUI = { openManager };

})(window);
