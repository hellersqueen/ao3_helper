;(function () {
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';
  const { $, on, onReady, css, log } = (AO3H.util || {});
  const Flags   = AO3H.flags;
  const Modules = AO3H.modules;

  /* ----------------------------- styles ----------------------------- */
  css(`
  /* ---- Lien d'onglet façon AO3 ---- */
  .${NS}-navlink{
    color:#fff; text-decoration:none; padding:.5em .8em; display:inline-block;
    transition:background-color .2s; cursor:default; pointer-events:none;
  }
  .${NS}-root:hover .${NS}-navlink,
  .${NS}-root:focus-within .${NS}-navlink,
  .${NS}-root.open .${NS}-navlink{ background-color: rgba(255,255,255,0.15); text-decoration:none; }

  /* ---- Dropdown ---- */
  .${NS}-menu{ min-width:260px; }
  .${NS}-menu a{ display:flex; justify-content:space-between; align-items:center; gap:.75rem; }
  .${NS}-kbd{ font-size:12px; color:#666; margin-left:1rem; }
  .${NS}-label{ flex:1; }
  .${NS}-state{ width:1.2em; text-align:center; }

  /* ---- Import/Export dialog ---- */
  #${NS}-ie-dialog::backdrop { background: rgba(0,0,0,.35); }
  #${NS}-ie-dialog{
    border:1px solid #bfc7cf; border-radius:10px; padding:16px 16px 14px;
    width:320px; max-width:90vw; box-shadow:0 10px 30px rgba(0,0,0,.2); background:#fff;
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
  `, 'ao3h-menu-skin');

  /* -------- Import/Export (dialog lazy, sûr dans <body>) -------- */
  function ensureIE() {
    if (document.getElementById(`${NS}-ie-dialog`)) return true;
    const dlg = document.createElement('dialog');
    dlg.id = `${NS}-ie-dialog`;
    dlg.innerHTML = `
      <form method="dialog" style="margin:0">
        <h3 id="${NS}-ie-title">Hidden works</h3>
        <p id="${NS}-ie-desc">Choose what you want to do with your hidden-works list.</p>
        <div id="${NS}-ie-row">
          <button type="button" id="${NS}-ie-export">Export JSON</button>
          <button type="button" id="${NS}-ie-import">Import JSON</button>
        </div>
        <div id="${NS}-ie-foot">
          <button id="${NS}-ie-cancel">Close</button>
        </div>
      </form>`;
    (document.body || document.documentElement).appendChild(dlg);

    const get = (id)=> document.getElementById(id);
    get(`${NS}-ie-export`).addEventListener('click', () => {
      (window.ao3hExportHiddenWorks || (()=>alert('Exporter not loaded yet')))();
      dlg.close();
    });
    get(`${NS}-ie-import`).addEventListener('click', () => {
      (window.ao3hImportHiddenWorks || (()=>alert('Importer not loaded yet')))();
      dlg.close();
    });
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

  /* ----------------------------- menu ----------------------------- */
  function buildMenu(){
    if (document.querySelector(`li.${NS}-root`)) return;

    const li = document.createElement('li');
    li.className = `dropdown ${NS}-root`;
    li.setAttribute('aria-haspopup', 'true');

    const toggle = document.createElement('span');
    toggle.className = `${NS}-navlink`;
    toggle.textContent = 'AO3 Helper';
    toggle.setAttribute('aria-hidden', 'true');

    const menu = document.createElement('ul');
    menu.className = `menu dropdown-menu ${NS}-menu`;
    menu.setAttribute('role', 'menu');

    function itemToggle(label, flagKey, current){
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.setAttribute('role', 'menuitemcheckbox');
      a.dataset.flag = flagKey;
      a.innerHTML = `
        <span class="${NS}-label">${label}</span>
        <span class="${NS}-state">${current ? '✓' : ''}</span>`;
      a.setAttribute('aria-checked', String(!!current));
      li.appendChild(a);
      return li;
    }

    function itemAction(label, hint, handler){
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.innerHTML = `<span class="${NS}-label">${label}</span>${hint ? `<span class="${NS}-kbd">${hint}</span>` : ''}`;
      on(a, 'click', (e)=>{ e.preventDefault(); handler?.(); closeMenu(); });
      li.appendChild(a);
      return li;
    }

    // --- Modules: toggles dynamiques ---
    const mods = (Modules.all ? Modules.all() : []);
    if (mods.length) {
      for (const { name, meta, enabledKey } of mods) {
        const label = meta?.title || name;
        const cur = !!Flags.get(enabledKey, !!meta?.enabledByDefault);
        menu.appendChild(itemToggle(label, enabledKey, cur));
      }
    } else {
      menu.appendChild(itemAction('No modules registered', '', ()=>{}));
    }

    // --- Séparateur (optionnel) ---
    {
      const sep = document.createElement('li');
      sep.className = 'divider';
      menu.appendChild(sep);
    }

    // --- Import/Export hidden works (ouvre le dialog lazy) ---
    menu.appendChild(itemAction('Hidden works…', 'Import / Export', openIE));
    
    li.append(toggle, menu);

    // Ouverture/fermeture
    function openMenu(){ li.classList.add('open'); toggle.setAttribute('aria-expanded','true'); }
    function closeMenu(){ li.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); }

    li.tabIndex = 0;
    on(li, 'mouseenter', openMenu);
    on(li, 'mouseleave', closeMenu);
    on(li, 'focusin', openMenu);
    on(li, 'focusout', (e)=>{ if(!li.contains(e.relatedTarget)) closeMenu(); });
    on(toggle, 'click', (e)=>{ e.preventDefault(); li.classList.contains('open') ? closeMenu() : openMenu(); });
    on(document, 'click', (e)=>{ if (!li.contains(e.target)) closeMenu(); });
    on(document, 'keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    // Click sur un toggle → flip flag + reflet visuel
    on(menu, 'click', async (e)=>{
      const a = e.target.closest('a'); if (!a || !a.dataset.flag) return;
      e.preventDefault();
      const key = a.dataset.flag;
      const next = !Flags.get(key, false);
      await Flags.set(key, next);
      a.querySelector(`.${NS}-state`).textContent = next ? '✓' : '';
      a.setAttribute('aria-checked', String(next));
    });

    // Attacher à la barre d’AO3, sinon fallback coin bas-droit
    const navUL =
      $('ul.primary.navigation.actions') ||
      $('#header .primary.navigation ul') ||
      $('#header .navigation ul');

    if (navUL) {
      navUL.insertBefore(li, navUL.firstChild);
    } else {
      const floater = document.createElement('div');
      floater.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:999999;';
      floater.appendChild(li);
      (document.body || document.documentElement).appendChild(floater);
    }
  }

  onReady(()=>{
    try {
      buildMenu();
      // (optionnel) commandes Tampermonkey
      try {
        GM_registerMenuCommand?.('AO3 Helper — Open', ()=> {
          const tab = document.querySelector(`li.${NS}-root`);
          tab?.dispatchEvent(new Event('mouseenter'));
        });
      } catch {}
      log?.info?.('[menu] ready');
    } catch (err) {
      console.error('[AO3H][menu] build failed', err);
    }
  });

})();
