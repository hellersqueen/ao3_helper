;(function () {
  'use strict';

  // Page window (for globals exposed by other modules)
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // Base refs
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // How long the top-level menu remains open after the pointer leaves
  const HOVER_CLOSE_DELAY = 280; // ms

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
/* =====================================================================
   AO3 Helper — Glass theme (harmonized)
   (NS: ${NS})
   ===================================================================== */

:root{
  --${NS}-accent:        #c62828;
  --${NS}-fg:            #0b1220;
  --${NS}-fg-dim:        #445069;

  --${NS}-glass-bg:      rgba(255,255,255,.55);
  --${NS}-glass-stroke:  rgba(255,255,255,.45);
  --${NS}-glass-shadow:  0 12px 40px rgba(2,6,23,.22);

  --${NS}-item-bg:       rgba(255,255,255,.75);
  --${NS}-item-hover:    rgba(255,255,255,.54);

  --${NS}-group-fg:      #a12020;

  --${NS}-switch-on:     #0bbf6a;
  --${NS}-switch-off:    rgba(15,23,42,.35);

  --${NS}-radius-lg:     16px;
  --${NS}-radius-md:     12px;

  --${NS}-pad-y:         .55em;
  --${NS}-pad-x:         .9em;
  --${NS}-gap:           .75rem;

  --${NS}-focus-ring:    0 0 0 3px rgba(198,40,40,.25);
}

.${NS}-menu{
  color: var(--${NS}-fg) !important;
  max-width: 280px;
  padding: .5rem .5rem;
}
.${NS}-menu{
  box-shadow:
    0 0 0 1px rgba(255,255,255,.35),
    0 6px 18px rgba(0,0,0,.25),
    0 18px 40px rgba(0,0,0,.15);
}
#header .menu > li{ margin:0 !important; }

.${NS}-menu a{
  display:flex; align-items:center; justify-content:space-between;
  gap: var(--${NS}-gap);
  padding: .5rem .75rem;
  font-size: 13px; line-height: 1.15;
  color: inherit !important; text-decoration: none; white-space: nowrap;
  background: var(--${NS}-item-bg);
  border-radius: var(--${NS}-radius-md);
  transition: background .18s ease, transform .12s ease, box-shadow .18s ease;
  box-shadow: 0 1px 0 rgba(2,6,23,.05);
  margin: 6px 4px;
}
.${NS}-menu a:hover{
  background: var(--${NS}-item-hover) !important;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(2,6,23,.10);
}
.${NS}-menu a:focus{
  outline: none;
  box-shadow: 0 0 0 0 rgba(0,0,0,0), var(--${NS}-focus-ring);
}
.${NS}-label{ flex:1 1 auto; min-width:0; }
.${NS}-kbd{ font-size:12px; color: var(--${NS}-fg-dim); margin-left:.75rem; }
.${NS}-state{ width:1.2em; text-align:center; }

/* Modules as pills */
.${NS}-menu a[data-flag]{
  background: var(--${NS}-item-bg) !important;
  color: var(--${NS}-fg) !important;
  text-transform: none;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--${NS}-radius-md);
  margin: 6px 4px;
  padding: .5rem .75rem;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
.${NS}-menu a[data-flag]:hover{ background: var(--${NS}-item-hover) !important; }

/* Group headers as accent text */
.${NS}-menu > li > a{
  background: transparent !important;
  color: var(--${NS}-group-fg) !important;
  text-transform: uppercase;
  letter-spacing: .25px;
  font-size: 12px !important;
  font-weight: 700;
  margin: 4px 6px 2px;
  padding: .35rem .5rem;
  border: 6px;
  box-shadow: none !important;
}
.${NS}-submenu > li > a .${NS}-caret{ color: inherit; opacity: .9; }
.${NS}-submenu > li > a:hover{ background: rgba(0,0,0,.05) !important; }

.${NS}-menu li{ position: static; }
.${NS}-submenu{
  position: static !important;
  left:auto !important; right:auto !important; top:auto !important;
  margin:0 !important; padding:0 !important; min-width:0 !important;
  list-style:none; display:none !important; visibility:visible !important;
  transform:none !important; z-index:auto;
}
.${NS}-submenu.open{ display: contents !important; }
.${NS}-submenu.dropdown-menu{
  position: static !important; left:auto !important; right:auto !important; top:auto !important;
  margin:0 !important; padding:0 !important; min-width:0 !important;
  border:0 !important; background:transparent !important; box-shadow:none !important; transform:none !important;
}
.${NS}-submenu a{
  display:flex; align-items:center; justify-content:space-between;
  gap: var(--${NS}-gap); padding:.5rem .75rem;
}

.${NS}-divider{ display:none !important; }

.${NS}-switch{
  flex:0 0 42px; width:42px; height:22px; margin-left:.5rem;
  border-radius: 999px;
  background: var(--${NS}-switch-off);
  position: relative;
  transition: background .18s ease;
  box-shadow: inset 0 0 0 1px rgba(2,6,23,.12);
}
.${NS}-switch::after{
  content:""; position:absolute; top:2px; left:2px;
  width:18px; height:18px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(2,6,23,.25);
  transition: left .18s ease;
}
a.${NS}-on .${NS}-switch{ background: var(--${NS}-switch-on); box-shadow: inset 0 0 0 1px rgba(2,6,23,.1); }
a.${NS}-on .${NS}-switch::after{ left: 22px; }

.${NS}-navlink{
  color:#fff; text-decoration:none;
  padding: var(--${NS}-pad-y) var(--${NS}-pad-x);
  display:inline-block; transition: background-color .2s, transform .12s;
  border-radius: 10px;
}
.${NS}-root:hover .${NS}-navlink,
.${NS}-root:focus-within .${NS}-navlink,
.${NS}-root.open .${NS}-navlink{
  background: rgba(255,255,255,.18);
  transform: translateY(-1px);
}

/* Dialog */
#${NS}-ie-dialog::backdrop{ background: rgba(2,6,23,.45); }
#${NS}-ie-dialog{
  border:1px solid rgba(255,255,255,.35);
  border-radius: 14px; padding: 16px 16px 14px;
  width:360px; max-width:90vw;
  background: rgba(255,255,255,.65);
  -webkit-backdrop-filter: blur(12px) saturate(130%);
  backdrop-filter: blur(12px) saturate(130%);
  box-shadow: var(--${NS}-glass-shadow);
  color: var(--${NS}-fg);
}
#${NS}-ie-title{ font-weight:800; margin:0 0 10px; font-size:16px; letter-spacing:.2px; }
#${NS}-ie-desc { margin:0 0 14px; font-size:13px; color: var(--${NS}-fg-dim); }
#${NS}-ie-row{ display:flex; gap:10px; margin-top:8px; }
#${NS}-ie-row button{
  flex:1; padding:10px 12px; border-radius: 12px;
  border:1px solid rgba(255,255,255,.4);
  background: rgba(255,255,255,.75);
  cursor:pointer; font-size:13px;
  transition: transform .12s ease, box-shadow .18s ease, background .18s ease;
}
#${NS}-ie-row button:hover{
  transform: translateY(-1px);
  background: rgba(255,255,255,.95);
  box-shadow: 0 10px 28px rgba(2,6,23,.12);
}
#${NS}-ie-row button[disabled]{ opacity:.6; cursor:not-allowed; filter:saturate(.6); }
#${NS}-ie-foot{ display:flex; justify-content:flex-end; margin-top:10px; }
#${NS}-ie-cancel{
  padding:6px 10px; border-radius: 10px;
  border:1px solid rgba(255,255,255,.35);
  background: rgba(255,255,255,.6);
  cursor:pointer; font-size:12px;
}

/* Dark mode */
@media (prefers-color-scheme: dark){
  .${NS}-menu{
    border: 2px solid rgba(255,255,255,.35) !important;
    box-shadow:
      0 0 0 1px rgba(0,0,0,.6),
      0 8px 20px rgba(0,0,0,.6),
      0 18px 40px rgba(255,255,255,.05);
  }
  .${NS}-menu a[data-flag]:hover,
  .${NS}-submenu > li > a:hover{
    background: rgba(255,255,255,.08) !important;
  }
  #${NS}-ie-dialog{
    background: rgba(16,21,38,.72);
    color: var(--${NS}-fg);
  }
}
`;

  /* ===================== IMPORT/EXPORT DIALOG (Hidden Works) ===================== */
  function ensureIE() {
    let dlg = document.getElementById(`${NS}-ie-dialog`);
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
      tr?.addEventListener('click', async () => {
        try {
          const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
          const hit = mods.find(m => /hidden/i.test(m?.meta?.title || m?.name || ''));
          if (!hit) {
            alert('No module matching “hidden” was found in AO3H.modules.');
            return;
          }
          await M_MODULES.setEnabled(hit.name, true);
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

    const hasExport = (typeof W.ao3hExportHiddenWorks === 'function');
    const hasImport = (typeof W.ao3hImportHiddenWorks === 'function');

    const desc = document.getElementById(`${NS}-ie-desc`);
    desc.textContent = (hasExport || hasImport)
      ? 'Choose what you want to do with your hidden-works list.'
      : 'The Hidden works module is not loaded on this page. Actions enable once the module loads.';

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

  /* ===================== helpers for labels ===================== */
  function moduleNameFromFlagKey(flagKey){
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    const hit  = mods.find(m => m.enabledKey === flagKey || m.enabledKeyAlt === key);
    return hit ? hit.name : null;
  }
  function inferLabelFromRegistry(flagKey){
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    const hit  = mods.find(m => m.enabledKey === flagKey || m.enabledKeyAlt === flagKey);
    return hit?.meta?.title || hit?.name || null;
  }
  function humanizeFromFlag(flagKey){
    // e.g. "mod:readingProgress:enabled" → "Reading Progress"
    const m = /mod:([^:]+):/.exec(flagKey);
    const base = m ? m[1] : String(flagKey);
    const withSpaces = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[\W_]+/g, ' ').trim();
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  }
  function sanitizeLabel(label, flagKey){
    if (typeof label === 'string') {
      const t = label.trim();
      if (t && t.toLowerCase() !== 'true' && t.toLowerCase() !== 'false') return t;
    }
    return inferLabelFromRegistry(flagKey) || humanizeFromFlag(flagKey);
  }

  /* ===================== MENU BUILD (+ API publique) ===================== */
  let M_rootLI, M_toggleEl, M_menuUL;

  // Store custom items; we'll ignore actions when rendering
  const M_customItems = []; // {type:'toggle'|'action'|'sep', label, hint, flagKey, defaultOn, handler}

  function closeAllSubmenus(){
    if (!M_menuUL) return;
    M_menuUL.querySelectorAll(`.${NS}-submenu.open`).forEach(sub => {
      sub.classList.remove('open');
      const toggle = sub.previousElementSibling;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function itemToggle(label, flagKey, current){
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = '#';
    a.dataset.flag = flagKey;
    a.setAttribute('role','menuitemcheckbox');
    a.setAttribute('aria-checked', String(!!current));
    if (current) a.classList.add(`${NS}-on`);
    a.innerHTML = `
      <span class="${NS}-label">${sanitizeLabel(label, flagKey)}</span>
      <span class="${NS}-switch" aria-hidden="true"></span>
    `;
    li.appendChild(a);
    return li;
  }

  function itemAction(label, hint, handler){
    // we still record actions so code calling addAction doesn't break,
    // but we will *not* render them in fillMenu()
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<span class="${NS}-label">${label}</span>${hint ? `<span class="${NS}-kbd">${hint}</span>` : ''}`;
    a.addEventListener('click', (e)=>{ e.preventDefault(); handler?.(); });
    li.appendChild(a);
    return li;
  }
  function itemDivider(){
    const li = document.createElement('li');
    li.className = `${NS}-divider`;
    return li;
  }

  function itemSubmenu(label, buildChildren){
    const li  = document.createElement('li');

    const a   = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<span class="${NS}-label">${label}</span><span class="${NS}-caret">▾</span>`;
    a.setAttribute('aria-haspopup','true');
    a.setAttribute('aria-expanded','false');

    const sub = document.createElement('ul');
    sub.className = `menu dropdown-menu ${NS}-submenu`;
    sub.setAttribute('role','menu');

    buildChildren(sub);

    const maybeAlignRight = () => {
      const r = a.getBoundingClientRect();
      const willOverflowRight = (r.left + 240) > (window.innerWidth - 12);
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
    a.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(true); sub.querySelector('a')?.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); toggle(true); sub.querySelector('a')?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); toggle(false); }
    });
    sub.addEventListener('keydown', (e)=>{
      if (e.key === 'ArrowUp' || e.key === 'Escape') { e.preventDefault(); toggle(false); a.focus(); }
    });

    document.addEventListener('pointerdown', (ev)=>{ if (!li.contains(ev.target)) toggle(false); });

    li.append(a, sub);
    return li;
  }

  function fillMenu(){
    M_menuUL.innerHTML = '';

    // 1) Auto toggles for registered modules (label sanitized)
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    if (mods.length){
      for (const { name, meta, enabledKey } of mods){
        const lbl = sanitizeLabel(meta?.title || name, enabledKey);
        const onNow = !!M_FLAGS.get(enabledKey, !!meta?.enabledByDefault);
        M_menuUL.appendChild(itemToggle(lbl, enabledKey, onNow));
      }
    } else {
      // No modules? show nothing (or a note)
      const li = document.createElement('li');
      li.innerHTML = `<a><span class="${NS}-label">No modules registered</span></a>`;
      M_menuUL.appendChild(li);
    }

    // 2) Separator
    M_menuUL.appendChild(itemDivider());

    // 3) Custom items added by other scripts
    //    👉 We deliberately ignore ACTIONS here so only toggles appear.
    for (const it of M_customItems){
      if (it.type === 'sep') { M_menuUL.appendChild(itemDivider()); continue; }
      if (it.type === 'toggle'){
        const onNow = !!M_FLAGS.get(it.flagKey, !!it.defaultOn);
        M_menuUL.appendChild(itemToggle(sanitizeLabel(it.label, it.flagKey), it.flagKey, onNow));
        continue;
      }
      // if (it.type === 'action') { /* skip on purpose */ }
    }

    // 4) Manage submenu (always present)
    const manageSep = itemDivider();
    manageSep.classList.add(`${NS}-manage-sep`);
    M_menuUL.appendChild(manageSep);

    const manage = itemSubmenu('Manage', (sub) => {
      sub.appendChild(itemAction('Hidden tags…', '', () => {
        document.dispatchEvent(new CustomEvent(`${NS}:open-hide-manager`));
      }));
      sub.appendChild(itemAction('Hidden works…', 'Import / Export', () => {
        openIE();
      }));
    });
    manage.classList.add(`${NS}-manage-tail`);
    M_menuUL.appendChild(manage);
  }

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
    M_on(M_rootLI, 'mouseleave', () => closeMenu({ defer:true }));
    M_on(M_rootLI, 'focusin', openMenu);
    M_on(M_rootLI, 'focusout', (e)=>{ if(!M_rootLI.contains(e.relatedTarget)) closeMenu(); });

    M_toggleEl.style.pointerEvents = 'auto';
    M_on(M_toggleEl, 'click', (e)=>{ 
      e.preventDefault(); 
      M_rootLI.classList.contains('open') ? closeMenu() : openMenu(); 
    });

    M_on(M_menuUL, 'keydown', (e)=>{
      const items = Array.from(M_menuUL.querySelectorAll('a'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown'){ e.preventDefault(); (items[i+1]||items[0])?.focus(); }
      if (e.key === 'ArrowUp'){ e.preventDefault(); (items[i-1]||items[items.length-1])?.focus(); }
      if (e.key === 'Home'){ e.preventDefault(); items[0]?.focus(); }
      if (e.key === 'End'){ e.preventDefault(); items[items.length-1]?.focus(); }
    });

    M_on(M_menuUL, 'click', async (e)=>{
      const a = e.target.closest('a[data-flag]');
      if (!a) return;
      e.preventDefault();

      const key  = a.dataset.flag;

      const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
      const hit  = mods.find(m => m.enabledKey === key || m.enabledKeyAlt === key);

      const next = !M_FLAGS.get(key, false);

      try {
        if (hit) {
          await M_MODULES.setEnabled(hit.name, next);
        } else {
          await M_FLAGS.set(key, next);
        }
      } catch (err) {
        console.error('[AO3H][menu] toggle failed', key, err);
      }

      a.setAttribute('aria-checked', String(next));
      a.classList.toggle(`${NS}-on`, next);

      try {
        document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`, { detail: { key, value: next } }));
      } catch {}
    });

    M_on(document, 'click', (e)=>{ if (!M_rootLI.contains(e.target)) closeMenu(); });
    M_on(document, 'keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    fillMenu();

    // --- Keep "Manage" last by intercepting appends to this UL only ---
    (function installBottomGuard(ul){
      if (!ul || ul.__ao3hBottomGuard) return;

      const isBottom = (node) =>
        node && node.nodeType === 1 &&
        node.matches?.(`li.${NS}-manage-tail, li.${NS}-manage-sep`);

      const anchor = () => ul.querySelector(`li.${NS}-manage-tail`);

      const _appendChild     = ul.appendChild.bind(ul);
      const _insertBefore    = ul.insertBefore.bind(ul);
      const _append          = ul.append?.bind(ul);
      const _replaceChildren = ul.replaceChildren?.bind(ul);

      ul.appendChild = function(node){
        const m = anchor();
        if (m && !isBottom(node)) return _insertBefore(node, m);
        return _appendChild(node);
      };

      if (_append) {
        ul.append = function(...nodes){
          nodes.forEach(n => {
            if (typeof n === 'string') n = document.createTextNode(n);
            this.appendChild(n);
          });
        };
      }

      ul.insertBefore = function(node, refNode){
        if (refNode == null) return this.appendChild(node);
        return _insertBefore(node, refNode);
      };

      if (_replaceChildren) {
        ul.replaceChildren = function(...nodes){
          _replaceChildren(...nodes);
          const sep = this.querySelector(`li.${NS}-manage-sep`);
          const m   = this.querySelector(`li.${NS}-manage-tail`);
          if (sep) this.appendChild(sep);
          if (m)   this.appendChild(m);
        };
      }

      ul.__ao3hBottomGuard = true;
    })(M_menuUL);
  }

  // ✅ addToggle: supports legacy + explicit signatures; actions hidden at render
  function addToggle(flagKey, labelOrDefault, maybeDefault){
    // Supported:
    //   addToggle(flagKey, true)                      → defaultOn=true, label inferred
    //   addToggle(flagKey, "Nice Label", true/false) → explicit label + default
    //   addToggle(flagKey, "Nice Label")             → explicit label, defaultOff
    let defaultOn = false;
    let label     = '';

    if (typeof labelOrDefault === 'boolean' && typeof maybeDefault === 'undefined') {
      defaultOn = labelOrDefault;
      label = null; // force inference below
    } else {
      label     = (labelOrDefault == null) ? '' : String(labelOrDefault);
      defaultOn = !!maybeDefault;
    }

    const cleanLabel = sanitizeLabel(label, flagKey);

    M_customItems.push({
      type:'toggle',
      flagKey,
      label: cleanLabel,
      defaultOn,
      moduleName: moduleNameFromFlagKey(flagKey)
    });
    if (M_menuUL) fillMenu();
  }

  function addAction(label, handler, hint=''){
    // record but we won't render actions in fillMenu()
    M_customItems.push({ type:'action', label, handler, hint });
    // no fillMenu() call needed since it won't show anyway, but harmless if left:
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
