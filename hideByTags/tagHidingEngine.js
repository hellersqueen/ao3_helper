(function (global) {
  'use strict';

  const AO3H = window.AO3H || {};
  const { $, $$, onReady, observe, css, debounce } = AO3H.util || {};
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  let delegatesAttached = false;
  let observerActive = false;

  /* --------------------- Shared helpers --------------------- */
  function forceShow(el) {
    try {
      el.hidden = false;
      el.style && el.style.removeProperty && el.style.removeProperty('display');
      el.classList.add(`${NS}-force-show`);
    } catch {}
  }

  function canonicalFromAnchor(a) {
    try {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/tags\/([^/]+)/);
      if (!m) return null;
      let s = decodeURIComponent(m[1]).replace(/\+/g, ' ');
      s = s.replace(/\*a\*/gi, '&').replace(/\*s\*/gi, '/');
      return s.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').trim().toLowerCase();
    } catch {
      return null;
    }
  }

  function getWorkIdFromBlurb(blurb) {
    if (!blurb || typeof blurb.querySelectorAll !== 'function') return null;
    const candidates = blurb.querySelectorAll('.header .heading a, .header a, a[href*="/works/"]');
    for (const a of candidates) {
      const href = a.getAttribute('href') || '';
      if (/\/works\/\d+/.test(href)) {
        const m = href.replace(/(#.*|\?.*)$/, '').match(/\/works\/(\d+)/);
        return m ? m[1] : null;
      }
    }
    return null;
  }

  function getWorkBlurbs(root = document) {
    const a = $$('#main .work.blurb.group, #main .work.blurb, #main .bookmark.blurb.group, #main .blurb.group, #main .blurb', root);
    const b = Array.from(root.querySelectorAll('li.blurb'));
    return Array.from(new Set([...a, ...b]));
  }
  const getTagLinks = (scope) => $$('a.tag', scope);

  function reasonsFor(scope, hiddenSet) {
    const canon = getTagLinks(scope).map(canonicalFromAnchor).filter(Boolean);
    return canon.filter((t) => hiddenSet.has(t));
  }
  // ========== CSS Injection ==========
  css`
/* ===================== FOLD / CUT ===================== */
.${NS}-fold {
  position: relative;
  display: flex !important;
  align-items: center;
  gap: .5rem;
  justify-content: flex-start;
  min-height: 14px;
  padding: 10px 10px;
  border: 1px dashed #bdbdbd;
  border-radius: 8px;
  background: #fee9e9;
  font-size: 11px;
  color: #333;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
}

.${NS}-fold.${NS}-disabled {
cursor: default;
background: #f7f7f7;
border-style: solid;
}

.${NS}-fold.${NS}-disabled:hover { 
background: #f7f7f7; 
}

.${NS}-fold.${NS}-disabled .${NS}-hint { 
opacity:.55; 
}

.${NS}-fold * { 
pointer-events: none; 
}

.${NS}-fold:hover { 
background:#f1f3f7; 
}

.${NS}-fold:focus { 
outline:2px solid #7aa7ff; 
outline-offset:2px; 
}

.${NS}-note { 
font-weight:600; 
}

.${NS}-reason { 
margin-left:4px; 
opacity:.85; 
}

.${NS}-hint { 
margin-left:auto; 
font-size:.85em; 
opacity:.7; 
}

.${NS}-cut { 
display:none; 
}

.${NS}-fold[aria-expanded="true"] + .${NS}-cut { 
display:block; 
}

.${NS}-fold[aria-expanded="true"] {
  position: sticky; 
  top: 0; 
  z-index: 100;
  margin-top: 0; 
  margin-bottom: 8px;
  padding: 10px 10px;
  background:#fffbe6; 
  border:1px solid #e6d28a; 
  border-bottom:1px dashed #bdbdbd;
  border-radius:8px; 
  opacity:.95;
}

.${NS}-force-show { 
display:list-item !important; 
}

/* ===================== INLINE HIDE ICON ===================== */
a.tag.${NS}-tag-wrap {
  position: relative;
  padding-right: 0.8em; /* reserve space all the time */
  overflow: visible;
}

a.tag.${NS}-tag-wrap:hover,
a.tag.${NS}-tag-wrap:focus-visible,
ul.commas li:hover > a.tag.${NS}-tag-wrap,
ol.commas li:hover > a.tag.${NS}-tag-wrap,
.commas   li:hover > a.tag.${NS}-tag-wrap {
  /* no layout change on hover anymore */
}


.${NS}-hide-ico {
  position: absolute;
  right: -0.1em;
  top: 50%;
  transform: translateY(-50%);
  width: 1em; 
  height: 1em; 
  line-height: 1em;
  text-align: center; 
  font-size: .9em;
  border: none; 
  border-radius: 50%;
  background: transparent;
  opacity: 0; 
  pointer-events: none;
  transition: opacity .15s, transform .15s;
  z-index: 2;
}

/* Hide our injected comma only when the icon would be visible */
a.tag.${NS}-tag-wrap:hover .${NS}-tag-comma,
a.tag.${NS}-tag-wrap:focus-visible .${NS}-tag-comma,
ul.commas li:hover > a.tag.${NS}-tag-wrap .${NS}-tag-comma,
ol.commas li:hover > a.tag.${NS}-tag-wrap .${NS}-tag-comma,
.commas   li:hover > a.tag.${NS}-tag-wrap .${NS}-tag-comma {
  display: none;
}

a.tag.${NS}-tag-wrap:hover .${NS}-hide-ico,
a.tag.${NS}-tag-wrap:focus-visible .${NS}-hide-ico {
  opacity: 1; 
  pointer-events: auto;
}

.${NS}-hide-ico:hover {
  transform: translateY(-50%) scale(1.06);
}

ul.commas li,
ol.commas li,
.commas li { 
white-space: nowrap; 
}

ul.commas li > a.tag.${NS}-tag-wrap,
ol.commas li > a.tag.${NS}-tag-wrap,
.commas   li > a.tag.${NS}-tag-wrap {
  font-size: 0.92em; 
  line-height: 1.15;
}

ul.commas li::after,
ol.commas li::after,
.commas   li::after { 
font-size: 0.92em; 
}

a.tag.${NS}-tag-wrap .${NS}-hide-ico { 
font-size: 0.9em; 
}

/* ===================== MANAGER PANEL (ULTRA-LIGHT) ===================== */
.${NS}-mgr-backdrop { 
position:fixed; 
inset:0; 
background:rgba(0,0,0,.35); 
z-index:999998; 
}

.${NS}-mgr {
  position:fixed; 
  top:10vh; 
  left:50%; 
  transform:translateX(-50%);
  background:#fff; 
  color:#000; 
  border:1px solid #e5e7eb; 
  padding:10px;
  z-index:999999; 
  box-shadow:0 16px 40px rgba(2,15,35,.12);
  font: 12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  display:grid; 
  gap:8px; 
  max-height: 60vh; 
  max-width: 70vh; 
  overflow: auto;
}

.${NS}-close-x{
  position:absolute;
  top:2px;
  right:4px;
  width:16px;
  height:16px;
  padding-bottom: 6px;
  border:none;
  border-radius:6px;
  background:transparent;
  font-size:10px;
  line-height:16px;
  text-align:center;
  cursor:pointer;
}
.${NS}-close-x:hover{
  background:#f5f7fb;
  border-color:#cfd6e4;
}

.${NS}-mgr h3 { 
margin:.2rem 0 .4rem; 
font-size:1rem; 
text-align:center; 
}

.${NS}-ul-head { 
display:grid; 
grid-template-columns: 1fr auto; 
gap:6px; 
align-items:center; 
}

.${NS}-ul-search {
  border-radius: 8px; 
  border:1px solid #cfd6e4; 
  background:#fff;
  padding: 6px 10px; 
  font-size:10px;
}

.${NS}-ul-count { 
font-weight:600; 
font-size:10px; 
color:#4b5563; 
}

.${NS}-ul-actions { 
display:flex; 
gap:8px; 
flex-wrap:wrap; 
}

.${NS}-ul-btn {
  height: 25px; 
  padding: 0 10px;
  border-radius: 8px; 
  border:1px solid #cfd6e4; 
  background:#f5f7fb;
  font-size:10px; 
  cursor:pointer; 
  transition: background .15s, transform .12s, border-color .15s;
}

.${NS}-ul-btn:hover { 
background:#ecf1f8; 
border-color:#b8c3d8; 
transform: translateY(-1px); 
}

.${NS}-ul-list { 
display:grid; 
gap:8px; 
max-height:none; 
overflow:visible; 
padding-right:2px; 
}

.${NS}-ul-group {
  border: 1px solid #e6e8ee; 
  background: #fff; 
  border-radius: 10px; 
  margin-bottom: 8px;
  display: flex; 
  flex-direction: column; 
  min-height: 25px;
}

.${NS}-ul-ghead {
  display:flex; 
  align-items:center; 
  gap:8px; 
  height:25px; 
  padding:3px;
  background:transparent; border:none; cursor:pointer; user-select:none;
}

.${NS}-ul-ghead:focus-visible { 
outline: 2px solid #7aa7ff; 
outline-offset: 2px; 
}

.${NS}-ul-chevron { 
display:inline-block; 
width:10px; 
min-width:10px; 
height:10px; 
transform-origin:50% 50%; 
transition: transform .18s ease; margin-left:10px; 
}

.${NS}-ul-group[aria-expanded="true"] .${NS}-ul-chevron { 
transform: rotate(90deg); 
}

.${NS}-ul-glabel {
  font-weight:650; 
  font-size:12px; 
  color:#1f2937; 
  line-height:25px;
  white-space:nowrap; 
  overflow:hidden; 
  text-overflow:ellipsis; 
  margin-left:-15px;
}

.${NS}-ul-gwrap {
  overflow:hidden; 
  max-height:0;
  transition:max-height .22s ease, padding-top .22s ease, margin-top .22s ease, border-color .22s ease;
}

.${NS}-ul-group[aria-expanded="true"] .${NS}-ul-gwrap {
  max-height:1200px; 
  border-top: 1px dashed #e7ebf5;
}

.${NS}-ul-gwrap { 
display:grid; 
gap:6px; 
}

.${NS}-ul-row {
  display:grid; 
  grid-template-columns: 1fr auto auto; 
  align-items:center; 
  gap:8px;
  padding:6px 8px; 
  border:1px dashed transparent; 
  border-radius:8px;
  transition: background .12s, border-color .12s;
}

.${NS}-ul-row:hover { 
background:#fafbfe; 
border-color:#e7ebf5; 
}

.${NS}-ul-tag {
  display:inline-block; 
  max-width:100%;
  padding:4px 10px; 
  border-radius:999px; 
  background:#f6f7fb; 
  border:1px solid #dfe4f0;
  font-size:11px; 
  font-weight:500; 
  color:#111827; 
  white-space:nowrap; 
  overflow:hidden; 
  text-overflow:ellipsis;
}

.${NS}-ul-gbtn, .${NS}-ul-del {
  display:flex; 
  align-items:center; 
  justify-content:center;
  height:26px; 
  min-width:30px; 
  padding:0 10px;
  border:1px solid #cfd6e4; 
  border-radius:8px; 
  background:#f5f7fb; 
  font-size:10px; 
  cursor:pointer;
  transition: background .15s, transform .12s, border-color .15s;
}

.${NS}-ul-gbtn:hover, .${NS}-ul-del:hover { 
background:#ecf1f8; 
border-color:#b8c3d8; 
transform: translateY(-1px); 
}

.${NS}-ul-del { 
background:#fff6f6; 
border-color:#f2c9c9; 
}

.${NS}-ul-del:hover { 
background:#ffecec; 
border-color:#e9b3b3; 
}

.${NS}-toast {
  position: fixed; 
  bottom: 10px; 
  left: 50%; 
  transform: translateX(-50%);
  background: rgba(0,0,0,.75); 
  color: #fff;
  padding: 6px 10px; 
  border-radius: 10px;
  font-size:11px; 
  z-index: 999999;
  opacity: 0; 
  transition: opacity .15s ease; 
  pointer-events: none;
}

.${NS}-gp-pop {
  position: absolute; 
  z-index: 1000000;
  min-width: 180px; 
  max-width: 260px; 
  max-height: 50vh; 
  overflow: auto;
  background: #fff; 
  border: 1px solid #bbb; 
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0,0,0,.2); 
  padding: 6px;
  font: 12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
}

.${NS}-gp-head { 
font-weight: 600; 
margin-bottom: 4px; 
text-align:center; 
}

.${NS}-gp-list { 
display: grid; 
gap: 4px; 
}

.${NS}-gp-item {
  display: flex; 
  justify-content: space-between;
  padding: 4px 6px; 
  border: 1px solid #ddd; 
  border-radius: 6px; 
  cursor: pointer;
}

.${NS}-gp-item:hover { 
background: #f4f6f9; 
}

.${NS}-gp-input { 
width: 90%; 
margin-top: 6px; 
padding: 6px 8px; 
border: 1px solid #bbb; 
border-radius: 6px;
}

.${NS}-gp-actions { 
display: flex; 
gap: 6px; 
justify-content: flex-end; 
margin-top: 6px; 
}

.${NS}-gp-btn {
  padding: 3px 6px; 
  border: 1px solid #bbb; 
  border-radius: 6px; 
  background: #f3f4f6; 
  cursor: pointer; 
  font-size: 11px;
}

.${NS}-gp-btn:hover { 
background:#e9ecf0; 
}

@media (max-width: 720px){
  .${NS}-ul-head { grid-template-columns: 1fr; }
  .${NS}-ul-actions { justify-content:flex-start; }
}

/* AO3 commas control */
.${NS}-own-commas li::after { 
content: "" !important; 
}

a.tag.${NS}-tag-wrap .${NS}-tag-comma { 
text-decoration: none; 
margin-right: .35em; 
}
  `;

  /* ------------------- Hide/Show (folding) ------------------- */
  function updateFoldContent(fold, reasons, isExpanded, notesLock, workId) {
    fold.innerHTML = '';

    const note = document.createElement('span');
    note.className = `${NS}-note`;
    note.textContent = isExpanded ? 'ℹ️ This work was hidden.' : 'This work is hidden';

    const why = document.createElement('span');
    why.className = `${NS}-reason`;

    // Combine local reasons + note-based reasons
    const globalReasons = (window.ao3hVisibilityBus?.getReasons(workId) || []);
    const combinedReasons = [...new Set([...reasons, ...globalReasons])];

    if (combinedReasons.length) {
      why.textContent = ' — (Reason: ' + combinedReasons.join(' + ') + ')';
    }

    const hint = document.createElement('span');
    hint.className = `${NS}-hint`;
    if (notesLock) {
      hint.textContent = 'Hidden by a Note';
      fold.classList.add(`${NS}-disabled`);
      fold.setAttribute('aria-disabled', 'true');
      fold.setAttribute('aria-expanded', 'false');
    } else {
      hint.textContent = isExpanded ? 'Click to hide' : 'Click to show';
      fold.classList.remove(`${NS}-disabled`);
      fold.removeAttribute('aria-disabled');
    }

    fold.dataset.reasons = combinedReasons.join('|');
    if (!notesLock) fold.setAttribute('aria-expanded', String(!!isExpanded));
    fold.append(note, document.createTextNode(' '), why, hint);
  }

  function ensureWrapped(blurb) {
    if (blurb.classList.contains(`${NS}-wrapped`)) {
      return { fold: blurb.querySelector(`.${NS}-fold`), cut: blurb.querySelector(`.${NS}-cut`) };
    }
    blurb.classList.add(`${NS}-wrapped`);
    forceShow(blurb);

    const cut = document.createElement('div');
    cut.className = `${NS}-cut`;
    const cutId = `${NS}-cut-${Math.random().toString(36).slice(2)}`;
    cut.id = cutId;
    while (blurb.firstChild) cut.appendChild(blurb.firstChild);
    blurb.appendChild(cut);

    const fold = document.createElement('div');
    fold.className = `${NS}-fold`;
    fold.setAttribute('role', 'button');
    fold.setAttribute('tabindex', '0');
    fold.setAttribute('aria-expanded', 'false');
    fold.setAttribute('aria-controls', cutId);
    blurb.insertBefore(fold, cut);

    const doToggle = () => {
      if (fold.classList.contains(`${NS}-disabled`) || fold.getAttribute('aria-disabled') === 'true') return;
      const nowExpanded = fold.getAttribute('aria-expanded') !== 'true';
      fold.setAttribute('aria-expanded', String(nowExpanded));
      const reasons = (fold.dataset.reasons || '').split('|').filter(Boolean);
      updateFoldContent(fold, reasons, nowExpanded, false, getWorkIdFromBlurb(blurb));
      if (nowExpanded) {
        const workId = getWorkIdFromBlurb(blurb);
        if (workId) {
          document.dispatchEvent(new CustomEvent(`${NS}:work-visible`, { detail: { workId, by: 'tag' } }));
        }
      }
    };

    fold.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      doToggle();
    });
    fold.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doToggle();
      }
    });

    return { fold, cut };
  }

  function wrapWork(blurb, reasons) {
    const { fold } = ensureWrapped(blurb);
    const workId = getWorkIdFromBlurb(blurb);

    // Skip hide if globally marked visible
    if (window.ao3hVisibilityBus?.shouldBeVisible(workId)) return;

    const notesLock = false;
    const isExpanded = (!notesLock) && (fold.getAttribute('aria-expanded') === 'true');

    updateFoldContent(fold, reasons, isExpanded, notesLock, workId);
    forceShow(blurb);

    document.dispatchEvent(new CustomEvent(`${NS}:work-hidden`, { detail: { workId, by: 'tag' } }));
  }

  function unwrapWork(blurb) {
    const fold = blurb.querySelector(`.${NS}-fold`);
    const cut = blurb.querySelector(`.${NS}-cut`);
    const workId = getWorkIdFromBlurb(blurb);

    blurb.classList.remove(`${NS}-wrapped`, `${NS}-force-show`);
    if (fold) fold.remove();
    if (cut) {
      while (cut.firstChild) blurb.insertBefore(cut.firstChild, cut);
      cut.remove();
    }

    blurb.hidden = false;
    blurb.style && blurb.style.removeProperty && blurb.style.removeProperty('display');

    if (workId) {
      document.dispatchEvent(new CustomEvent(`${NS}:work-visible`, { detail: { workId, by: 'tag' } }));
    }
  }

  /* ------------------- Inline Hide Icons ------------------- */
  function ensureInlineIcons(root = document) {
    const scopes = getWorkBlurbs(root);
    if (scopes.length === 0) {
      const fallback = document.querySelector('#workskin') || document.querySelector('#main') || document;
      scopes.push(fallback);
    }
    scopes.forEach(ensureInlineIconsFor);
  }

  function ensureInlineIconsFor(scope) {
    const tags = getTagLinks(scope);
    const managedLists = new Set();

    tags.forEach((a) => {
      a.classList.add(`${NS}-tag-wrap`);
      let ico = a.querySelector(`.${NS}-hide-ico`);
      if (!ico) {
        const canon = canonicalFromAnchor(a);
        if (canon) {
          ico = document.createElement('span');
          ico.className = `${NS}-hide-ico`;
          ico.title = 'Hide this tag from results';
          ico.setAttribute('role', 'button');
          ico.setAttribute('aria-label', `Hide tag "${canon}"`);
          ico.dataset.tag = canon;
          ico.textContent = '🚫';
          a.appendChild(ico);
        }
      }
    });

    managedLists.forEach((ul) => ul.classList.add(`${NS}-own-commas`));
  }

  /* ------------------- Delegates ------------------- */
  function attachDelegatesOnce(addHiddenTag, processList, toast) {
    if (delegatesAttached) return;
    delegatesAttached = true;

    document.addEventListener(
      'click',
      async (e) => {
        const ico = e.target?.closest?.(`.${NS}-hide-ico`);
        if (!ico) return;
        e.preventDefault();
        e.stopPropagation();
        const canon = (ico.dataset.tag || '').trim();
        if (!canon) return;
        await addHiddenTag(canon);
        await processList();
        toast(`Hidden: ${canon}`);
      },
      true
    );

    document.addEventListener(
      'click',
      async (e) => {
        const link = e.target?.closest?.('a.tag');
        if (!link || !e.altKey) return;
        e.preventDefault();
        const canon = canonicalFromAnchor(link);
        if (!canon) return;
        await addHiddenTag(canon);
        await processList();
        toast(`Hidden: ${canon}`);
      },
      true
    );
  }

  /* ------------------- Export ------------------- */
  global.hideByTagsEngine = {
    forceShow,
    getWorkBlurbs,
    reasonsFor,
    wrapWork,
    unwrapWork,
    ensureInlineIcons,
    attachDelegatesOnce,
  };
})(window);