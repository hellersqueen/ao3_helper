;(function () {
  'use strict';

  // Page window (for globals exposed by other modules)
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // Base refs
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

// How long the top-level menu remains open after the pointer leaves
const HOVER_CLOSE_DELAY = 250; // ms (tweak to taste)


  // Local helpers (compatible with your core util)
  const M_$  = (AO3H.util && AO3H.util.$)  || ((s,r=document)=>r.querySelector(s));
  const M_on = (AO3H.util && AO3H.util.on) || ((el,e,cb,o)=>el&&el.addEventListener(e,cb,o));
  const M_onReady = (AO3H.util && AO3H.util.onReady) || (fn => (document.readyState==='loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn());

  // CSS injector (tagged template OR raw string)
  function M_injectCSS(first, ...rest){
    let cssText = '';
    if (Array.isArray(first) && Object.prototype.hasOwnProperty.call(first, 'raw')) {
      const strings = first, vals = rest;
      cssText = strings.map((s,i)=> s + (i<vals.length ? vals[i] : '')).join('');
    } else {
      cssText = String(first ?? '');
    }
    try { if (typeof GM_addStyle === 'function') { GM_addStyle(cssText); return; } } catch {}
    const el = document.createElement('style');
    el.textContent = cssText;
    (document.head || document.documentElement).appendChild(el);
  }

  // Direct access to flags/modules
  const M_FLAGS   = AO3H.flags;
  const M_MODULES = AO3H.modules;

  /* ========== Base menu + Import/Export dialog ========== */
  M_injectCSS`
    :root{
      --${NS}-gap: .75rem;
      --${NS}-pad-y: .5em;
      --${NS}-pad-x: .8em;
      --${NS}-ring: 2px solid rgba(255,255,255,.6);
    }
      
    #header .menu > li{
    margin: 0 !important;
  }



    .${NS}-navlink{
      color:#fff;
      text-decoration:none;
      padding:var(--${NS}-pad-y) var(--${NS}-pad-x);
      display:inline-block;
      transition:background-color .2s;
      cursor:default;
      pointer-events:none; /* hover to open; not clickable */
      outline:0;
    }
    .${NS}-root:hover .${NS}-navlink,
    .${NS}-root:focus-within .${NS}-navlink,
    .${NS}-root.open .${NS}-navlink{
      background-color: rgba(255,255,255,0.15);
      text-decoration:none;
    }

    .${NS}-menu{ min-width:260px; }
    .${NS}-menu a{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:var(--${NS}-gap);
      padding:.35rem .75rem;
    }
    .${NS}-menu a:focus{ outline: var(--${NS}-ring); outline-offset: -2px; }
    .${NS}-label{ flex:1; }
    .${NS}-state{ width:1.2em; text-align:center; }
    .${NS}-kbd{ font-size:12px; color:#666; margin-left:.75rem; }
    .${NS}-divider{ border-top:1px solid #ddd; margin:.35rem .25rem; }

    #${NS}-ie-dialog::backdrop { background: rgba(0,0,0,.35); }
    #${NS}-ie-dialog{
      border:1px solid #bfc7cf; border-radius:10px; padding:16px 16px 14px;
      width:340px; max-width:90vw; box-shadow:0 10px 30px rgba(0,0,0,.2); background:#fff;
    }
    #${NS}-ie-title{ font-weight:700; margin:0 0 10px; font-size:16px; }
    #${NS}-ie-desc { margin:0 0 14px; font-size:13px; color:#444; }
    #${NS}-ie-row{ display:flex; gap:10px; margin-top:8px; }
    #${NS}-ie-row button{
      flex:1; padding:10px 12px; border-radius:8px; border:1px solid #bfc7cf; background:#e7edf3; cursor:pointer; font-size:13px;
    }
    #${NS}-ie-row button:hover{ filter:brightness(.98); }
    #${NS}-ie-foot{ display:flex; justify-content:flex-end; margin-top:10px; }
    #${NS}-ie-cancel{
      padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#f7f7f7; cursor:pointer; font-size:12px;
    }
  `;

/* ========== Submenu (Manage ▾) — inline, same style as main menu ========== */
M_injectCSS`
  /* Keep normal flow: no absolute positioning */
  .${NS}-menu li { position: static; }

  /* The submenu container disappears from layout when closed,
     and becomes a "pass-through" when open so its <li>s behave
     like siblings of other menu items. */
  .${NS}-submenu{
    position: static !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    min-width: 0 !important;
    list-style: none;
    display: none !important;        /* hidden by default */
    visibility: visible !important;  /* ensure earlier rules don't hide children */
    transform: none !important;
    z-index: auto;
  }
  .${NS}-submenu.open{
    display: contents !important;    /* flatten: children render inline with menu */
  }

  /* Rows inside submenu inherit the exact same styling as .${NS}-menu a,
     but if you want a subtle indent, keep this; otherwise remove it. */
  .${NS}-submenu a{
    display:flex; align-items:center; justify-content:space-between;
    gap: var(--${NS}-gap); padding:.35rem .75rem;
  }
  .${NS}-submenu a .${NS}-label{ padding-left: .75rem; } /* optional indent */

  /* Caret feedback (flip when expanded) */
  .${NS}-caret{ transition: transform .15s ease; }
  li > a[aria-expanded="true"] .${NS}-caret{ transform: rotate(180deg); }
`;

/* === Make Manage submenu inherit normal menu hover, without changing layout === */
M_injectCSS`
  /* Keep submenu in normal flow; only show when .open */
  .${NS}-menu li { position: static; }
  .${NS}-submenu{
    display: none !important;
  }
  .${NS}-submenu.open{
    display: contents !important;   /* children render like normal menu rows */
  }

  /* Neutralize .dropdown-menu container layout so it doesn't float/transform */
  .${NS}-submenu.dropdown-menu{
    position: static !important;
    left: auto !important; right: auto !important; top: auto !important;
    margin: 0 !important; padding: 0 !important; min-width: 0 !important;
    border: 0 !important; background: transparent !important; box-shadow: none !important;
    transform: none !important;
  }
`;


  /* ========== Toggle switch visuals (green ON, grey OFF) ========== */
  M_injectCSS`
    :root{
      --${NS}-switch-on:  #22c55e;
      --${NS}-switch-off: #aab1bd;
    }
    .${NS}-menu a{ align-items:center; }
    .${NS}-label{ flex:1 1 auto; min-width:0; font-size: 12px; }
    .${NS}-switch{ margin-left:.75rem; flex:0 0 40px; }

    .${NS}-switch{
      width:40px; height:16px;
      border-radius:16px;
      background:var(--${NS}-switch-off);
      position:relative;
      box-shadow: inset 2px 2px rgba(0,0,0,.2);
      transition: background .25s ease;
    }
    .${NS}-switch::after{
      content:"";
      position:absolute; top:-2px; left:-2px;
      width:18px; height:18px; border-radius:20px;
      background:#ddd;
      border:1px solid rgba(0,0,0,.1);
      box-shadow: inset 2px 2px rgba(255,255,255,.6), inset -1px -1px rgba(0,0,0,.1);
      transition: left .25s ease;
    }
    a.${NS}-on .${NS}-switch{ background:var(--${NS}-switch-on); }
    a.${NS}-on .${NS}-switch::after{ left: calc(100% - 18px); }

    .${NS}-menu a[data-flag] .${NS}-switch{
      background-image:none !important;
      background-color: var(--${NS}-switch-off) !important;
    }
    .${NS}-menu a.${NS}-on .${NS}-switch{
      background-image:none !important;
      background-color: var(--${NS}-switch-on) !important;
    }
  #${NS}-ie-row button[disabled]{
    opacity:.6; cursor:not-allowed; filter:saturate(.5);
  }
    .${NS}-menu a:focus-visible .${NS}-switch{
      outline:2px solid rgba(255,255,255,.7); outline-offset:2px;
    }
  `;
  M_injectCSS`
    .${NS}-menu a[data-flag] .${NS}-switch{ background-color: var(--${NS}-switch-off) !important; background-image:none !important; }
    .${NS}-menu a.${NS}-on .${NS}-switch{ background-color: var(--${NS}-switch-on) !important; }
  `;
  M_injectCSS`
    .${NS}-menu > li > a{
      display:flex !important;
      align-items:center !important;
      justify-content:space-between !important;
      gap: var(--${NS}-gap) !important;
      line-height: 1.2 !important;
      white-space: nowrap;
    }
    .${NS}-label{ flex: 1 1 auto !important; min-width: 0; }
    .${NS}-switch{
      flex: 0 0 40px !important;
      width: 40px !important;
      height: 12px !important;
      margin-left: .5rem !important;
      border-radius: 12px;
      background: var(--${NS}-switch-off);
      position: relative;
      box-shadow: inset 2px 2px rgba(0,0,0,.2);
      transition: background .3s ease;
    }
    .${NS}-switch::after{
      content: "";
      position: absolute;
      top: -2px;
      left: -2px;
      width: 14px; height: 14px;
      border-radius: 20px;
      background: #ddd;
      border: 1px solid rgba(0,0,0,.1);
      box-shadow: inset 2px 2px rgba(255,255,255,.6), inset -1px -1px rgba(0,0,0,.1);
      transition: left .3s ease;
    }
    .${NS}-menu a.${NS}-on .${NS}-switch::after{ left: calc(100% - 14px); }
    @media (prefers-color-scheme: dark){ :root{ --${NS}-switch-off:#7a8699; } }
  `;

  /* ===================== IMPORT/EXPORT DIALOG (Hidden Works) ===================== */
function ensureIE() {
  let dlg = document.getElementById(`${NS}-ie-dialog`);
  const build = !dlg;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = `${NS}-ie-dialog`;
    dlg.innerHTML = `
      <form method="dialog" style="margin:0">
        <h3 id="${NS}-ie-title">Hidden works</h3>
        <p id="${NS}-ie-desc"></p>
        <div id="${NS}-ie-row">
          <button type="button" id="${NS}-ie-export">Export JSON</button>
          <button type="button" id="${NS}-ie-import">Import JSON</button>
          <button type="button" id="${NS}-ie-try" style="display:none">Try enable module</button>
        </div>
        <div id="${NS}-ie-foot"><button id="${NS}-ie-cancel">Close</button></div>
      </form>`;
    (document.body || document.documentElement).appendChild(dlg);

    const get = (id)=> document.getElementById(id);
    const ex = get(`${NS}-ie-export`);
    const im = get(`${NS}-ie-import`);
    const tr = get(`${NS}-ie-try`);
    const cancel = get(`${NS}-ie-cancel`);

    ex?.addEventListener('click', () => {
      if (typeof W.ao3hExportHiddenWorks === 'function') {
        try { W.ao3hExportHiddenWorks(); } finally { dlg.close(); }
      }
    });
    im?.addEventListener('click', () => {
      if (typeof W.ao3hImportHiddenWorks === 'function') {
        try { W.ao3hImportHiddenWorks(); } finally { dlg.close(); }
      }
    });
    // Attempt to find & enable a module with “hidden” in its name/title.
    tr?.addEventListener('click', async () => {
      try {
        const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
        const hit = mods.find(m => /hidden/i.test(m?.meta?.title || m?.name || ''));
        if (!hit) {
          alert('No module matching “hidden” was found in AO3H.modules.');
          return;
        }
        await M_MODULES.setEnabled(hit.name, true);
        // Re-sync dialog state after enabling
        ensureIE();
        alert(`Enabled: ${hit.meta?.title || hit.name}`);
      } catch (e) {
        console.error('[AO3H] enable hidden module failed', e);
        alert('Failed to enable module. See console for details.');
      }
    });

    cancel?.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  }

  // (Re)sync UI state each time
  const hasExport = (typeof W.ao3hExportHiddenWorks === 'function');
  const hasImport = (typeof W.ao3hImportHiddenWorks === 'function');

  const desc = document.getElementById(`${NS}-ie-desc`);
  desc.textContent = (hasExport || hasImport)
    ? 'Choose what you want to do with your hidden-works list.'
    : 'The Hidden works module is not loaded on this page. You can still open this manager; actions will enable once the module loads.';

  const exBtn = document.getElementById(`${NS}-ie-export`);
  const imBtn = document.getElementById(`${NS}-ie-import`);
  const tryBtn = document.getElementById(`${NS}-ie-try`);

  if (exBtn) exBtn.disabled = !hasExport;
  if (imBtn) imBtn.disabled = !hasImport;
  if (tryBtn) tryBtn.style.display = (hasExport || hasImport) ? 'none' : 'inline-block';

  return true;
}


function openIE() {
  ensureIE();
  const dlg = document.getElementById(`${NS}-ie-dialog`);
  try { dlg.showModal(); } catch { dlg.setAttribute('open',''); }
}


  /* ===================== MENU BUILD (+ API publique) ===================== */
  let M_rootLI, M_toggleEl, M_menuUL;

  function closeAllSubmenus(){
    if (!M_menuUL) return;
    M_menuUL.querySelectorAll(`.${NS}-submenu.open`).forEach(sub => {
      sub.classList.remove('open');
      const toggle = sub.previousElementSibling;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  const M_customItems = []; // {type:'toggle'|'action'|'sep', label, hint, flagKey, defaultOn, handler}

  function itemToggle(label, flagKey, current){
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = '#';
    a.dataset.flag = flagKey;
    a.setAttribute('role','menuitemcheckbox');
    a.setAttribute('aria-checked', String(!!current));
    if (current) a.classList.add(`${NS}-on`);

    a.innerHTML = `
      <span class="${NS}-label">${label}</span>
      <span class="${NS}-switch" aria-hidden="true"></span>
    `;

    li.appendChild(a);
    return li;
  }

  function itemAction(label, hint, handler){
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<span class="${NS}-label">${label}</span>${hint ? `<span class="${NS}-kbd">${hint}</span>` : ''}`;
    M_on(a, 'click', (e)=>{ e.preventDefault(); handler?.(); closeMenu(); });
    li.appendChild(a);
    return li;
  }
  function itemDivider(){
    const li = document.createElement('li');
    li.className = `${NS}-divider`;
    return li;
  }

  // Submenu builder for "Manage ▸" — CLICK ONLY, starts closed
function itemSubmenu(label, buildChildren){
  const li  = document.createElement('li');

  const a   = document.createElement('a');
  a.href = '#';
  a.innerHTML = `<span class="${NS}-label">${label}</span><span class="${NS}-caret">▾</span>`;
  a.setAttribute('aria-haspopup','true');
  a.setAttribute('aria-expanded','false');

   const sub = document.createElement('ul');
sub.className = `menu dropdown-menu ${NS}-submenu`; // inherit site hover styles
  sub.setAttribute('role','menu');

  buildChildren(sub);

  // Helper: if near right edge, align submenu to the right
  const maybeAlignRight = () => {
    const r = a.getBoundingClientRect();
    const willOverflowRight = (r.left + 240) > (window.innerWidth - 12); // 240 ≈ min-width + padding
    sub.classList.toggle(`${NS}-align-right`, !!willOverflowRight);
  };

  const toggle = (force) => {
    const isOpen = sub.classList.contains('open');
    const next = (typeof force === 'boolean') ? force : !isOpen;
    if (next) { maybeAlignRight(); }
    sub.classList.toggle('open', next);
    a.setAttribute('aria-expanded', String(next));
  };

  a.addEventListener('click', (e)=>{ e.preventDefault(); toggle(); });

  // keyboard: Enter/Space open; ArrowDown opens & focuses first item; ArrowUp closes
  a.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(true); sub.querySelector('a')?.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); toggle(true); sub.querySelector('a')?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); toggle(false); }
  });
  sub.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowUp' || e.key === 'Escape') { e.preventDefault(); toggle(false); a.focus(); }
  });

  // clicking outside closes it
  document.addEventListener('pointerdown', (ev)=>{ if (!li.contains(ev.target)) toggle(false); });

  li.append(a, sub);
  return li;
}


function fillMenu(){
  M_menuUL.innerHTML = '';

  // 1) Auto toggles for registered modules
  const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
  if (mods.length){
    for (const { name, meta, enabledKey } of mods){
      const onNow = !!M_FLAGS.get(enabledKey, !!meta?.enabledByDefault);
      M_menuUL.appendChild(itemToggle(meta?.title || name, enabledKey, onNow));
    }
  } else {
    M_menuUL.appendChild(itemAction('No modules registered', '', ()=>{}));
  }

  // 2) Separator
  M_menuUL.appendChild(itemDivider());

  // 3) Custom items added by other scripts
  for (const it of M_customItems){
    if (it.type === 'sep') { M_menuUL.appendChild(itemDivider()); continue; }
    if (it.type === 'toggle'){
      const onNow = !!M_FLAGS.get(it.flagKey, !!it.defaultOn);
      M_menuUL.appendChild(itemToggle(it.label, it.flagKey, onNow));
      continue;
    }
    if (it.type === 'action'){
      M_menuUL.appendChild(itemAction(it.label, it.hint, it.handler));
      continue;
    }
  }

  // 4) Manage submenu (at the very end)
  M_menuUL.appendChild(itemDivider());
  const manage = itemSubmenu('Manage', (sub) => {
    // Hidden tags manager
    sub.appendChild(itemAction('Hidden tags…', '', () => {
      document.dispatchEvent(new CustomEvent(`${NS}:open-hide-manager`));
    }));
    // Hidden works dialog — always available
    sub.appendChild(itemAction('Hidden works…', 'Import / Export', () => {
      openIE(); // ensureIE() will handle disabled buttons + message
    }));
  });
  M_menuUL.appendChild(manage);
} // <-- closes fillMenu

// === Hover-close delay implementation ===
let M_closeTimer = null;

function cancelCloseTimer(){
  if (M_closeTimer){ clearTimeout(M_closeTimer); M_closeTimer = null; }
}

function openMenu(){
  cancelCloseTimer();
  M_rootLI.classList.add('open');
  M_toggleEl.setAttribute('aria-expanded','true');
}

function closeMenu(opts = {}){
  const { defer = false, delay = HOVER_CLOSE_DELAY } = opts;

  if (defer){
    cancelCloseTimer();
    M_closeTimer = setTimeout(() => closeMenu({ defer:false }), delay);
    return;
  }

  cancelCloseTimer();
  closeAllSubmenus();
  M_rootLI.classList.remove('open');
  M_toggleEl.setAttribute('aria-expanded','false');
}

function buildMenu(){
  if (document.querySelector(`li.${NS}-root`)) return;

  M_rootLI = document.createElement('li');
  M_rootLI.className = `dropdown ${NS}-root`;
  M_rootLI.setAttribute('aria-haspopup', 'true');
  M_rootLI.tabIndex = 0;

  M_toggleEl = document.createElement('span');
  M_toggleEl.className = `${NS}-navlink`;
  M_toggleEl.textContent = 'AO3 Helper';
  M_toggleEl.setAttribute('aria-hidden', 'true');

  M_menuUL = document.createElement('ul');
  M_menuUL.className = `menu dropdown-menu ${NS}-menu`;
  M_menuUL.setAttribute('role', 'menu');

  M_rootLI.append(M_toggleEl, M_menuUL);

  const navUL =
    M_$('ul.primary.navigation.actions') ||
    M_$('#header .primary.navigation ul') ||
    M_$('#header .navigation ul');

  if (navUL) {
    navUL.insertBefore(M_rootLI, navUL.firstChild);
  } else {
    const floater = document.createElement('div');
    floater.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:999999;';
    floater.appendChild(M_rootLI);
    (document.body || document.documentElement).appendChild(floater);
  }

  // top-level menu keeps hover behavior (submenu is click-only)
  M_on(M_rootLI, 'mouseenter', openMenu);
  M_on(M_rootLI, 'mouseleave', () => closeMenu({ defer:true })); // delayed close
  M_on(M_rootLI, 'focusin', openMenu);
  // keep keyboard behavior immediate so it feels snappy/accessible
  M_on(M_rootLI, 'focusout', (e)=>{ if(!M_rootLI.contains(e.relatedTarget)) closeMenu(); });

  // allow clicking the label to toggle open/close
  M_toggleEl.style.pointerEvents = 'auto';
  M_on(M_toggleEl, 'click', (e)=>{ 
    e.preventDefault(); 
    M_rootLI.classList.contains('open') ? closeMenu() : openMenu(); 
  });

  // keyboard nav inside menu
  M_on(M_menuUL, 'keydown', (e)=>{
    const items = Array.from(M_menuUL.querySelectorAll('a'));
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown'){ e.preventDefault(); (items[i+1]||items[0])?.focus(); }
    if (e.key === 'ArrowUp'){ e.preventDefault(); (items[i-1]||items[items.length-1])?.focus(); }
    if (e.key === 'Home'){ e.preventDefault(); items[0]?.focus(); }
    if (e.key === 'End'){ e.preventDefault(); items[items.length-1]?.focus(); }
  });

  // click-to-toggle switches (apply instantly)
  M_on(M_menuUL, 'click', async (e)=>{
    const a = e.target.closest('a[data-flag]');
    if (!a) return;
    e.preventDefault();

    const key  = a.dataset.flag;

    // Figure out if this flag belongs to a known module (canonical or alt key)
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    const hit  = mods.find(m => m.enabledKey === key || m.enabledKeyAlt === key);

    // Derive next value from current flag state
    const next = !M_FLAGS.get(key, false);

    try {
      if (hit) {
        // Route through module API so it boots/stops immediately and syncs both keys
        await M_MODULES.setEnabled(hit.name, next);
      } else {
        // Not a registered module toggle → just set the flag
        await M_FLAGS.set(key, next);
      }
    } catch (err) {
      console.error('[AO3H][menu] toggle failed', key, err);
    }

    // Update the UI switch immediately
    a.setAttribute('aria-checked', String(next));
    a.classList.toggle(`${NS}-on`, next);

    // Broadcast so any listeners can react
    try {
      document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`, { detail: { key, value: next } }));
    } catch {}
  });

  // outside clicks & Escape stay immediate
  M_on(document, 'click', (e)=>{ if (!M_rootLI.contains(e.target)) closeMenu(); });
  M_on(document, 'keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

  fillMenu();
} // <-- closes buildMenu


  // Helper: map flagKey → module name (by matching current registry)
  function moduleNameFromFlagKey(flagKey){
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    const hit  = mods.find(m => m.enabledKey === flagKey || m.enabledKeyAlt === flagKey);
    return hit ? hit.name : null;
  }

  function addToggle(flagKey, label, defaultOn=false){
    const moduleName = moduleNameFromFlagKey(flagKey);
    M_customItems.push({
      type:'toggle',
      flagKey,
      label,
      defaultOn,
      // renderer uses the list only; actual click is handled globally above
      moduleName
    });
    if (M_menuUL) fillMenu();
  }

  function addAction(label, handler, hint=''){
    M_customItems.push({ type:'action', label, handler, hint });
    if (M_menuUL) fillMenu();
  }

  function addSeparator(){
    M_customItems.push({ type:'sep' });
    if (M_menuUL) fillMenu();
  }

  function rebuild(){ if (M_menuUL) fillMenu(); }

  AO3H.menu = { addToggle, addAction, addSeparator, rebuild };

  /* ===================== Boot & live sync ===================== */
  M_onReady(()=>{
    try {
      buildMenu();

      // Keep switch UI in sync if flags change elsewhere
      document.addEventListener(`${NS}:flags-updated`, () => {
        if (!M_menuUL) return;
        const get = (k)=> M_FLAGS.get ? M_FLAGS.get(k, false) : false;
        M_menuUL.querySelectorAll('a[data-flag]').forEach(a => {
          const on = !!get(a.dataset.flag);
          a.setAttribute('aria-checked', String(on));
          a.classList.toggle(`${NS}-on`, on);
        });
      });

      try {
        GM_registerMenuCommand?.('AO3 Helper — Open', ()=> {
          const tab = document.querySelector(`li.${NS}-root`);
          tab?.dispatchEvent(new Event('mouseenter'));
        });
      } catch {}
    } catch (err) {
      console.error('[AO3H][menu] build failed', err);
    }
  });

})();
