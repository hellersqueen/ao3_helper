// modules/hideByTags.js
;(function () {
  'use strict';

  const AO3H = window.AO3H || {};
  const { env:{ NS } = {}, util = {}, store: Storage, flags } = AO3H;
  const { onReady, $, $$, on, debounce, observe, css } = util || {};
  const { getFlags } = flags || {};
  if (!NS || !onReady || !$ || !$$ || !on || !debounce || !observe || !css || !Storage || !getFlags) {
    console.error('[AO3H][HideByTags] core not ready'); return;
  }

  const MOD_ID = 'HideByTags';

  let enabled = false;
  let delegatesAttached = false;
  let observerActive = false;

  // ---- storage keys ----
  const LS_MIRROR = true;
  const LS_KEY = `${NS}:hideTags`;
  const TM_KEY = 'hideTags';

  // Group map (tag -> group)
  const LS_KEY_GROUPS = `${NS}:hideTagsGroups`;
  const TM_KEY_GROUPS = 'hideTagsGroups';

  // Collapsed state for groups (Manager UI)
  const LS_KEY_COLLAPSED = `${NS}:hideTagsGroupsCollapsed`;
  function getCollapsedSet(){
    try{
      const raw = localStorage.getItem(LS_KEY_COLLAPSED) || '[]';
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    }catch{ return new Set(); }
  }
  function setCollapsedSet(set){
    try{ localStorage.setItem(LS_KEY_COLLAPSED, JSON.stringify([...set])); }catch{}
  }

  // ---- helpers ----
  function canonicalFromAnchor(a){
    try{
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/tags\/([^/]+)/);
      if (!m) return null;

      let s = decodeURIComponent(m[1]).replace(/\+/g, ' ');
      s = s.replace(/\*a\*/gi, '&').replace(/\*s\*/gi, '/');
      return s.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim().toLowerCase();
    }catch{ return null; }
  }
  const toNorm = (s)=> (s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();

  async function getHidden(){
    let list = (await Storage.get(TM_KEY, [])) || [];
    if ((!list || !list.length) && LS_MIRROR){
      try{
        const fromLS = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        if (Array.isArray(fromLS) && fromLS.length) list = fromLS;
      }catch{}
    }
    return list;
  }
  async function setHidden(arr){
    const cleaned = Array.from(new Set(arr.map(s => String(s).trim().toLowerCase()).filter(Boolean)));
    await Storage.set(TM_KEY, cleaned);
    if (LS_MIRROR){
      try{ localStorage.setItem(LS_KEY, JSON.stringify(cleaned)); }catch{}
    }
    return cleaned;
  }
  async function addHiddenTag(canon){
    const cur = await getHidden();
    if (!cur.includes(canon)){
      cur.push(canon);
      await setHidden(cur);
    }
  }

  // Groups map: { tag: groupName }
  async function getGroupsMap(){
    let map = (await Storage.get(TM_KEY_GROUPS, {})) || {};
    if ((!map || !Object.keys(map).length) && LS_MIRROR){
      try{
        const fromLS = JSON.parse(localStorage.getItem(LS_KEY_GROUPS) || '{}');
        if (fromLS && typeof fromLS === 'object') map = fromLS;
      }catch{}
    }
    const cleaned = {};
    for (const [k,v] of Object.entries(map)) {
      if (!k) continue;
      cleaned[String(k).toLowerCase()] = String(v||'').trim();
    }
    return cleaned;
  }
  async function setGroupsMap(map){
    const hidden = await getHidden();
    const setHiddenTags = new Set(hidden);
    const cleaned = {};
    for (const [k,v] of Object.entries(map||{})) {
      const key = String(k).toLowerCase();
      if (setHiddenTags.has(key)) cleaned[key] = String(v||'').trim();
    }
    await Storage.set(TM_KEY_GROUPS, cleaned);
    if (LS_MIRROR){
      try{ localStorage.setItem(LS_KEY_GROUPS, JSON.stringify(cleaned)); }catch{}
    }
    return cleaned;
  }

  // ---- selectors ----
  function getWorkBlurbs(root=document){
    const a = $$('#main .work.blurb.group, #main .work.blurb, #main .bookmark.blurb.group, #main .blurb.group, #main .blurb', root);
    const b = Array.from(root.querySelectorAll('li.blurb'));
    return Array.from(new Set([...a, ...b]));
  }
  const getTagLinks = scope => $$('a.tag', scope);

  // ---- matching ----
  function reasonsFor(scope, hiddenList){
    const canon = getTagLinks(scope).map(canonicalFromAnchor).filter(Boolean);
    return canon.filter(t => hiddenList.includes(t));
  }

  // ---- styles (fold/cut + inline icon + Manager panel + toast + commas) ----
  css`
/* ===================== FOLD / CUT ===================== */
.${NS}-fold { position: relative; display:flex !important; align-items:center; gap:.5rem;
  justify-content:flex-start; width:98%; min-height:14px; padding:.65rem .8rem;
  border:1px dashed #bdbdbd; border-radius:8px; background:#fee9e9; font-size:.75rem; color:#333;
  cursor:pointer; user-select:none; touch-action:manipulation; }
.${NS}-fold * { pointer-events:none; }
.${NS}-fold:hover { background:#f1f3f7; }
.${NS}-fold:focus { outline:2px solid #7aa7ff; outline-offset:2px; }
.${NS}-note { font-weight:600; }
.${NS}-reason { margin-left:4px; opacity:.85; }
.${NS}-hint { margin-left:auto; font-size:.85em; opacity:.7; }
.${NS}-cut { display:none; }
.${NS}-fold[aria-expanded="true"] + .${NS}-cut { display:block; }
.${NS}-fold[aria-expanded="true"] { position:sticky; top:0; z-index:100; margin-top:0; margin-bottom:8px;
  padding:.35rem .6rem; background:#fffbe6; border:1px solid #e6d28a; border-bottom:1px dashed #bdbdbd;
  border-radius:8px; opacity:.95; }
.${NS}-force-show { display:list-item !important; }

/* ===================== INLINE HIDE ICON ===================== */
a.tag.${NS}-tag-wrap{ position:relative; padding-right:0; overflow:visible; transition:padding-right .12s; }
a.tag.${NS}-tag-wrap:hover,
a.tag.${NS}-tag-wrap:focus-visible,
ul.commas li:hover > a.tag.${NS}-tag-wrap,
ol.commas li:hover > a.tag.${NS}-tag-wrap,
.commas   li:hover > a.tag.${NS}-tag-wrap{ padding-right:1.4em; }
.${NS}-hide-ico{ position:absolute; right:.2em; top:50%; transform:translateY(-50%); width:1em; height:1em; line-height:1em;
  text-align:center; font-size:.9em; border:1px solid #bbb; border-radius:50%; background:#fff; opacity:0; pointer-events:none;
  transition:opacity .15s, transform .15s; z-index:2; }
a.tag.${NS}-tag-wrap:hover .${NS}-hide-ico,
a.tag.${NS}-tag-wrap:focus-visible .${NS}-hide-ico{ opacity:1; pointer-events:auto; }
.${NS}-hide-ico:hover{ transform: translateY(-50%) scale(1.06); }

/* Keep commas attached to the tag text */
ul.commas li, ol.commas li, .commas li{ white-space:nowrap; }

/* Scale tag text (and AO3 commas) a bit */
ul.commas li > a.tag.${NS}-tag-wrap,
ol.commas li > a.tag.${NS}-tag-wrap,
.commas   li > a.tag.${NS}-tag-wrap{ font-size:0.92em; line-height:1.15; }
ul.commas li::after, ol.commas li::after, .commas li::after{ font-size:0.92em; }

/* Optional: icon follows tag size */
a.tag.${NS}-tag-wrap .${NS}-hide-ico{ font-size:0.9em; }

/* ===================== MANAGER PANEL (ULTRA-LIGHT) ===================== */
.${NS}-mgr-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:999998; }
.${NS}-mgr{ position:fixed; top:10vh; left:50%; transform:translateX(-50%); background:#fff; color:#000;
  border:1px solid #e5e7eb; border-radius:12px; padding:10px; z-index:999999; box-shadow:0 16px 40px rgba(2,15,35,.12);
  font:12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; display:grid; gap:8px; max-height:82vh; overflow:auto; }
.${NS}-mgr h3{ margin:.2rem 0 .4rem; font-size:1rem; }
.${NS}-ul-head{ display:grid; grid-template-columns:1fr auto; gap:6px; align-items:center; }
.${NS}-ul-search{ border-radius:8px; border:1px solid #cfd6e4; background:#fff; padding:6px 10px; font-size:12px; }
.${NS}-ul-count{ font-weight:600; font-size:12px; color:#4b5563; }
.${NS}-ul-actions{ display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
.${NS}-ul-btn{ height:28px; padding:0 10px; border-radius:8px; border:1px solid #cfd6e4; background:#f5f7fb; font-size:12px; cursor:pointer;
  transition: background .15s, transform .12s, border-color .15s; }
.${NS}-ul-btn:hover{ background:#ecf1f8; border-color:#b8c3d8; transform: translateY(-1px); }
.${NS}-ul-list{ display:grid; gap:8px; max-height:none; overflow:visible; padding-right:2px; }

/* ===================== EXPANDABLE GROUPS ===================== */
.${NS}-ul-group{ border:1px solid #e6e8ee; background:#fff; border-radius:10px; margin-bottom:8px; display:flex; flex-direction:column; min-height:25px; }
.${NS}-ul-ghead{ display:inline; align-items:center; gap:8px; height:25px; padding:0 8px; background:transparent; border:none; cursor:pointer; user-select:none; }
.${NS}-ul-ghead:hover{ background: rgba(0,0,0,.04); }
.${NS}-ul-ghead:focus-visible{ outline:2px solid #7aa7ff; outline-offset:2px; }
.${NS}-ul-chevron{ display:inline-block; width:10px; min-width:10px; height:10px; transform-origin:50% 50%; transition: transform .18s ease; margin-left:10px; }
.${NS}-ul-group[aria-expanded="true"] .${NS}-ul-chevron{ transform: rotate(90deg); }
.${NS}-ul-glabel{ font-weight:650; font-size:12px; color:#1f2937; line-height:25px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:-8px; margin-left:-15px; }
.${NS}-ul-gwrap{ overflow:hidden; max-height:0; transition:max-height .22s ease, padding-top .22s ease, margin-top .22s ease, border-color .22s ease; display:grid; gap:6px; }
.${NS}-ul-group[aria-expanded="true"] .${NS}-ul-gwrap{ max-height:1200px; border-top:1px dashed #e7ebf5; }
.${NS}-ul-row{ display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:8px; padding:6px 8px; border:1px dashed transparent; border-radius:8px; transition: background .12s, border-color .12s; }
.${NS}-ul-row:hover{ background:#fafbfe; border-color:#e7ebf5; }
.${NS}-ul-tag{ display:inline-block; max-width:100%; padding:4px 10px; border-radius:999px; background:#f6f7fb; border:1px solid #dfe4f0; font-size:13px; font-weight:500; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.${NS}-ul-gbtn, .${NS}-ul-del{ display:flex; align-items:center; justify-content:center; height:26px; min-width:30px; padding:0 10px; border:1px solid #cfd6e4; border-radius:8px; background:#f5f7fb; font-size:12px; cursor:pointer; transition: background .15s, transform .12s, border-color .15s; }
.${NS}-ul-gbtn:hover, .${NS}-ul-del:hover{ background:#ecf1f8; border-color:#b8c3d8; transform: translateY(-1px); }
.${NS}-ul-gbtn:focus-visible, .${NS}-ul-del:focus-visible{ outline:2px solid #7aa7ff; outline-offset:2px; }
.${NS}-ul-del{ background:#fff6f6; border-color:#f2c9c9; }
.${NS}-ul-del:hover{ background:#ffecec; border-color:#e9b3b3; }

/* ===================== TOAST ===================== */
.${NS}-toast{ position:fixed; bottom:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.75); color:#fff;
  padding:6px 10px; border-radius:10px; font-size:11px; z-index:999999; opacity:0; transition:opacity .15s ease; pointer-events:none; }

/* ===================== MINI GROUP PICKER ===================== */
.${NS}-gp-pop{ position:absolute; z-index:1000000; min-width:180px; max-width:260px; max-height:50vh; overflow:auto; background:#fff;
  border:1px solid #bbb; border-radius:8px; box-shadow:0 6px 16px rgba(0,0,0,.2); padding:6px; font:12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
.${NS}-gp-head{ font-weight:600; margin-bottom:4px; text-align:center; }
.${NS}-gp-list{ display:grid; gap:4px; }
.${NS}-gp-item{ display:flex; align-items:center; justify-content:space-between; padding:4px 6px; border:1px solid #ddd; border-radius:6px; cursor:pointer; }
.${NS}-gp-item:hover{ background:#f4f6f9; }
.${NS}-gp-input{ width:100%; margin-top:6px; padding:6px 8px; border:1px solid #bbb; border-radius:6px; }
.${NS}-gp-actions{ display:flex; gap:6px; justify-content:flex-end; margin-top:6px; }
.${NS}-gp-btn{ padding:3px 6px; border:1px solid #bbb; border-radius:6px; background:#f3f4f6; cursor:pointer; font-size:11px; }
.${NS}-gp-btn:hover{ background:#e9ecf0; }

/* ===================== RESPONSIVE ===================== */
@media (max-width: 720px){
  .${NS}-ul-head { grid-template-columns: 1fr; }
  .${NS}-ul-actions { justify-content:flex-start; }
}

/* AO3 commas we manage ourselves (turn off default comma)::after only where we mark it */
.${NS}-own-commas li::after { content: "" !important; }
a.tag.${NS}-tag-wrap .${NS}-tag-comma { text-decoration:none; margin-right:.35em; }
  `;

  // UI helpers
  function updateFoldContent(fold, reasons, isExpanded){
    fold.innerHTML = '';
    const note = document.createElement('span');
    note.className = `${NS}-note`;
    note.textContent = isExpanded ? 'ℹ️ This work was hidden.' : 'This work is hidden';

    const why = document.createElement('span');
    why.className = `${NS}-reason`;
    const addText = (el, txt) => el.appendChild(document.createTextNode(txt));

    if (reasons.length) {
      addText(why, ' — (Reason: tags include ');
      reasons.forEach((t, i) => {
        const strong = document.createElement('strong');
        strong.textContent = t + (i < reasons.length - 1 ? ',' : '');
        why.appendChild(strong);
        if (i < reasons.length - 1) why.appendChild(document.createTextNode(' '));
      });
      addText(why, '.)');
    }

    const hint = document.createElement('span');
    hint.className = `${NS}-hint`;
    hint.textContent = isExpanded ? 'Click to hide' : 'Click to show';

    fold.dataset.reasons = reasons.join('|');
    fold.setAttribute('aria-expanded', String(!!isExpanded));
    fold.append(note, document.createTextNode(' '), why, hint);
  }

  function forceShow(el){
    try{
      el.hidden = false;
      el.style && el.style.removeProperty && el.style.removeProperty('display');
      el.classList.add(`${NS}-force-show`);
    }catch{}
  }

  function ensureWrapped(blurb){
    if (blurb.classList.contains(`${NS}-wrapped`)){
      return { fold: blurb.querySelector(`.${NS}-fold`), cut : blurb.querySelector(`.${NS}-cut`) };
    }
    blurb.classList.add(`${NS}-wrapped`);
    forceShow(blurb);

    const cut = document.createElement('div');
    cut.className = `${NS}-cut`;
    while (blurb.firstChild){ cut.appendChild(blurb.firstChild); }
    blurb.appendChild(cut);

    const fold = document.createElement('div');
    fold.className = `${NS}-fold`;
    fold.setAttribute('role','button');
    fold.setAttribute('tabindex','0');
    fold.setAttribute('aria-expanded','false');
    blurb.insertBefore(fold, cut);

    const doToggle = () => {
      const nowExpanded = fold.getAttribute('aria-expanded') !== 'true';
      fold.setAttribute('aria-expanded', String(nowExpanded));
      const reasons = (fold.dataset.reasons || '').split('|').filter(Boolean);
      updateFoldContent(fold, reasons, nowExpanded);
    };
    fold.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); doToggle(); });
    fold.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(); } });

    return { fold, cut };
  }

  function wrapWork(blurb, reasons){
    const { fold } = ensureWrapped(blurb);
    const isExpanded = fold.getAttribute('aria-expanded') === 'true';
    updateFoldContent(fold, reasons, isExpanded);
    forceShow(blurb);
  }
  function unwrapWork(blurb){
    const fold = blurb.querySelector(`.${NS}-fold`);
    const cut = blurb.querySelector(`.${NS}-cut`);
    blurb.classList.remove(`${NS}-wrapped`, `${NS}-force-show`);
    if (fold) fold.remove();
    if (cut){
      while (cut.firstChild){ blurb.insertBefore(cut.firstChild, cut); }
      cut.remove();
    }
    blurb.hidden = false;
    blurb.style && blurb.style.removeProperty && blurb.style.removeProperty('display');
  }

  // Inline icons & commas
  function ensureInlineIcons(root=document){
    const scopes = getWorkBlurbs(root);
    if (scopes.length === 0) {
      const fallback = document.querySelector('#workskin') || document.querySelector('#main') || document;
      scopes.push(fallback);
    }
    scopes.forEach(ensureInlineIconsFor);
  }
  function ensureInlineIconsFor(scope){
    const tags = getTagLinks(scope);
    const managedLists = new Set();

    tags.forEach(a => {
      a.classList.add(`${NS}-tag-wrap`);

      // icon
      let ico = a.querySelector(`.${NS}-hide-ico`);
      if (!ico) {
        const canon = canonicalFromAnchor(a);
        if (canon) {
          ico = document.createElement('span');
          ico.className = `${NS}-hide-ico`;
          ico.title = 'Hide this tag from results';
          ico.setAttribute('role','button');
          ico.setAttribute('aria-label', `Hide tag "${canon}"`);
          ico.dataset.tag = canon;
          ico.textContent = '🚫';
          a.appendChild(ico);
        }
      }

      // wrap text node
      let textWrap = a.querySelector(`.${NS}-tag-txt`);
      if (!textWrap) {
        for (let n = a.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim()) {
            textWrap = document.createElement('span');
            textWrap.className = `${NS}-tag-txt`;
            a.insertBefore(textWrap, n);
            textWrap.appendChild(n);
            break;
          }
        }
      }

      // commas
      const li = a.closest('li');
      const list = a.closest('ul.commas, ol.commas, .commas');
      if (!li || !list || !textWrap) return;

      managedLists.add(list);

      const needsComma = !!li.nextElementSibling;
      let comma = a.querySelector(`.${NS}-tag-comma`);
      if (needsComma) {
        if (!comma) {
          comma = document.createElement('span');
          comma.className = `${NS}-tag-comma`;
          comma.textContent = ',';
          a.insertBefore(comma, ico || null);
        }
      } else if (comma) {
        comma.remove();
      }
    });

    managedLists.forEach(ul => ul.classList.add(`${NS}-own-commas`));
  }

  // tiny toast
  function toast(msg){
    const el = document.createElement('div');
    el.className = `${NS}-toast`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(()=> el.style.opacity = '1');
    setTimeout(()=> { el.style.opacity = '0'; setTimeout(()=> el.remove(), 200); }, 1000);
  }

  function attachDelegatesOnce(){
    if (delegatesAttached) return;
    delegatesAttached = true;

    document.addEventListener('click', async (e) => {
      const ico = e.target?.closest?.(`.${NS}-hide-ico`);
      if (!ico) return;
      e.preventDefault(); e.stopPropagation();
      const canon = (ico.dataset.tag || '').trim();
      if (!canon) return;
      await addHiddenTag(canon);
      await processList();
      toast(`Hidden: ${canon}`);
    }, true);

    document.addEventListener('click', async (e) => {
      const link = e.target?.closest?.('a.tag');
      if (!link || !e.altKey) return;
      e.preventDefault();
      const canon = canonicalFromAnchor(link);
      if (!canon) return;
      await addHiddenTag(canon);
      await processList();
      toast(`Hidden: ${canon}`);
    }, true);
  }

  /* --------------------------- Hidden Tags Manager --------------------------- */
  function openManager(){
    function listGroupNamesFromMap(groupsMap, hidden) {
      const names = new Set();
      for (const t of hidden) {
        const g = (groupsMap[t] || '').trim();
        if (g) names.add(g);
      }
      return [...names].sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));
    }
    function wireOutsideToClose(pop, onClose) {
      const onDocClick = (e) => { if (!pop.contains(e.target)) { cleanup(); onClose(); } };
      const onKey = (e) => { if (e.key === 'Escape') { cleanup(); onClose(); } };
      function cleanup(){ document.removeEventListener('mousedown', onDocClick, true); document.removeEventListener('keydown', onKey, true); }
      document.addEventListener('mousedown', onDocClick, true);
      document.addEventListener('keydown', onKey, true);
      return cleanup;
    }
    async function openGroupPicker(anchorBtn, currentTag, currentGroup, getHidden, getGroupsMap, setGroupsMap, onApplied) {
      const hidden = await getHidden();
      const map = await getGroupsMap();
      const groups = listGroupNamesFromMap(map, hidden);

      const pop = document.createElement('div');
      pop.className = `${NS}-gp-pop`;
      pop.innerHTML = `
        <div class="${NS}-gp-head">Groupes</div>
        <div class="${NS}-gp-list"></div>
        <input class="${NS}-gp-input" type="text" placeholder="Nouveau groupe…" value="">
        <div class="${NS}-gp-actions">
          <button class="${NS}-gp-btn apply" type="button">Appliquer</button>
          <button class="${NS}-gp-btn cancel" type="button">Fermer</button>
        </div>`;

      const r = anchorBtn.getBoundingClientRect();
      Object.assign(pop.style, {
        left: `${Math.round(window.scrollX + r.left)}px`,
        top:  `${Math.round(window.scrollY + r.bottom + 6)}px`,
      });

      document.body.appendChild(pop);
      const cleanup = wireOutsideToClose(pop, () => pop.remove());

      const list = pop.querySelector(`.${NS}-gp-list`);
      const input = pop.querySelector(`.${NS}-gp-input`);
      const btnApply = pop.querySelector('.apply');
      const btnCancel = pop.querySelector('.cancel');

      const itemLabel = (name)=> name || '(sans groupe)';

      groups.forEach(name => {
        const row = document.createElement('div');
        row.className = `${NS}-gp-item`;
        row.innerHTML = `<span>${itemLabel(name)}</span>${name === currentGroup ? '<span>•</span>' : ''}`;
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

    const backdrop = document.createElement('div');
    backdrop.className = `${NS}-mgr-backdrop`;

    const box = document.createElement('div');
    box.className = `${NS}-mgr`;
    box.innerHTML = `
      <h3>AO3 Helper — Hidden Tags (Groups)</h3>
      <div class="${NS}-ul-head">
        <input class="${NS}-ul-search" type="search" placeholder="Rechercher par tag ou groupe…" />
        <span class="${NS}-ul-count">0 / 0</span>
      </div>
      <div class="${NS}-ul-actions">
        <button class="${NS}-ul-btn export"  type="button">Export JSON (tags)</button>
        <button class="${NS}-ul-btn import"  type="button">Import JSON (tags)</button>
        <button class="${NS}-ul-btn exportg" type="button" title="Export groups mapping">Export Groups</button>
        <button class="${NS}-ul-btn importg" type="button" title="Import groups mapping">Import Groups</button>
        <button class="${NS}-ul-btn close"   type="button">Close</button>
      </div>
      <div class="${NS}-ul-list" aria-live="polite"></div>
    `;

    function close(){ backdrop.remove(); box.remove(); }
    backdrop.addEventListener('click', close);
    box.querySelector('.close').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e){
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    document.body.append(backdrop, box);

    const $search = box.querySelector(`.${NS}-ul-search`);
    const $count = box.querySelector(`.${NS}-ul-count`);
    const $list  = box.querySelector(`.${NS}-ul-list`);

    function listAllGroupNames(groupsMap, hidden){
      const names = new Set();
      for (const t of hidden) names.add((groupsMap[t]||'').trim());
      return [...names].sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));
    }

    function buildGroupSelect(current, groupsMap, hidden){
      const sel = document.createElement('select');
      sel.className = `${NS}-ul-select`;
      for (const name of listAllGroupNames(groupsMap, hidden)) {
        const label = name || '(sans groupe)';
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = label;
        if (name === (current||'')) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    }

    let searchTimer = 0;
    function onSearch(cb){ clearTimeout(searchTimer); searchTimer = setTimeout(cb, 150); }

    async function reload(){
      const hidden = await getHidden();
      const groupsMap = await getGroupsMap();
      const qn = toNorm($search.value || '');

      const filtered = hidden.filter(t =>
        !qn || toNorm(t).includes(qn) || toNorm(groupsMap[t] || '').includes(qn)
      );

      const grouped = new Map();
      for (const t of filtered) {
        const g = (groupsMap[t] || '').trim();
        const key = g ? g : 'sans groupe';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(t);
      }

      for (const [, arr] of grouped) arr.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      const entries = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));

      $list.innerHTML = '';
      let shown = 0;

      const collapsedSet = getCollapsedSet();

      for (const [gname, tags] of entries) {
        const block = document.createElement('div');
        block.className = `${NS}-ul-group`;

        const isCollapsed = collapsedSet.has(gname);
        block.setAttribute('aria-expanded', String(!isCollapsed));

        const head = document.createElement('div');
        head.className = `${NS}-ul-ghead`;
        head.setAttribute('role', 'button');
        head.setAttribute('tabindex', '0');

        const chev = document.createElement('span');
        chev.className = `${NS}-ul-chevron`;
        chev.textContent = '';

        const glabel = document.createElement('span');
        glabel.className = `${NS}-ul-glabel`;
        glabel.textContent = `${gname || ''} — ${tags.length}`;

        function toggleGroup(){
          const nowExpanded = block.getAttribute('aria-expanded') !== 'true';
          block.setAttribute('aria-expanded', String(nowExpanded));
          if (nowExpanded) collapsedSet.delete(gname);
          else collapsedSet.add(gname);
          setCollapsedSet(collapsedSet);
        }
        head.addEventListener('click', toggleGroup);
        head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(); } });

        head.append(chev, glabel);
        block.append(head);

        const wrap = document.createElement('div');
        wrap.className = `${NS}-ul-gwrap`;

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
          gbtn.setAttribute('aria-label', 'Changer de groupe');
          gbtn.textContent = '📁';
          gbtn.addEventListener('click', () => {
            openGroupPicker(
              gbtn,
              tag,
              (groupsMap[tag] || '').trim(),
              getHidden,
              getGroupsMap,
              setGroupsMap,
              reload
            );
          });

          const del = document.createElement('button');
          del.className = `${NS}-ul-btn ${NS}-ul-del`;
          del.textContent = '🗑️';
          del.title = 'Supprimer ce tag caché';
          del.addEventListener('click', async () => {
            if (!confirm(`Are you sure you want to delete the tag "${tag}" from your hidden list?`)) return;
            const cur = await getHidden();
            const idx = cur.indexOf(tag);
            if (idx >= 0) cur.splice(idx, 1);
            await setHidden(cur);

            const map = await getGroupsMap();
            if (tag in map) { delete map[tag]; await setGroupsMap(map); }

            await processList();
            reload();
          });

          row.append(label, gbtn, del);
          wrap.append(row);
          shown++;
        }

        block.append(wrap);
        $list.append(block);
      }

      const total = (await getHidden()).length;
      $count.textContent = `${shown} / ${total}`;
    }

    $search.addEventListener('input', ()=> onSearch(reload));

    // Export/Import TAGS
    box.querySelector('.export').addEventListener('click', async () => {
      const list = await getHidden();
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ao3h-hidden-tags.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });

    box.querySelector('.import').addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const incoming = JSON.parse(text);
          if (!Array.isArray(incoming)) throw new Error('Not an array');

          const current = await getHidden();
          const merged = Array.from(new Set(
            current.concat(incoming.map(s => String(s).trim().toLowerCase()))
          )).filter(Boolean);

          await setHidden(merged);
          await processList();
          reload();
          try { toast(`Imported ${incoming.length} tags`); } catch {}
        } catch (err) {
          alert('Invalid JSON file for tags.\n' + (err?.message || ''));
        }
      });
      input.click();
    });

    // Export/Import GROUPS MAP
    box.querySelector('.exportg').addEventListener('click', async () => {
      const map = await getGroupsMap();
      const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ao3h-hidden-tags-groups.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });

    box.querySelector('.importg').addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const incoming = JSON.parse(text);
          if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
            throw new Error('Not an object');
          }
          const map = await getGroupsMap();
          const merged = { ...map, ...incoming };
          await setGroupsMap(merged);
          reload();
          try { toast('Imported groups mapping'); } catch {}
        } catch (err) {
          alert('Invalid JSON file for groups mapping.\n' + (err?.message || ''));
        }
      });
      input.click();
    });

    reload();
  }

  // processing
  async function processList(){
    if (!enabled) return;
    const hiddenList = await getHidden();
    const blurbs = getWorkBlurbs();

    blurbs.forEach(blurb => {
      let scopeForTags = blurb;
      const existingCut = blurb.querySelector(`.${NS}-cut`);
      if (existingCut) scopeForTags = existingCut;

      const reasons = reasonsFor(scopeForTags, hiddenList);

      if (reasons.length === 0){
        if (blurb.classList.contains(`${NS}-wrapped`)) unwrapWork(blurb);
        else { forceShow(blurb); }
        return;
      }
      wrapWork(blurb, reasons);
    });
  }

  function run(){
    if (!enabled) return;
    ensureInlineIcons();
    processList();
  }

  async function init(initialFlags){
    enabled = !!(initialFlags && initialFlags.hideByTags);

    onReady(() => {
      // Always wire the manager opener + TM menu (even if feature is off)
      document.addEventListener(`${NS}:open-hide-manager`, openManager);
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('AO3 Helper: Manage hidden tags…', openManager);
        GM_registerMenuCommand('AO3 Helper: Show hidden tags', async ()=> {
          const list = await getHidden();
          console.log('[AO3H] Hidden tags (canonical):', list);
          alert(`Hidden tags (${list.length}):\n\n${list.join('\n') || '(none)'}`);
        });
        GM_registerMenuCommand('AO3 Helper: Export hidden tags (JSON)', async ()=> {
          const list = await getHidden();
          const blob = new Blob([JSON.stringify(list, null, 2)], {type: 'application/json'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'ao3h-hidden-tags.json';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        });
        GM_registerMenuCommand('AO3 Helper: Import hidden tags (paste JSON)', async ()=> {
          const raw = prompt('Paste JSON array of canonical tags to import:\n(e.g., ["midoriya izuku & shinsou hitoshi"])');
          if (!raw) return;
          try {
            const incoming = JSON.parse(raw);
            if (!Array.isArray(incoming)) throw new Error('Not an array');
            const current = await getHidden();
            const merged = Array.from(new Set(current.concat(incoming.map(s => String(s).trim().toLowerCase())))).filter(Boolean);
            await setHidden(merged);
            await processList();
            alert(`Imported. Hidden tags now: ${merged.length}`);
          } catch {
            alert('Import failed: please paste a valid JSON array.');
          }
        });
      }

      // Listen for flag changes
      on(document, `${NS}:flags-updated`, async () => {
        const f = await getFlags();
        const wasEnabled = enabled;
        enabled = !!f.hideByTags;

        if (enabled && !wasEnabled){
          attachDelegatesOnce();
          run();
          if (!observerActive){
            observe(document.body, debounce(run, 250));
            observerActive = true;
          }
        } else if (!enabled && wasEnabled){
          getWorkBlurbs().forEach(unwrapWork);
        } else if (enabled && wasEnabled){
          run();
        }
      });

      // Initial state
      if (enabled){
        attachDelegatesOnce();
        run();
        if (!observerActive){
          observe(document.body, debounce(run, 250));
          observerActive = true;
        }
      }
    });
  }

  AO3H.modules = AO3H.modules || {};
  AO3H.modules[MOD_ID] = { id: MOD_ID, title: 'Hide works by tags', init };
})();
