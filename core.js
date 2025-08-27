(function(){
  'use strict';

  // ---------------------------- ENV & NAMESPACE ----------------------------
  const NS = 'ao3h';
  const DEBUG = false;
  const dlog = (...a)=>{ if (DEBUG) console.log('[AO3H]', ...a); };

  // ------------------------------- UTILITIES -------------------------------
  const onReady = (fn) => (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', fn, {once:true})
    : fn();

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, cb, opts) => el.addEventListener(evt, cb, opts);
  const debounce = (fn,ms=200)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
  const throttle = (fn,ms=200)=>{let t=0;return(...a)=>{const n=Date.now();if(n-t>ms){t=n;fn(...a);}};};

  const route = {
    path: () => location.pathname,
    isWork: () => /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(location.pathname),
    isWorkShow: () => /^\/works\/\d+$/.test(location.pathname),
    isSearch: () => /^\/works$/.test(location.pathname) && (new URLSearchParams(location.search).has('work_search[query]') || location.search.includes('tag_id')),
    isChapter: () => /^\/works\/\d+\/chapters\/\d+$/.test(location.pathname),
    isBookmarks: () => /^\/users\/[^/]+\/bookmarks/.test(location.pathname),
  };

  const css = (strings, ...vals) => {
    const text = strings.map((s,i)=>s+(vals[i]??'')).join('');
    if (typeof GM_addStyle === 'function') GM_addStyle(`/* ${NS} */\n${text}`);
    else { const el=document.createElement('style'); el.textContent=text; document.head.appendChild(el); }
  };

  const observe = (root, cb, opts={childList:true,subtree:true}) => {
    const mo = new MutationObserver(cb); mo.observe(root, opts); return mo;
  };

  // ------------------------------- STORAGE ---------------------------------
  const Storage = {
    key: (k) => `${NS}:${k}`,
    async get(k, d=null){ try { return await GM_getValue(this.key(k), d); } catch { return d; } },
    async set(k, v){ return GM_setValue(this.key(k), v); },
    async del(k){ return GM_deleteValue(this.key(k)); },
  };

  // ------------------------------- FLAGS -----------------------------------
  const Defaults = {
    features: {
      saveScroll: true,
      chapterWordCount: true,
      hideByTags: true,
      autoSearchFilters: true,
      hideFanficWithNotes: true,
    }
  };

  async function getFlags() {
    const saved = await Storage.get('flags', null);
    if (!saved) { await Storage.set('flags', Defaults.features); return {...Defaults.features}; }
    const merged = {...Defaults.features, ...saved};
    if (JSON.stringify(merged) !== JSON.stringify(saved)) await Storage.set('flags', merged);
    return merged;
  }
  async function setFlag(key, val) {
    const flags = await getFlags(); flags[key] = !!val; await Storage.set('flags', flags); return flags;
  }

  // ------------------------------- MENU UI ---------------------------------
  function ensureHiddenWorksChooser(){
    if (document.getElementById('ao3h-ie-dialog')) return;
    css`
#ao3h-ie-dialog::backdrop { background: rgba(0,0,0,.35); }
#ao3h-ie-dialog { border:1px solid #bfc7cf; border-radius:10px; padding:16px 16px 14px; width:320px; max-width:90vw; box-shadow:0 10px 30px rgba(0,0,0,.2); background:#fff; }
#ao3h-ie-title { font-weight:700; margin:0 0 10px; font-size:16px; }
#ao3h-ie-desc  { margin:0 0 14px; font-size:13px; color:#444; }
#ao3h-ie-row   { display:flex; gap:10px; margin-top:8px; }
#ao3h-ie-row button { flex:1; padding:10px 12px; border-radius:8px; border:1px solid #bfc7cf; background:#e7edf3; cursor:pointer; font-size:13px; }
#ao3h-ie-row button:hover { filter: brightness(.98); }
#ao3h-ie-foot { display:flex; justify-content:flex-end; margin-top:10px; }
#ao3h-ie-cancel { padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#f7f7f7; cursor:pointer; font-size:12px; }
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
      </form>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#ao3h-ie-export').addEventListener('click', () => { (window.ao3hExportHiddenWorks || (()=>alert('Exporter not loaded yet')))(); dlg.close(); });
    dlg.querySelector('#ao3h-ie-import').addEventListener('click', () => { (window.ao3hImportHiddenWorks || (()=>alert('Importer not loaded yet')))(); dlg.close(); });
    dlg.querySelector('#ao3h-ie-cancel').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { const r=dlg.getBoundingClientRect(); const inside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom; if (!inside) dlg.close(); });
  }

  function buildSettingsUI(flags){
    css`
.${NS}-navlink{
  color:#fff; text-decoration:none; padding:.5em .8em; display:inline-block;
  transition:background-color .2s; cursor:default; pointer-events:none;
}
.${NS}-root:hover .${NS}-navlink,
.${NS}-root:focus-within .${NS}-navlink,
.${NS}-root.${NS}-open .${NS}-navlink{
  background-color: rgba(255,255,255,0.15);
}
.${NS}-menu{ min-width:260px; }
.${NS}-menu a{ display:flex; justify-content:space-between; align-items:center; }
.${NS}-kbd{ font-size:12px; color:#666; margin-left:1rem; }
/* Show the menu when the container has the open class */
.${NS}-root.${NS}-open .${NS}-menu{ display:block; }
    `;

    if (document.querySelector(`li.${NS}-root`)) return;

    const li = document.createElement('li');
    li.className = `dropdown ${NS}-root`;
    li.setAttribute('aria-haspopup','true');

    const toggle = document.createElement('span');
    toggle.className = `${NS}-navlink`;
    toggle.textContent = 'AO3 Helper';
    toggle.setAttribute('aria-hidden','true');

    const menu = document.createElement('ul');
    menu.className = `menu dropdown-menu ${NS}-menu`;
    menu.setAttribute('role','menu');

    function item(label, key, hint){
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href='#';
      a.setAttribute('role','menuitemcheckbox');
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
    menu.appendChild(item('Auto filter', 'autoSearchFilters'));
    menu.appendChild(item('Hide Fanfic (with notes)', 'hideFanficWithNotes'));

    { const manageLi = document.createElement('li');
      const manageA = document.createElement('a');
      manageA.href = '#';
      manageA.innerHTML = `<span>Manage hidden tags…</span>`;
      manageA.addEventListener('click', (e)=>{ e.preventDefault(); document.dispatchEvent(new CustomEvent(`${NS}:open-hide-manager`)); closeMenu(); });
      manageLi.appendChild(manageA);
      menu.appendChild(manageLi);
    }

    { ensureHiddenWorksChooser();
      const ieLi = document.createElement('li');
      const ieA = document.createElement('a');
      ieA.href='#';
      ieA.innerHTML = `<span>Hidden works…</span><span class="${NS}-kbd">Import / Export</span>`;
      ieA.addEventListener('click',(e)=>{ e.preventDefault(); const dlg=document.getElementById('ao3h-ie-dialog'); if(!dlg){ alert('Chooser dialog not found'); return; } try{ dlg.showModal(); } catch { dlg.setAttribute('open',''); } closeMenu(); });
      ieLi.appendChild(ieA);
      menu.appendChild(ieLi);
    }

    li.appendChild(toggle);
    li.appendChild(menu);
    li.tabIndex = 0;

    function openMenu(){ li.classList.add('open'); toggle.setAttribute('aria-expanded','true'); }
    function closeMenu(){ li.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); }

    li.addEventListener('mouseenter', openMenu);
    li.addEventListener('mouseleave', closeMenu);
    li.addEventListener('focusin', openMenu);
    li.addEventListener('focusout', (e)=>{ if(!li.contains(e.relatedTarget)) closeMenu(); });
    document.addEventListener('pointerdown', (e)=>{ if(!li.contains(e.target)) closeMenu(); });
    toggle.addEventListener('click', (e)=>{ e.preventDefault(); li.classList.contains('open') ? closeMenu() : openMenu(); });
    document.addEventListener('click', (e)=>{ if (!li.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    menu.addEventListener('click', async (e)=>{
      const a = e.target.closest('a'); if (!a || !a.dataset.flag) return;
      e.preventDefault();
      const key = a.dataset.flag;
      const flags = await getFlags();
      const next = !flags[key];
      await setFlag(key, next);
      a.querySelector(`.${NS}-state`).textContent = next ? '✓' : '';
      a.setAttribute('aria-checked', String(next));
      document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`));
    });

    document.addEventListener(`${NS}:flags-updated`, async ()=>{
      const flags = await getFlags();
      menu.querySelectorAll('a[data-flag]').forEach(a=>{
        const k=a.dataset.flag, on=!!flags[k];
        a.querySelector(`.${NS}-state`).textContent = on ? '✓' : '';
        a.setAttribute('aria-checked', String(on));
      });
    });

    const navUL =
      document.querySelector('ul.primary.navigation.actions') ||
      document.querySelector('#header .primary.navigation ul') ||
      document.querySelector('#header .navigation ul');

    if (navUL) navUL.insertBefore(li, navUL.firstChild);
    else { const floater=document.createElement('div'); floater.style.cssText='position:fixed;right:14px;bottom:14px;z-index:999999;'; floater.appendChild(li); document.body.appendChild(floater); }
  }

  // --------------------------- MODULE REGISTRY -----------------------------
  const modules = []; // {id, match?, init}
  function register(def){ modules.push(def); }
  function isMatch(m){ return m.match ? m.match(location) : true; }
  async function start(){
    const flags = await getFlags();
    buildSettingsUI(flags);
    for (const m of modules) {
      try { if (!isMatch(m)) continue; await m.init(flags); }
      catch(e){ console.error(`[AO3H] ${m.id||'module'} failed`, e); }
    }
  }

  // ----------------------------- EXPORT API --------------------------------
  window.AO3H = {
    env: { NS, DEBUG },
    util: { dlog, onReady, $, $$, on, debounce, throttle, route, css, observe },
    store: Storage,
    flags: { Defaults, getFlags, setFlag },
    ui: { buildSettingsUI, ensureHiddenWorksChooser },
    register, start,
  };

  // Auto-start once DOM is ready
  onReady(start);
})();
