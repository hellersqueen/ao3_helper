;(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const { env:{ NS } = {}, util:{ css } = {}, flags:{ getFlags, setFlag } = {} } = AO3H;
  if (!NS || !css || !getFlags || !setFlag) {
    console.error('[AO3H][menu] core not ready'); return;
  }


  // --- Import/Export chooser used by Module 5 (optional) ---
  function ensureHiddenWorksChooser(){
    if (document.getElementById('ao3h-ie-dialog')) return;

    css`
      #ao3h-ie-dialog::backdrop { background: rgba(0,0,0,.35); }
      #ao3h-ie-dialog {
        border: 1px solid #bfc7cf; border-radius: 10px; padding: 16px 16px 14px;
        width: 320px; max-width: 90vw; box-shadow: 0 10px 30px rgba(0,0,0,.2);
        background: #fff;
      }
      #ao3h-ie-title { font-weight: 700; margin: 0 0 10px; font-size: 16px; }
      #ao3h-ie-desc  { margin: 0 0 14px; font-size: 13px; color: #444; }
      #ao3h-ie-row   { display:flex; gap:10px; margin-top:8px; }
      #ao3h-ie-row button {
        flex:1; padding:10px 12px; border-radius:8px; border:1px solid #bfc7cf;
        background:#e7edf3; cursor:pointer; font-size:13px;
      }
      #ao3h-ie-row button:hover { filter: brightness(.98); }
      #ao3h-ie-foot { display:flex; justify-content:flex-end; margin-top:10px; }
      #ao3h-ie-cancel {
        padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#f7f7f7; cursor:pointer;
        font-size:12px;
      }
    `;

    const dlg = document.createElement('dialog');
    dlg.id = 'ao3h-ie-dialog';
    dlg.innerHTML = `
      <form method="dialog" style="margin:0">
        <h3 id="ao3h-ie-title">Hidden works</h3>
        <p id="ao3h-ie-desc">Choose what you want to do with your hidden-works list.</p>
        <div id="ao3h-ie-row">
          <button type="button" id="ao3h-ie-export">Export JSON</button>
          <button type="button" id="ao3h-ie-import">Import JSON</button>
        </div>
        <div id="ao3h-ie-foot">
          <button id="ao3h-ie-cancel">Close</button>
        </div>
      </form>
    `;
    document.body.appendChild(dlg);

    // If Module 5 is not present yet, these show a friendly alert.
    dlg.querySelector('#ao3h-ie-export').addEventListener('click', () => {
      (window.ao3hExportHiddenWorks || (() => alert('Export not available — the Hide Notes module is not loaded')))();
      dlg.close();
    });
    dlg.querySelector('#ao3h-ie-import').addEventListener('click', () => {
      (window.ao3hImportHiddenWorks || (() => alert('Import not available — the Hide Notes module is not loaded')))();
      dlg.close();
    });
    dlg.querySelector('#ao3h-ie-cancel').addEventListener('click', () => dlg.close());

    // Close if we click on the backdrop area
    dlg.addEventListener('click', (e) => {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  }

  function buildSettingsUI(flags){
    css`
      .${NS}-navlink{
        color:#fff; text-decoration:none; padding:.5em .8em;
        display:inline-block; transition:background-color .2s; cursor:default; pointer-events:none;
      }
      .${NS}-root:hover .${NS}-navlink,
      .${NS}-root:focus-within .${NS}-navlink,
      .${NS}-root.${NS}-open .${NS}-navlink{ background-color: rgba(255,255,255,0.15); }
      .${NS}-menu{ min-width:260px; }
      .${NS}-menu a{ display:flex; justify-content:space-between; align-items:center; }
      .${NS}-kbd{ font-size:12px; color:#666; margin-left:1rem; }
      .${NS}-root.${NS}-open .${NS}-menu{ display:block; }
    `;

    // Build once
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

    // Helper to create a toggle item
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

    // Your 4 toggles
    menu.appendChild(item('Save scroll position',   'saveScroll'));
    menu.appendChild(item('Chapter word count',     'chapterWordCount'));
    menu.appendChild(item('Hide works by tags',     'hideByTags'));
    menu.appendChild(item('Hide fanfic (with notes)', 'hideFanficWithNotes'));
    menu.appendChild(item('Auto filter',            'autoSearchFilters'));

    // Hidden Tags Manager (handled by hideByTags.js when it listens to this event)
    {
      const liM = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.innerHTML = `<span>Manage hidden tags…</span>`;
      a.addEventListener('click', (e)=> {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent(`${NS}:open-hide-manager`));
        closeMenu();
      });
      liM.appendChild(a);
      menu.appendChild(liM);
    }

    // Hidden works Import/Export (optional; works if Module 5 exists)
    {
      ensureHiddenWorksChooser();
      const liE = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.innerHTML = `<span>Hidden works…</span><span class="${NS}-kbd">Import / Export</span>`;
      a.addEventListener('click', (e)=> {
        e.preventDefault();
        const dlg = document.getElementById('ao3h-ie-dialog');
        if (!dlg) return;
        try { dlg.showModal(); } catch { dlg.setAttribute('open',''); }
        closeMenu();
      });
      liE.appendChild(a);
      menu.appendChild(liE);
    }

    // Attach to DOM
    li.appendChild(toggle);
    li.appendChild(menu);
    li.tabIndex = 0;

    function openMenu(){ li.classList.add(`${NS}-open`);  toggle.setAttribute('aria-expanded','true'); }
    function closeMenu(){ li.classList.remove(`${NS}-open`); toggle.setAttribute('aria-expanded','false'); }

    li.addEventListener('mouseenter', openMenu);
    li.addEventListener('mouseleave', closeMenu);
    li.addEventListener('focusin', openMenu);
    li.addEventListener('focusout', (e)=>{ if(!li.contains(e.relatedTarget)) closeMenu(); });
    document.addEventListener('pointerdown', (e)=>{ if(!li.contains(e.target)) closeMenu(); });
    toggle.addEventListener('click', (e)=>{ e.preventDefault(); li.classList.contains(`${NS}-open`) ? closeMenu() : openMenu(); });
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    // Try typical AO3 navs; if not found, float it bottom-right
    const navUL =
      document.querySelector('ul.primary.navigation.actions') ||
      document.querySelector('#header .primary.navigation ul') ||
      document.querySelector('#header .navigation ul');

    if (navUL) navUL.insertBefore(li, navUL.firstChild);
    else {
      const floater = document.createElement('div');
      floater.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:999999;';
      floater.appendChild(li);
      document.body.appendChild(floater);
    }

    // Toggle handler
    menu.addEventListener('click', async (e)=>{
      const a = e.target.closest('a'); if (!a || !a.dataset.flag) return;
      e.preventDefault();
      const key = a.dataset.flag;
      const f = await getFlags();
      const next = !f[key];
      await setFlag(key, next);
      a.querySelector(`.${NS}-state`).textContent = next ? '✓' : '';
      a.setAttribute('aria-checked', String(next));
      document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`));
    });

    // Keep menu in sync when flags change elsewhere
    document.addEventListener(`${NS}:flags-updated`, async ()=>{
      const f = await getFlags();
      menu.querySelectorAll('a[data-flag]').forEach(a=>{
        const k = a.dataset.flag, on = !!f[k];
        a.querySelector(`.${NS}-state`).textContent = on ? '✓' : '';
        a.setAttribute('aria-checked', String(on));
      });
    });
  }

  // Build menu after core announces flags ready
  document.addEventListener(`${NS}:boot-flags-ready`, (e) => {
    try { buildSettingsUI(e.detail || {}); }
    catch (err) { console.error('[AO3H][menu] build failed', err); }
  });
})();
