;(function () {
  'use strict';

  // Références de base
  const AO3H = window.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // Helpers locaux minimalistes (pas d'alias "Flags"/"Modules")
  const M_$  = (AO3H.util && AO3H.util.$)  || ((s,r=document)=>r.querySelector(s));
  const M_on = (AO3H.util && AO3H.util.on) || ((el,e,cb,o)=>el&&el.addEventListener(e,cb,o));
  const M_onReady = (AO3H.util && AO3H.util.onReady) || (fn => (document.readyState==='loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn());

  // Injecteur CSS (compatible tagged template OU string), nom unique
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

  // Accès directs (pas d'alias courts pour éviter collisions)
  const M_FLAGS   = AO3H.flags;
  const M_MODULES = AO3H.modules;

  /* ============================== STYLES ============================== */
  M_injectCSS`
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
  let M_rootLI, M_toggleEl, M_menuUL;
  const M_customItems = []; // {type:'toggle'|'action'|'sep', label, hint, flagKey, defaultOn, handler}

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
    M_on(a, 'click', (e)=>{ e.preventDefault(); handler?.(); closeMenu(); });
    li.appendChild(a);
    return li;
  }
  function itemDivider(){
    const li = document.createElement('li');
    li.className = `${NS}-divider`;
    return li;
  }

  function fillMenu(){
    M_menuUL.innerHTML = '';

    // 1) Toggles auto pour les modules
    const mods = (M_MODULES && M_MODULES.all ? M_MODULES.all() : []);
    if (mods.length){
      for (const { name, meta, enabledKey } of mods){
        const onNow = !!M_FLAGS.get(enabledKey, !!meta?.enabledByDefault);
        M_menuUL.appendChild(itemToggle(meta?.title || name, enabledKey, onNow));
      }
    } else {
      M_menuUL.appendChild(itemAction('No modules registered', '', ()=>{}));
    }

    // 2) Séparateur
    M_menuUL.appendChild(itemDivider());

    // 3) Items custom ajoutés par d’autres scripts
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

    // 4) Import/Export (si fonctions présentes)
    if (window.ao3hExportHiddenWorks || window.ao3hImportHiddenWorks) {
      if (M_menuUL.lastElementChild?.className !== `${NS}-divider`) M_menuUL.appendChild(itemDivider());
      M_menuUL.appendChild(itemAction('Hidden works…', 'Import / Export', openIE));
    }
  }

  function openMenu(){ M_rootLI.classList.add('open'); M_toggleEl.setAttribute('aria-expanded','true'); }
  function closeMenu(){ M_rootLI.classList.remove('open'); M_toggleEl.setAttribute('aria-expanded','false'); }

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

    M_on(M_rootLI, 'mouseenter', openMenu);
    M_on(M_rootLI, 'mouseleave', closeMenu);
    M_on(M_rootLI, 'focusin', openMenu);
    M_on(M_rootLI, 'focusout', (e)=>{ if(!M_rootLI.contains(e.relatedTarget)) closeMenu(); });
    M_on(M_toggleEl, 'click', (e)=>{ e.preventDefault(); M_rootLI.classList.contains('open') ? closeMenu() : openMenu(); });
    M_on(document, 'click', (e)=>{ if (!M_rootLI.contains(e.target)) closeMenu(); });
    M_on(document, 'keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    M_on(M_menuUL, 'keydown', (e)=>{
      const items = Array.from(M_menuUL.querySelectorAll('a'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown'){ e.preventDefault(); (items[i+1]||items[0])?.focus(); }
      if (e.key === 'ArrowUp'){ e.preventDefault(); (items[i-1]||items[items.length-1])?.focus(); }
      if (e.key === 'Home'){ e.preventDefault(); items[0]?.focus(); }
      if (e.key === 'End'){ e.preventDefault(); items[items.length-1]?.focus(); }
    });

    M_on(M_menuUL, 'click', async (e)=>{
      const a = e.target.closest('a'); if (!a || !a.dataset.flag) return;
      e.preventDefault();
      const key = a.dataset.flag;
      const next = !M_FLAGS.get(key, false);
      await M_FLAGS.set(key, next);
      a.querySelector(`.${NS}-state`).textContent = next ? '✓' : '';
      a.setAttribute('aria-checked', String(next));
    });

    fillMenu();
  }

  // API publique — noms uniques
  function addToggle(flagKey, label, defaultOn=false){ M_customItems.push({ type:'toggle', flagKey, label, defaultOn }); if (M_menuUL) fillMenu(); }
  function addAction(label, handler, hint=''){ M_customItems.push({ type:'action', label, handler, hint }); if (M_menuUL) fillMenu(); }
  function addSeparator(){ M_customItems.push({ type:'sep' }); if (M_menuUL) fillMenu(); }
  function rebuild(){ if (M_menuUL) fillMenu(); }
  AO3H.menu = { addToggle, addAction, addSeparator, rebuild };

  M_onReady(()=>{
    try {
      buildMenu();
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
