// ==UserScript==
// @name         AO3 Helper — Group Menu (closed by default, perfect toggle styling + in-page state)
// @description  Clone toggles into submenus, hide originals, keep CSS+delegated clicks; submenus start closed but remember state during the session.
// @match        https://archiveofourown.org/*
// @run-at       document-idle
// ==/UserScript==

(function(){
  'use strict';

  // ---- group config (module IDs are case-insensitive) ----
  const GROUPS = [
    { label: 'Reading',            include: ['saveScroll','chapterWordCount'],                                        match: /(scroll|chapter\s*word|read)/i },
    { label: 'Search',             include: ['autoSearchFilters'],                                                     match: /(search|filter)/i },
    { label: 'Hiding / Filtering', include: ['hideByTags','hideFanficWithNotes','hideWordCount','hideDates'],         match: /(hide|block|filter|mute)/i },
  ];

  // ---- utils & NS ----
  const lc = s => String(s||'').toLowerCase();
  const ready = (fn)=> (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, { once:true })
    : fn();
  const NS  = (window.AO3H?.env?.NS) || 'ao3h';
  const SEL = {
    rootLI:        `li.${NS}-root`,
    navlink:       `.${NS}-navlink`,
    menuUL:        `ul.${NS}-menu`,
    topLevelA:     `ul.${NS}-menu > li > a[data-flag]`,
    submenuUL:     `ul.${NS}-submenu`,
  };

// Persisted memory of submenu open state (survives reloads)
const LS_KEY = `${NS}-submenu-state`;
const loadState = ()=> {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(LS_KEY) || '{}'))); }
  catch { return new Map(); }
};
const saveState = (map)=> {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(map))); } catch {}
};
const SUBMENU_STATE = loadState(); // label -> boolean


  // ---- CSS: start closed, no layout jumping, and exact toggle visuals ----
  function injectCSS(){
    if (document.getElementById(`${NS}-grouper-css`)) return;
    const st = document.createElement('style');
    st.id = `${NS}-grouper-css`;
    st.textContent = `
      /* Hide originals we grouped so it looks "moved" */
      ul.${NS}-menu > li[data-ao3h-grouped-original="1"] { display: none !important; }

      /* Submenu as a normal nested list — closed by default */
      ul.${NS}-submenu{
        list-style:none; margin:0; padding:0;
        display:none !important;
        position:static !important; left:auto !important; right:auto !important; top:auto !important;
        background:transparent !important; border:0 !important; box-shadow:none !important; transform:none !important;
      }
      ul.${NS}-submenu.open{ display:block !important; }

      /* Make submenu rows visually identical to top-level rows */
      ul.${NS}-submenu a{
        display:flex !important; align-items:center !important; justify-content:space-between !important;
        gap: var(--${NS}-gap, .75rem) !important; padding:.35rem .75rem !important;
        line-height:1.2 !important; white-space:nowrap !important;
      }
      ul.${NS}-submenu a .${NS}-label{ flex:1 1 auto !important; min-width:0 !important; font-size:12px !important; }

      /* Switch visuals (force exact sizing so it matches top-level) */
      ul.${NS}-submenu a .${NS}-switch{
        flex:0 0 40px !important; width:40px !important; height:12px !important; margin-left:.5rem !important;
        border-radius:12px !important; background: var(--${NS}-switch-off, #aab1bd) !important;
        position:relative !important; box-shadow: inset 2px 2px rgba(0,0,0,.2) !important;
        transition: background .25s ease !important;
      }
      ul.${NS}-submenu a .${NS}-switch::after{
        content:""; position:absolute !important; top:-2px !important; left:-2px !important;
        width:14px !important; height:14px !important; border-radius:20px !important;
        background:#ddd !important; border:1px solid rgba(0,0,0,.1) !important;
        box-shadow: inset 2px 2px rgba(255,255,255,.6), inset -1px -1px rgba(0,0,0,.1) !important;
        transition:left .25s ease !important;
      }
      ul.${NS}-submenu a.${NS}-on .${NS}-switch{
        background: var(--${NS}-switch-on, #22c55e) !important;
      }
      ul.${NS}-submenu a.${NS}-on .${NS}-switch::after{ left: calc(100% - 14px) !important; }

      /* Caret feedback on submenu header */
      .${NS}-caret{ transition: transform .15s ease; }
      li > a[aria-expanded="true"] .${NS}-caret{ transform: rotate(180deg); }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

// ---- submenu builder ----
function createSubmenu(label){
  const li  = document.createElement('li');
  li.setAttribute('data-ao3h-submenu','1');

  const a   = document.createElement('a');
  a.href = '#';
  a.innerHTML = `<span class="${NS}-label">${label}</span><span class="${NS}-caret">▾</span>`;
  a.setAttribute('aria-haspopup','true');
  a.setAttribute('aria-expanded','false');

  const ul  = document.createElement('ul');
  ul.className = `menu dropdown-menu ${NS}-submenu`;
  ul.setAttribute('role','menu');

  // Centralized setter so we can reapply state later
  const setOpen = (next) => {
    ul.classList.toggle('open', !!next);
    a.setAttribute('aria-expanded', String(!!next));
    SUBMENU_STATE.set(label, !!next);
    saveState(SUBMENU_STATE); // <-- persist on every change
  };

  // Restore previous state (default closed)
  if (SUBMENU_STATE.has(label)) {
    setOpen(!!SUBMENU_STATE.get(label));
  }

  const toggle = (force)=>{
    const open = ul.classList.contains('open');
    setOpen(typeof force === 'boolean' ? force : !open);
  };

  a.addEventListener('click', (e)=>{ e.preventDefault(); toggle(); });
  a.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); ul.querySelector('a')?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(false); }
  });
  ul.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowUp' || e.key === 'Escape') { e.preventDefault(); setOpen(false); a.focus(); }
  });

  // ✅ Allow multiple submenus open: only close if clicking outside the entire AO3 Helper menu
  document.addEventListener('pointerdown', (ev)=>{
    const root = document.querySelector(SEL.rootLI); // li.ao3h-root
    if (!root) return;
    const insideRoot = root.contains(ev.target);
    const insideThis = li.contains(ev.target);
    if (!insideRoot) {
      setOpen(false);
    } else if (!insideThis) {
      // Clicked elsewhere inside AO3H menu → leave this one as-is
    }
  });

  li.append(a, ul);
  // expose for reapply step if needed later
  li.__ao3hSetOpen = setOpen;
  return { li, ul, toggle, header:a, setOpen };
}


// ---- group resolver ----
function decideGroup(mod){
  const name = mod?.name || '';
  const title = mod?.meta?.title || name;
  if (mod?.meta?.group) {
    const g = GROUPS.find(G => lc(G.label) === lc(mod.meta.group));
    if (g) return g.label;
  }
  for (const g of GROUPS) {
    if (g.include && g.include.map(lc).includes(lc(name))) return g.label;
    if (g.match && (g.match.test(title) || g.match.test(name))) return g.label;
  }
  return null;
}

// ---- clear build + unhide originals ----
function clearPrevious(menuUL){
  menuUL.querySelectorAll(`li[data-ao3h-submenu="1"]`).forEach(li => {
    const prev = li.previousElementSibling;
    if (prev && prev.classList.contains(`${NS}-divider`) && prev.getAttribute('data-ao3h-submenu') === '1') prev.remove();
    li.remove();
  });
  let originals = [];
  try {
    originals = menuUL.querySelectorAll(`:scope > li[data-ao3h-grouped-original="1"]`);
  } catch {
    originals = Array.from(menuUL.children).filter(el => el.matches(`li[data-ao3h-grouped-original="1"]`));
  }
  originals.forEach(li => li.removeAttribute('data-ao3h-grouped-original'));
}

// ---- build once on open: clone rows (keep data-flag), hide originals ----
function buildOnce(){
  const menuUL = document.querySelector(SEL.menuUL);
  if (!menuUL) return;

  const topAs = Array.from(document.querySelectorAll(SEL.topLevelA));
  if (!topAs.length) return;

  injectCSS();
  clearPrevious(menuUL);

  // flag -> module map
  const mods = (window.AO3H?.modules?.all?.() ?? []);
  const byFlag = new Map();
  for (const m of mods) {
    if (m.enabledKey) byFlag.set(m.enabledKey, m);
    if (m.enabledKeyAlt && m.enabledKeyAlt !== m.enabledKey) byFlag.set(m.enabledKeyAlt, m);
  }

  const groups = new Map();
  function ensureGroup(label){
    if (groups.has(label)) return groups.get(label);
    const { li, ul, toggle, header } = createSubmenu(label);
    const divider = document.createElement('li');
    divider.className = `${NS}-divider`;
    divider.setAttribute('data-ao3h-submenu','1');
    menuUL.appendChild(divider);
    menuUL.appendChild(li);
    groups.set(label, { li, ul, toggle, header });
    return { li, ul, toggle, header };
  }

  for (const a of topAs){
    const li = a.closest('li');
    if (!li) continue;
    const mod = byFlag.get(a.dataset.flag);
    if (!mod) continue;

    const group = decideGroup(mod);
    if (!group) continue; // leave ungrouped at top level

    const { ul } = ensureGroup(group);
    const cloneLI = li.cloneNode(true); // keep data-flag so CSS + delegated clicks work
    ul.appendChild(cloneLI);

    // hide original row so it appears moved
    li.setAttribute('data-ao3h-grouped-original', '1');
  }

  // submenus start closed; restored per SUBMENU_STATE if toggled earlier this session
  // (createSubmenu already restored state when each group was created)
}

// ---- keep clones' on/off classes in sync with flags ----
function syncCloneStates(){
  const flags = window.AO3H?.flags;
  if (!flags) return;
  document.querySelectorAll(`${SEL.submenuUL} a[data-flag]`).forEach(a => {
    const on = !!flags.get(a.dataset.flag, false);
    a.setAttribute('aria-checked', String(on));
    a.classList.toggle(`${NS}-on`, on);
  });
}

// ---- reapply previously saved open/closed state (without rebuilding) ----
function reapplySubmenuState(){
  // walk all our submenus and reapply the remembered state
  const subs = document.querySelectorAll(`li[data-ao3h-submenu="1"]`);
  subs.forEach(li => {
    const header = li.querySelector('a[aria-haspopup="true"]');
    const ul = li.querySelector(`.${NS}-submenu`);
    if (!header || !ul) return;

    const label = header.querySelector(`.${NS}-label`)?.textContent?.trim() || '';
    if (!label) return;

    const shouldBeOpen = !!SUBMENU_STATE.get(label);
    ul.classList.toggle('open', shouldBeOpen);
    header.setAttribute('aria-expanded', String(shouldBeOpen));
  });
}


  // ---- wire up: build on first open; rebuild on AO3H.menu.rebuild; sync on flags ----
  let builtOnce = false;

  function hookOpenOnce(){
  const root = document.querySelector(SEL.rootLI);
  if (!root || root.__ao3hOpenGroupOnce) return;

  // Build exactly once when the menu is first opened
  const buildIfNeeded = ()=> {
    if (builtOnce) return;
    builtOnce = true;
    setTimeout(()=>{ buildOnce(); syncCloneStates(); reapplySubmenuState(); }, 0);
  };

  // On every open/hover/focus, reapply saved submenu states (in case core closed them)
  const reapplyOnOpen = ()=> { setTimeout(reapplySubmenuState, 0); };

  root.addEventListener('mouseenter', buildIfNeeded, { passive:true });
  root.addEventListener('focusin',    buildIfNeeded);
  root.querySelector(SEL.navlink)?.addEventListener('click', buildIfNeeded);

  // Always reapply states when the user re-opens the menu
  root.addEventListener('mouseenter', reapplyOnOpen, { passive:true });
  root.addEventListener('focusin',    reapplyOnOpen);

  root.__ao3hOpenGroupOnce = true;
}


function hookMenuRebuild(){
  const api = window.AO3H?.menu;
  if (api && typeof api.rebuild === 'function' && !api.__ao3hGroupPatch){
    const orig = api.rebuild.bind(api);
    api.rebuild = function(){
      const r = orig();
      builtOnce = false; // next open will rebuild fresh
      const root = document.querySelector(SEL.rootLI);
      if (root && root.classList.contains('open')) {
        setTimeout(()=>{ buildOnce(); syncCloneStates(); reapplySubmenuState(); }, 0);
      }
      return r;
    };
    api.__ao3hGroupPatch = true;
  }
}


  function hookFlagSync(){
    const ns = (window.AO3H?.env?.NS) || 'ao3h';
    // whenever flags change, update clone classes (do not rebuild)
    document.addEventListener(`${ns}:flags-updated`, () => {
      // let menu.js update the DOM first
      setTimeout(syncCloneStates, 0);
    });
  }

  function boot(){
    if (!document.querySelector(SEL.menuUL)) { setTimeout(boot, 100); return; }
    hookOpenOnce();
    hookMenuRebuild();
    hookFlagSync();
  }

  ready(boot);
})();
