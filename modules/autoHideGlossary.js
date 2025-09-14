/* modules/autoHideGlossary.js — Collapse Author’s Notes by default
   - Minimal chevron toggle shows/hides BOTH heading + notes content.
   - Toggle sits on the RIGHT (before the group, floated right, so it stays visible when hidden).
   - Collapsed notes are fully removed from layout (display:none).
   - Remembers choice work-wide (per notes type: pre vs end) across sessions (localStorage).
   - Respects anchors (#notes / #endnotes) without overwriting stored preference.
   - When toggled OFF, clears ALL saved preferences for ANY work.
   - Robust observer cleanup (handles function OR object return from util.observe).
   - No per-module menu actions (toggles-only).
*/

;(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  let AO3H = W.AO3H || (W.AO3H = {});

  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';
  const {
    onReady,
    observe,
    css: cssFromCore,
    log
  } = (AO3H.util || {
    onReady: (fn)=> (document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn()),
    observe: (root, opts, cb)=>{
      const mo = new MutationObserver(muts=> cb(muts));
      mo.observe(root || document.documentElement, opts || {childList:true, subtree:true});
      return () => mo.disconnect();
    },
    css: null,
    log: console
  });

  // Minimal CSS injector fallback
  const css = cssFromCore || function injectCSS(first, ...rest){
    let text = '';
    if (Array.isArray(first) && Object.prototype.hasOwnProperty.call(first, 'raw')) {
      const strings = first, vals = rest;
      text = strings.map((s,i)=> s + (i < vals.length ? vals[i] : '')).join('');
    } else {
      text = String(first ?? '');
    }
    try { if (typeof GM_addStyle === 'function') { GM_addStyle(text); return; } } catch {}
    const el = document.createElement('style');
    el.textContent = text;
    (document.head || document.documentElement).appendChild(el);
  };

  const MOD_ID = 'autoHideGlossary';
  const TITLE  = 'Collapse Author’s Notes';

  // --- Styles (small right-aligned toggle; group clears float; layout removal handled inline) ---
  css`
    /* Small chevron-only toggle */
    .${NS}-notes-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px; height: 16px;          /* small */
      padding: 0;
      border-radius: 999px;
      border: none;
      background: #fff;
      color: #333;
      opacity: 0.7;
      box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08);
      cursor: pointer;
      user-select: none;
      line-height: 1;
      font-size: 10px;                     /* smaller glyph */
      vertical-align: text-bottom;
    }
    .${NS}-notes-toggle:hover { filter: brightness(.98); }
    .${NS}-notes-toggle .chev { font-size: inherit; }

    /* Place toggle on the right edge; keep tiny spacing */
    .${NS}-notes-toggle-wrap{
      display: inline-block;
      float: right;        /* right align in parent container */
      margin-left: 6px;
      margin-bottom: 2px;
    }

    /* Ensure the notes group starts below the floated toggle */
    .${NS}-notes-group { clear: both; }

    /* Visually hidden text for screen readers */
    .${NS}-sr {
      position: absolute !important;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
  `;

  // --- Page detection ---
  function isWorkOrChapterPath(pathname) {
    return /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(pathname);
  }
  function parseIds() {
    const m = location.pathname.match(/^\/works\/(\d+)(?:\/chapters\/(\d+))?$/);
    if (!m) return null;
    const workId    = m[1];
    const chapterId = m[2] || null;
    const usp = new URLSearchParams(location.search);
    const isFull = usp.has('view_full_work');
    return { workId, chapterId, isFull };
  }

  // --- Storage helpers ---
  const lsGet = (k, d=null)=>{ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v);}catch{return d;} };
  const lsSet = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{}; return v; };
  const lsDel = (k)=>{ try{ localStorage.removeItem(k); }catch{} };

  function workKey(suffix) {
    const ids = parseIds();
    if (!ids) return null;
    const { workId } = ids;
    return `${NS}:notes:workwide:${suffix}:${workId}`;
  }
  function chapterKey(suffix) {
    const ids = parseIds();
    if (!ids) return `${NS}:notes:${suffix}:${location.pathname}`;
    const { workId, chapterId, isFull } = ids;
    return `${NS}:notes:${suffix}:${workId}:${chapterId || 'work'}:${isFull?'full':'single'}`;
  }
  function getInitialExpanded(suffix) {
    const wk = workKey(suffix);
    if (wk) {
      const wv = lsGet(wk, null);
      if (wv && typeof wv.expanded === 'boolean') return { expanded: wv.expanded, source: 'work' };
    }
    const ck = chapterKey(suffix);
    const cv = lsGet(ck, null);
    if (cv && typeof cv.expanded === 'boolean') return { expanded: cv.expanded, source: 'chapter' };
    return { expanded: false, source: 'default' };
  }
  function saveExpanded(suffix, expanded, { scope='work+chapter' } = {}) {
    if (scope.includes?.('work') || scope === 'work+chapter') {
      const wk = workKey(suffix);
      if (wk) lsSet(wk, { expanded, ts: Date.now() });
    }
    if (scope.includes?.('chapter') || scope === 'work+chapter') {
      const ck = chapterKey(suffix);
      if (ck) lsSet(ck, { expanded, ts: Date.now() });
    }
  }
  function clearAllPrefs() {
    const prefix = `${NS}:notes:`;
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) toDelete.push(k);
    }
    toDelete.forEach(lsDel);
    log?.info?.('[AO3H]', `autoHideGlossary: cleared ${toDelete.length} stored preferences`);
  }

  // --- Core logic ---
  let active = false;
  let unobserve = null;

  function hasAnchorToNotes(){
    const h = (location.hash || '').toLowerCase();
    if (!h) return false;
    return h.includes('notes') || h.includes('endnotes');
  }

  // Find likely notes containers (heading + content together)
  function findNotesContainers(root=document) {
    const containers = new Set();

    [
      'div.notes.module',
      'div.end.notes.module',
      'section.notes',
      'section.end.notes'
    ].forEach(sel => root.querySelectorAll(sel).forEach(n => containers.add(n)));

    root.querySelectorAll('h3,h4,h5').forEach(h => {
      const t = (h.textContent || '').trim().toLowerCase();
      const isNotesHeading = t && (t === 'notes' || t === "author's notes" || t === 'end notes' || t.includes('notes'));
      if (!isNotesHeading) return;

      let content = h.nextElementSibling;
      if (!content) return;

      const existingContainer = h.closest('div.notes.module, div.end.notes.module, section.notes, section.end.notes');
      if (existingContainer && existingContainer.contains(content)) {
        containers.add(existingContainer);
        return;
      }

      if (h.parentElement && content) {
        const wrap = document.createElement('div');
        wrap.className = `${NS}-notes-group`;
        h.parentElement.insertBefore(wrap, h);
        wrap.appendChild(h);
        wrap.appendChild(content);
        containers.add(wrap);
        return;
      }

      const group = h.parentElement || content.parentElement;
      if (group) containers.add(group);
    });

    return Array.from(containers).filter(n => n && n.nodeType === 1);
  }

  function applyToggleUI(containerEl, suffix){
    const group = containerEl;
    group.classList.add(`${NS}-notes-group`);
    if (group.dataset[`${NS}NotesWired`] === '1') return;
    group.dataset[`${NS}NotesWired`] = '1';

    // Remember natural display to restore later (default to 'block')
    const naturalDisplay = (group.dataset[`${NS}NaturalDisp`] =
      (group.style.display && group.style.display !== 'none')
        ? group.style.display
        : (getComputedStyle(group).display || 'block')
    );

    // --- Build the minimal chevron-only toggle BEFORE the group (floated right) ---
    const wrap = document.createElement('span');
    wrap.className = `${NS}-notes-toggle-wrap`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${NS}-notes-toggle`;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Show notes');
    btn.innerHTML = `<span class="${NS}-sr">Show notes</span><span class="chev" aria-hidden="true">▼</span>`;
    wrap.appendChild(btn);

    // Insert before the group so it stays visible when group is display:none
    if (group.parentNode) {
      group.parentNode.insertBefore(wrap, group);
    }

    const setChev = (expanded)=> {
      const chev = btn.querySelector('.chev');
      if (chev) chev.textContent = expanded ? '▲' : '▼';
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.setAttribute('aria-label', expanded ? 'Hide notes' : 'Show notes');
    };

    const armGroup = ()=>{
      group.style.display = naturalDisplay || 'block';
      group.removeAttribute('inert');
      group.removeAttribute('aria-hidden');
      group.style.pointerEvents = '';
    };
    const disarmGroup = ()=>{
      if (group.contains(document.activeElement)) {
        try { btn.focus({ preventScroll: true }); } catch {}
      }
      group.setAttribute('inert', '');
      group.setAttribute('aria-hidden', 'true');
      group.style.pointerEvents = 'none';
      group.style.display = 'none'; // fully remove from layout
    };

    const expand = (persist=true)=>{
      armGroup();
      setChev(true);
      if (persist && active) saveExpanded(suffix, true, { scope: 'work+chapter' });
    };

    const collapse = (persist=true)=>{
      disarmGroup();
      setChev(false);
      if (persist && active) saveExpanded(suffix, false, { scope: 'work+chapter' });
    };

    // Initial state
    const init = getInitialExpanded(suffix);
    if (init.expanded) expand(false); else collapse(false);

    // If arriving anchored to notes, force expand for this view without persisting
    if (hasAnchorToNotes() && !init.expanded) expand(false);

    // Click handler
    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) collapse(true); else expand(true);
    }, { passive: true });
  }

  function process(root=document) {
    if (!isWorkOrChapterPath(location.pathname)) return;

    const groups = findNotesContainers(root);
    groups.forEach((grp) => {
      const id = (grp.id || '').toLowerCase();
      const cls = (grp.className || '').toLowerCase();
      const heading = grp.querySelector('h3,h4,h5');
      const htxt = (heading && heading.textContent || '').toLowerCase();

      let suffix = 'pre';
      if (id.includes('end') || cls.includes('end') || htxt.includes('end')) suffix = 'end';

      applyToggleUI(grp, suffix);
    });
  }

  function start() {
    if (active) return;
    if (!isWorkOrChapterPath(location.pathname)) return;
    active = true;

    onReady(() => process(document));

    // Observe content changes
    unobserve = observe(document, { childList: true, subtree: true }, (muts) => {
      for (const m of muts) {
        for (const n of (m.addedNodes || [])) {
          if (!(n instanceof Element)) continue;
          if (n.matches?.('div,section,article')) process(n);
        }
      }
    });

    log?.info?.('[AO3H]', 'autoHideGlossary started (small right-side chevron; display:none collapse)');
  }

  function stop() {
    if (!active) return;
    active = false;

    // Robustly disconnect MutationObserver
    try {
      if (typeof unobserve === 'function') {
        unobserve();
      } else if (unobserve && typeof unobserve.disconnect === 'function') {
        unobserve.disconnect();
      }
    } catch {}
    unobserve = null;

    // Remove toggles and restore groups
    document.querySelectorAll(`.${NS}-notes-toggle-wrap`).forEach(el => el.remove());
    document.querySelectorAll(`.${NS}-notes-group`).forEach(el => {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
      el.style.pointerEvents = '';
      const natural = el.dataset[`${NS}NaturalDisp`] || '';
      el.style.display = natural || ''; // restore original display
      delete el.dataset[`${NS}NotesWired`];
      delete el.dataset[`${NS}NaturalDisp`];
    });

    // Auto-reset all saved prefs when the module is toggled OFF
    clearAllPrefs();

    log?.info?.('[AO3H]', 'autoHideGlossary stopped');
  }

  // Registration
  function registerNow(A) {
    if (A.modules && typeof A.modules.register === 'function') {
      A.modules.register(MOD_ID, { title: TITLE, enabledByDefault: true }, async () => {
        start();
        return () => stop();
      });
      A.menu?.rebuild?.();
      return true;
    }
    if (A.register) {
      A.register({
        id: MOD_ID,
        title: TITLE,
        defaultFlagKey: MOD_ID,
        init: async ({ enabled }) => { if (enabled) start(); return () => stop(); },
        onFlagsUpdated: async ({ enabled }) => { enabled ? start() : stop(); },
      });
      A.menu?.rebuild?.();
      return true;
    }
    return false;
  }

  (function robustRegister(){
    if (registerNow(W.AO3H)) return;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (W.AO3H && AO3H !== W.AO3H) AO3H = W.AO3H;
      if (registerNow(W.AO3H)) { clearInterval(iv); return; }
      if (tries > 120) clearInterval(iv); // ~6s safety cap
    }, 50);
  })();

})();
