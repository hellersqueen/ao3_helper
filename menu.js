/* menu.js — AO3 Helper header menu + Import/Export + settings root (safe, lazy dialog) */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { $, $$, on, onReady, css } = (AO3H.util || {});
  const Flags = (AO3H.flags || {});
  const dlog = (...a)=>{ if (AO3H.env?.DEBUG) console.log('[AO3H][menu]', ...a); };

  /* ============================== STYLES ============================== */
  css`
  .${NS}-navlink{
    color:#fff; text-decoration:none; padding:.5em .8em; display:inline-block;
    transition:background-color .2s; cursor:default; pointer-events:none;
  }
  .${NS}-root:hover .${NS}-navlink,
  .${NS}-root:focus-within .${NS}-navlink,
  .${NS}-root.open .${NS}-navlink{ background-color: rgba(255,255,255,0.15); }

  .${NS}-menu{ min-width:260px; }
  .${NS}-menu a{ display:flex; justify-content:space-between; align-items:center; }
  .${NS}-kbd{ font-size:12px; color:#666; margin-left:1rem; }

  .${NS}-settings-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:999997; display:none; }
  .${NS}-settings-backdrop.${NS}-open{ display:block; }
  .${NS}-settings{
    position:fixed; z-index:999998; left:50%; top:10vh; transform:translateX(-50%);
    width:min(820px, 92vw); max-height:80vh; overflow:auto;
    background:#fff; color:#000; border:1px solid #d6dbe6; border-radius:12px;
    box-shadow:0 16px 40px rgba(2,15,35,.12);
  }
  .${NS}-settings-head{
    display:flex; justify-content:space-between; align-items:center;
    padding:12px 14px; border-bottom:1px solid #e6eaf3; position:sticky; top:0; background:#fff; z-index:1;
  }
  .${NS}-settings-title{ font-weight:700; margin:0; }
  .${NS}-settings-close{ border:1px solid #ccd3e0; background:#f6f8fc; border-radius:8px; padding:6px 10px; cursor:pointer; }
  .${NS}-settings-root{ padding:12px 14px; }
  `;

  /* ===================== IMPORT/EXPORT CHOOSER (SAFE) ===================== */
  // Build only when needed; append to <body> if present, else to <html>.
  function ensureHiddenWorksChooser(){
    if (document.getElementById(`${NS}-ie-dialog`)) return true;

    css`
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
    }`;

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
      </form>
    `;

    const parent = document.body || document.documentElement;
    if (!parent) return false; // caller will retry soon
    parent.appendChild(dlg);

    const get = (id)=> document.getElementById(id);
    get(`${NS}-ie-export`).addEventListener('click', () => {
      (W.ao3hExportHiddenWorks || (()=>alert('Exporter not loaded yet')))();
      dlg.close();
    });
    get(`${NS}-ie-import`).addEventListener('click', () => {
      (W.ao3hImportHiddenWorks || (()=>alert('Importer not loaded yet')))();
      dlg.close();
    });
    get(`${NS}-ie-cancel`).addEventListener('click', () => dlg.close());

    dlg.addEventListener('click', (e) => {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });

    return true;
  }

  /* ============================ SETTINGS ROOT ============================ */
  let settingsBackdrop, settingsBox, settingsRoot;
  function buildSettingsModal(){
    if (settingsRoot) return settingsRoot;

    settingsBackdrop = document.createElement('div');
    settingsBackdrop.className = `${NS}-settings-backdrop`;

    settingsBox = document.createElement('div');
    settingsBox.className = `${NS}-settings`;
    settingsBox.innerHTML = `
      <div class="${NS}-settings-head">
        <h3 class="${NS}-settings-title">AO3 Helper — Settings</h3>
        <button type="button" class="${NS}-settings-close">Close</button>
      </div>
      <div class="${NS}-settings-root" id="${NS}-settings-root"></div>
    `;
    settingsRoot = settingsBox.querySelector(`#${NS}-settings-root`);

    document.body.append(settingsBackdrop, settingsBox);

    const close = ()=> {
      settingsBackdrop.classList.remove(`${NS}-open`);
      settingsBox.style.display = 'none';
    };
    const open = ()=> {
      settingsBackdrop.classList.add(`${NS}-open`);
      settingsBox.style.display = 'block';
    };

    on(settingsBackdrop, 'click', close);
    on(settingsBox.querySelector(`.${NS}-settings-close`), 'click', close);
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });

    settingsBox.__ao3h_open = open;
    return settingsRoot;
  }
  function openSettingsModal(){
    if (!settingsBox) buildSettingsModal();
    settingsBox.__ao3h_open();
  }

  /* ============================== HEADER MENU ============================== */
  function buildMenu(flags){
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

    function item(label, key, hint){
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.setAttribute('role', 'menuitemcheckbox');
      a.dataset.flag = key;
      a.innerHTML = `
        <span class="${NS}-label">${label}</span>
        <span class="${NS}-state">${flags[key] ? '✓' : ''}</span>
        ${hint ? `<span class="${NS}-kbd">${hint}</span>` : ''}`;
      a.setAttribute('aria-checked', String(!!flags[key]));
      li.appendChild(a);
      return li;
    }

    menu.appendChild(item('Save scroll position', 'saveScroll'));
    menu.appendChild(item('Chapter word count', 'chapterWordCount'));
    menu.appendChild(item('Hide works by tags', 'hideByTags'));
    menu.appendChild(item('Auto filter (5k+, complete, EN)', 'autoSearchFilters'));
    menu.appendChild(item('Hide Fanfic (with notes)', 'hideFanficWithNotes'));

    // Manage hidden tags…
    {
      const mli = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#'; a.innerHTML = `<span>Manage hidden tags…</span>`;
      on(a, 'click', (e)=>{ e.preventDefault(); document.dispatchEvent(new CustomEvent(`${NS}:open-hide-manager`)); closeMenu(); });
      mli.appendChild(a);
      menu.appendChild(mli);
    }

    // Hidden works… (lazy create the chooser dialog)
    {
      const mli = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.innerHTML = `<span>Hidden works…</span><span class="${NS}-kbd">Import / Export</span>`;

      on(a, 'click', (e)=>{
        e.preventDefault();

        const openDlg = () => {
          const dlg = document.getElementById(`${NS}-ie-dialog`);
          if (!dlg) return;
          try { dlg.showModal(); } catch { dlg.setAttribute('open',''); }
          closeMenu();
        };

        let ok = ensureHiddenWorksChooser();
        if (!ok) {
          const tryOpen = () => { if (ensureHiddenWorksChooser()) openDlg(); };
          document.addEventListener('DOMContentLoaded', tryOpen, { once:true });
          setTimeout(tryOpen, 200);
          return;
        }
        openDlg();
      });

      mli.appendChild(a);
      menu.appendChild(mli);
    }

    // Settings…
    {
      const mli = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#'; a.innerHTML = `<span>Settings…</span>`;
      on(a, 'click', (e)=>{ e.preventDefault(); openSettingsModal(); closeMenu(); });
      mli.appendChild(a);
      menu.appendChild(mli);
    }

    li.append(toggle, menu);

    li.tabIndex = 0;
    function openMenu(){ li.classList.add('open'); toggle.setAttribute('aria-expanded','true'); }
    function closeMenu(){ li.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); }

    on(li, 'mouseenter', openMenu);
    on(li, 'mouseleave', closeMenu);
    on(li, 'focusin', openMenu);
    on(li, 'focusout', (e)=>{ if(!li.contains(e.relatedTarget)) closeMenu(); });
    on(toggle, 'click', (e)=>{ e.preventDefault(); li.classList.contains('open') ? closeMenu() : openMenu(); });
    on(document, 'click', (e)=>{ if (!li.contains(e.target)) closeMenu(); });
    on(document, 'keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    on(menu, 'click', async (e)=>{
      const a = e.target.closest('a'); if (!a || !a.dataset.flag) return;
      e.preventDefault();
      const key = a.dataset.flag;
      const f = await Flags.get();
      const next = !f[key];
      await Flags.set(key, next);
      a.querySelector(`.${NS}-state`).textContent = next ? '✓' : '';
      a.setAttribute('aria-checked', String(next));
    });

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
      document.body.appendChild(floater);
    }
  }

  /* =============================== BOOT =============================== */
  onReady(async ()=>{
    const root = (buildSettingsModal && buildSettingsModal()) || null;
    AO3H.provideSettingsRoot && AO3H.provideSettingsRoot(root);
    document.dispatchEvent(new CustomEvent(`${NS}:menu-ready`, { detail: { settingsRoot: root }}));
    const flags = await (Flags.get ? Flags.get() : Promise.resolve({}));
    buildMenu(flags);
  });

})();
