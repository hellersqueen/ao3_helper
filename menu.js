// ==UserScript==
// @name         AO3 Helper - Menu (Header Dropdown, Robust CSS, Fixed)
// @namespace    ao3h
// @version      1.2.2
// @description  Onglet AO3 Helper dans l’entête: toggles auto + API, injecteur CSS compatible.
// @match        https://archiveofourown.org/*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

;(function () {
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // --- Helpers locaux robustes (ne dépendent pas du core) ---
  const $  = (AO3H.util && AO3H.util.$)  || ((s,r=document)=>r.querySelector(s));
  const on = (AO3H.util && AO3H.util.on) || ((el,e,cb,o)=>el&&el.addEventListener(e,cb,o));
  const onReady = (AO3H.util && AO3H.util.onReady) || (fn => (document.readyState==='loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn());

  // Injecteur CSS compatible (tagged template OU string)
  function injectCSS(first, ...rest){
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

  // ❗️Déclarées UNE seule fois
  const Flags   = AO3H.flags;
  const Modules = AO3H.modules;

  /* ============================== STYLES ============================== */
  injectCSS`
  :root{
    --${NS}-gap: .75rem;
    --${NS}-pad-y: .5em;
    --${NS}-pad-x: .8em;
    --${NS}-ring: 2px solid rgba(255,255,255,.6);
  }
  .${NS}-navlink{
    color:#fff; text-decoration:none; padding:var(--${NS}-pad-y) var(--${NS}-pad-x);
    display:inline-block; transition:background-color .2s; cursor:default; pointer-events:none; outline:0;
  }
  .${NS}-root:hover .${NS}-navlink,
  .${NS}-root:focus-within .${NS}-navlink,
  .${NS}-root.open .${NS}-navlink{ background-color: rgba(255,255,255,0.15); text-decoration:none; }

  .${NS}-menu{ min-width:260px; }
  .${NS}-menu a{ display:flex; align-items:center; justify-content:space-between; gap:var(--${NS}-gap); padding:.35rem .75rem; }
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
  #${NS}-ie-row button{ flex:1; padding:10px 12px; border-radius:8px; border:1px solid #bfc7cf; background:#e7edf3; cursor:pointer; font-size:13px; }
  #${NS}-ie-row button:hover{ filter:brightness(.98); }
  #${NS}-ie-foot{ display:flex; justify-content:flex-end; margin-top:10px; }
  #${NS}-ie-cancel{ padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#f7f7f7; cursor:pointer; font-size:12px; }
  `;

  /* ===================== IMPORT/EXPORT (optionnel) ===================== */
  function ensureIE() {
    if (!window.ao3hExportHiddenWorks && !window.ao3hImportHiddenWorks) return false;
    if (document.getElementById(`${NS}-ie-dialog`)) return true;

    const dlg = document.createElement('dialog');
    dlg.id = `${NS}-ie-dialog`;
    dlg.innerHTML = `
      <form method="dialog" style="margin:0">
        <h3 id="${NS}-ie-title">Hidden works</h3>
        <p id="${NS}-ie-desc">Choose what you want to do with your hidden-works list.</p>
        <div id="${NS}-ie-row">
          ${window.ao3hExportHiddenWorks ? `<button type="button" id="${NS}-ie-export">Export JSON</button>` : ``}
          ${window.ao3hImportHiddenWorks ? `<button type="button" id="${NS}-ie-import">Import JSON</button>` : ``}
        </div>
        <div id="${NS}-ie-foot"><button id="${NS}-ie-cancel">Close</button></div>
      </form>`;
    (document.body || document.documentElement).appendChild(dlg);

    const get = (id)=> document.getElementById(id);
    const ex = get(`${NS}-ie-export`);
    const im = get(`${NS}-ie-import`);
    if (ex) ex.addEventListener('click', () => { window.ao3hExportHiddenWorks(); dlg.close(); });
    if (im) im.addEventListener('click', () => { window.ao3hImportHiddenWorks(); dlg.close(); });
    get(`${NS}-ie-cancel`).addEventListener('click', () => dlg.close());

    dlg.addEventListener('click', (e) => {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });

    return true;
  }
  function openIE() {
    if (!ensureIE()) return;
    const dlg = document.getElementById(`${NS}-ie-dialog`);
    try { dlg.showModal(); } catch { dlg.setAttribute('open',''); }
  }

  /* ===================== MENU BUILD (+ API publique) ===================== */
  let rootLI, toggleEl, menuUL;
  const customItems = []; // {type:'toggle'|'action'|'sep', label, hint, flagKey, defaultOn, handler}

  function itemToggle(label, flagKey, current){
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = '#';
    a.setAttribute('role', 'menuitemcheckbox');
    a.dataset.flag = flagKey;
    a.innerHTML = `<span class="${NS}-label">${label}</span><span class="${NS}-state">${current ? '✓' : ''}</span>`;
    a.setAttribute('aria-checked', String(!!current));
    li.appendChild(a);
    return li;
  }
  function itemAction(label, hint, handler){
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<span class="${NS}-label">${label}</span>${hint ? `<span class="${NS}-kbd">${hint}</span>` : ''}`;
    on(a, 'click', (e)=>{ e.preventDefault(); handler?.(); closeMenu(); });
    li.appendChild(a);
    return li;
  }
  function itemDivider(){
    const li = document.createElement('li');
    li.className = `${NS}-divider`;
    return li;
  }

  function fillMenu(){
    menuUL.innerHTML = '';

    // 1) Toggles auto pour les modules
    const mods = (Modules && Modules.all ? Modules.all() : []);
    if (mods.length){
      for (const { name, meta, enabledKey } of mods){
        const onNow = !!Flags.get(enabledKey, !!meta?.enabledByDefault);
        menuUL.appendChild(itemToggle(meta?.title || name, enabledKey, onNow));
      }
    } else {
      menuUL.appendChild(itemAction('No modules registered', '', ()=>{}));
    }

    // 2) Séparateur
    menuUL.appendChild(itemDivider());

    // 3) Items custom ajoutés par d’autres scripts
    for (const it of customItems){
      if (it.type === 'sep') { menuUL.appendChild(itemDivider()); continue; }
      if (it.type === 'toggle'){
        const onNow = !!Flags.get(it.flagKey, !!it.defaultOn);
        menuUL.appendChild(itemToggle(it.label, it.flagKey, onNow));
        continue;
      }
      if (it.type === 'action'){
        menuUL.appendChild(itemAction(it.label, it.hint, it.handler));
        continue;
      }
    }

    // 4) Import/Export (si fonctions présentes)
    if (window.ao3hExportHiddenWorks || window.ao3hImportHiddenWorks) {
      if (menuUL.lastElementChild?.className !== `${NS}-divider`) menuUL.appendChild(itemDivider());
      menuUL.appendChild(itemAction('Hidden works…', 'Import / Export', openIE));
    }
  }

  function openMenu(){ rootLI.classList.add('open'); toggleEl.setAttribute('aria-expanded','true'); }
  function closeMenu(){ rootLI.classList.remove('open'); toggleEl.setAttribute('aria-expanded','false'); }

  function buildMenu(){
    if (document.querySelector(`li.${NS}-root`)) return;

    rootLI = document.createElement('li');
    rootLI.className = `dropdown ${NS}-root`;
    rootLI.setAttribute('aria-haspopup', 'true');
    rootLI.tabIndex = 0;

    toggleEl = document.createElement('span');
    toggleEl.className = `${NS}-navlink`;
    toggleEl.textContent = 'AO3 Helper';
    toggleEl.setAttribute('aria-hidden', 'true');

    menuUL = document.createElement('ul');
    menuUL.className = `menu dropdown-menu ${NS}-menu`;
    menuUL.setAttribute('role', 'menu');

    rootLI.append(toggleEl, menuUL);

    const navUL =
      $('ul.primary.navigation.actions') ||
      $('#header .primary.navigation ul') ||
      $('#header .navigation ul');
    if (navUL) {
      navUL.insertBefore(rootLI, navUL.firstChild);
    } else {
      const floater = document.createElement('div');
      floater.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:999999;';
      floater.appendChild(rootLI);
      (document.body || document.documentElement).appendChild(floater);
    }

    on(rootLI, 'mouseenter', openMenu);
    on(rootLI, 'mouseleave', closeMenu);
    on(rootLI, 'focusin', openMenu);
    on(rootLI, 'focusout', (e)=>{ if(!rootLI.contains(e.relatedTarget)) closeMenu(); });
    on(toggleEl, 'click', (e)=>{ e.preventDefault(); rootLI.classList.contains('open') ? closeMenu() : openMenu(); });
    on(document, 'click', (e)=>{ if (!rootLI.contains(e.target)) closeMenu(); });
    on(document, 'keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    on(menuUL, 'keydown', (e)=>{
      const items = Array.from(menuUL.querySelectorAll('a'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown'){ e.preventDefault(); (items[i+1]||items[0])?.focus(); }
      if (e.key === 'ArrowUp'){ e.preventDefault(); (items[i-1]||items[items.length-1])?.focus(); }
      if (e.key === 'Home'){ e.preventDefault(); items[0]?.focus(); }
      if (e.key === 'End'){ e.preventDefault(); items[items.length-1]?.focus(); }
    });

    on(menuUL, 'click', async (e)=>{
      const a = e.target.closest('a'); if (!a || !a.dataset.flag) return;
      e.preventDefault();
      const key = a.dataset.flag;
      const next = !Flags.get(key, false);
      await Flags.set(key, next);
      a.querySelector(`.${NS}-state`).textContent = next ? '✓' : '';
      a.setAttribute('aria-checked', String(next));
    });

    fillMenu();
  }

  // API publique (pour ajouter des éléments depuis d'autres scripts)
  function addToggle(flagKey, label, defaultOn=false){ customItems.push({ type:'toggle', flagKey, label, defaultOn }); if (menuUL) fillMenu(); }
  function addAction(label, handler, hint=''){ customItems.push({ type:'action', label, handler, hint }); if (menuUL) fillMenu(); }
  function addSeparator(){ customItems.push({ type:'sep' }); if (menuUL) fillMenu(); }
  function rebuild(){ if (menuUL) fillMenu(); }
  AO3H.menu = { addToggle, addAction, addSeparator, rebuild };

  onReady(()=>{
    try {
      buildMenu();
      GM_registerMenuCommand?.('AO3 Helper — Open', ()=> {
        const tab = document.querySelector(`li.${NS}-root`);
        tab?.dispatchEvent(new Event('mouseenter'));
      });
    } catch (err) {
      console.error('[AO3H][menu] build failed', err);
    }
  });

})();
