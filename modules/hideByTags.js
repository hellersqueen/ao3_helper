/* modules/hideByTags.js — hide works by tag (inline 🚫 add, list-page folding, simple manager) */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { $, $$, on, onReady, observe, debounce, css } = (AO3H.util || {});
  const Storage = (AO3H.store || {});
  const Routes  = (AO3H.routes || {});
  const dlog    = (...a)=>{ if (AO3H.env?.DEBUG) console.log('[AO3H][HideByTags]', ...a); };

  /* ----------------------------- STORAGE ----------------------------- */
  const STORE_KEY = 'hideTags:list'; // array<string> canonical tag names

  const toCanon = s => String(s||'').trim().toLowerCase();
  async function getList(){ return (await Storage.get(STORE_KEY, []) || []).map(toCanon); }
  async function setList(arr){ return Storage.set(STORE_KEY, Array.from(new Set(arr.map(toCanon).filter(Boolean)))); }

  /* --------------------------- CANON HELPERS ------------------------- */
  function canonicalFromAnchor(a){
    // Prefer decoding from the /tags/<encoded> URL to normalize things like "/" and "&"
    const href = a?.getAttribute?.('href') || '';
    const m = href.match(/\/tags\/([^/]+)/);
    if (!m) return toCanon(a?.textContent || '');
    let tag = decodeURIComponent(m[1]).replace(/\+/g, ' ');
    // AO3 "star codes"
    tag = tag.replace(/\*a\*/gi, '&').replace(/\*s\*/gi, '/');
    return toCanon(tag);
  }

  /* ------------------------------ STYLES ----------------------------- */
  css`
  /* inline icon shown on tag hover */
  a.tag.${NS}-tag-wrap{ position:relative; padding-right:0.2em; }
  a.tag.${NS}-tag-wrap .${NS}-ban{
    position:absolute; right:-1.05em; top:50%; transform:translateY(-50%);
    font-size:.9em; border:1px solid #bbb; border-radius:50%; width:1.05em; height:1.05em; line-height:1.05em;
    text-align:center; background:#fff; opacity:0; pointer-events:none; transition:opacity .15s, transform .12s;
  }
  a.tag.${NS}-tag-wrap:hover .${NS}-ban,
  a.tag.${NS}-tag-wrap:focus-visible .${NS}-ban{ opacity:1; pointer-events:auto; }
  a.tag.${NS}-tag-wrap .${NS}-ban:hover{ transform:translateY(-50%) scale(1.06); }

  /* folded blurb header + cut */
  .${NS}-fold {
    display:flex; align-items:center; gap:.5rem; width:98%;
    padding:.55rem .75rem; border:1px dashed #bdbdbd; border-radius:8px; background:#fee9e9;
    font-size:.82rem; color:#333; cursor:pointer; user-select:none;
  }
  .${NS}-fold * { pointer-events:none; }
  .${NS}-fold:hover{ background:#f1f3f7; }
  .${NS}-note{ font-weight:600; }
  .${NS}-reason{ opacity:.9; }
  .${NS}-hint{ margin-left:auto; opacity:.7; }
  .${NS}-cut{ display:none; }
  .${NS}-fold[aria-expanded="true"] + .${NS}-cut{ display:block; }
  .${NS}-force-show{ display:list-item !important; }

  /* simple manager modal */
  .${NS}-mgr-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:999997; display:none; }
  .${NS}-mgr-backdrop.${NS}-open{ display:block; }
  .${NS}-mgr{
    position:fixed; z-index:999998; left:50%; top:10vh; transform:translateX(-50%);
    width:min(620px,92vw); max-height:78vh; overflow:auto;
    background:#fff; color:#000; border:1px solid #d6dbe6; border-radius:12px;
    box-shadow:0 16px 40px rgba(2,15,35,.12);
  }
  .${NS}-mgr-head{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid #e6eaf3; position:sticky; top:0; background:#fff; }
  .${NS}-mgr-title{ font-weight:700; margin:0; }
  .${NS}-mgr-body{ padding:12px 14px; display:grid; gap:10px; }
  .${NS}-row{ display:flex; gap:8px; }
  .${NS}-input{ flex:1; padding:6px 10px; border:1px solid #cfd6e4; border-radius:8px; }
  .${NS}-btn{ padding:6px 10px; border:1px solid #cfd6e4; border-radius:8px; background:#f6f8fc; cursor:pointer; }
  .${NS}-list{ display:grid; gap:6px; }
  .${NS}-pill{ display:flex; align-items:center; gap:8px; padding:6px 10px; border:1px solid #e5e7eb; border-radius:999px; background:#f7f9ff; }
  .${NS}-pill b{ font-weight:600; }
  `;

  /* --------------------------- CORE MATCHING -------------------------- */
  function isListPage(){
    return Routes.isWorksIndex?.() || Routes.isSearch?.() || /^\/tags\/[^/]+\/works/.test(location.pathname);
  }
  function isWorkPage(){
    return Routes.isWork?.() || /^\/works\/\d+(\/chapters\/\d+)?$/.test(location.pathname);
  }

  function getWorkBlurbs(root=document){
    const a = $$('#main li.blurb', root);
    return a.length ? a : Array.from(root.querySelectorAll('li.blurb'));
  }

  function extractTagsFromScope(root){
    const out = new Set();
    $$('.tags .tag, .fandoms .tag, .freeforms .tag, .warnings .tag, .relationships .tag, .characters .tag, .categories .tag', root)
      .forEach(a => out.add(canonicalFromAnchor(a)));
    return out;
  }

  /* --------------------- HIDE / UNHIDE (LIST PAGES) -------------------- */
  function ensureWrapped(blurb){
    if (blurb.classList.contains(`${NS}-wrapped`)){
      return {
        fold: blurb.querySelector(`.${NS}-fold`),
        cut : blurb.querySelector(`.${NS}-cut`),
      };
    }
    blurb.classList.add(`${NS}-wrapped`);
    // move all children into the hidden "cut" container
    const cut = document.createElement('div');
    cut.className = `${NS}-cut`;
    while (blurb.firstChild) cut.appendChild(blurb.firstChild);
    blurb.appendChild(cut);

    const fold = document.createElement('div');
    fold.className = `${NS}-fold`;
    fold.setAttribute('role','button');
    fold.setAttribute('tabindex','0');
    fold.setAttribute('aria-expanded','false');
    blurb.insertBefore(fold, cut);

    const toggle = () => {
      const now = fold.getAttribute('aria-expanded') !== 'true';
      fold.setAttribute('aria-expanded', String(now));
      renderFold(fold, (fold.dataset.reasons || '').split('|').filter(Boolean), now);
    };
    on(fold, 'click',  (e)=>{ e.preventDefault(); toggle(); });
    on(fold, 'keydown',(e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); toggle(); } });

    return { fold, cut };
  }

  function unwrap(blurb){
    blurb.classList.remove(`${NS}-wrapped`, `${NS}-force-show`);
    const fold = blurb.querySelector(`.${NS}-fold`);
    const cut  = blurb.querySelector(`.${NS}-cut`);
    if (fold) fold.remove();
    if (cut){
      while (cut.firstChild) blurb.insertBefore(cut.firstChild, cut);
      cut.remove();
    }
    blurb.style.removeProperty('display');
    blurb.hidden = false;
  }

  function renderFold(fold, reasons, expanded){
    fold.innerHTML = '';
    const note = document.createElement('span');
    note.className = `${NS}-note`;
    note.textContent = expanded ? 'ℹ️ This work was hidden' : 'This work is hidden';

    const why = document.createElement('span');
    why.className = `${NS}-reason`;
    if (reasons.length){
      const t = ` — (Reason: tags include ${reasons.join(', ')})`;
      why.appendChild(document.createTextNode(t));
    }

    const hint = document.createElement('span');
    hint.className = `${NS}-hint`;
    hint.textContent = expanded ? 'Click to hide' : 'Click to show';

    fold.dataset.reasons = reasons.join('|');
    fold.setAttribute('aria-expanded', String(!!expanded));
    fold.append(note, document.createTextNode(' '), why, hint);
  }

  async function applyListHiding(){
    const list = await getList();
    const blurbs = getWorkBlurbs();
    blurbs.forEach(blurb => {
      // when reprocessing, check tags within the actual content (after wrap it's inside .ao3h-cut)
      const scope = blurb.querySelector(`.${NS}-cut`) || blurb;
      const tags = extractTagsFromScope(scope);
      const reasons = list.filter(t => tags.has(t));
      if (reasons.length === 0){
        if (blurb.classList.contains(`${NS}-wrapped`)) unwrap(blurb);
        return;
      }
      const { fold } = ensureWrapped(blurb);
      const expanded = fold.getAttribute('aria-expanded') === 'true';
      renderFold(fold, reasons, expanded);
      blurb.classList.add(`${NS}-force-show`); // keep visible so fold is clickable
    });
  }

  /* -------------------- WORK PAGE BANNER (optional) -------------------- */
  async function applyWorkPageBanner(){
    const list = await getList();
    if (!list.length || !isWorkPage()) return;
    const tags = extractTagsFromScope(document);
    const matched = list.some(t => tags.has(t));
    if (!matched) return;

    css`
      .${NS}-tag-banner{
        margin:1rem 0; padding:.8rem 1rem; border:1px solid #c66; background:#fee; color:#600; border-radius:8px;
        display:flex; justify-content:space-between; align-items:center; gap:1rem;
      }
      .${NS}-tag-banner button{ border:0; padding:.4rem .7rem; border-radius:6px; cursor:pointer; }
    `;
    if (!$('#'+NS+'-tag-banner')){
      const note = document.createElement('div');
      note.id = `${NS}-tag-banner`;
      note.className = `${NS}-tag-banner`;
      note.innerHTML = `<strong>Hidden by tag rule</strong><span>This work matches your “Hide by tags” list.</span>
                        <div><button type="button" id="${NS}-show-once">Show anyway</button></div>`;
      const anchor = $('#workskin') || $('#main') || document.body;
      anchor.prepend(note);
      on($('#'+NS+'-show-once'), 'click', ()=> note.remove(), { once:true });
    }
  }

  /* ----------------------- INLINE 🚫 ON TAG LINKS ---------------------- */
  function decorateTags(root=document){
    $$('.tag', root).forEach(tag => {
      if (tag.closest(`.${NS}-tag-wrap`)) return; // already decorated (if a previous pass wrapped)
      tag.classList.add(`${NS}-tag-wrap`);
      const ico = document.createElement('span');
      ico.className = `${NS}-ban`;
      ico.title = 'Hide this tag';
      ico.textContent = '🚫';
      ico.setAttribute('role', 'button');
      ico.tabIndex = 0;
      on(ico, 'click', async (e)=>{
        e.preventDefault();
        const canon = canonicalFromAnchor(tag);
        const curr = await getList();
        if (!curr.includes(canon)) await setList([...curr, canon]);
        document.dispatchEvent(new CustomEvent(`${NS}:hideByTags-updated`));
      });
      tag.appendChild(ico);

      // Alt+click the tag text itself to add
      on(tag, 'click', async (e)=>{
        if (!e.altKey) return;
        e.preventDefault();
        ico.click();
      });
    });
  }

  /* ------------------------------ MANAGER ------------------------------ */
  let mgrBackdrop, mgrBox, mgrList, mgrInput, mgrCount;
  function openManager(){
    if (!mgrBackdrop){
      mgrBackdrop = document.createElement('div');
      mgrBackdrop.className = `${NS}-mgr-backdrop`;
      mgrBox = document.createElement('div');
      mgrBox.className = `${NS}-mgr`;
      mgrBox.innerHTML = `
        <div class="${NS}-mgr-head">
          <h3 class="${NS}-mgr-title">AO3 Helper — Hidden Tags</h3>
          <button type="button" class="${NS}-btn ${NS}-close">Close</button>
        </div>
        <div class="${NS}-mgr-body">
          <div class="${NS}-row">
            <input class="${NS}-input" id="${NS}-hbt-input" placeholder="Add tag (exact name)…” />
            <button class="${NS}-btn" id="${NS}-hbt-add" type="button">Add</button>
          </div>
          <div class="${NS}-row">
            <button class="${NS}-btn" id="${NS}-hbt-export" type="button">Export JSON</button>
            <button class="${NS}-btn" id="${NS}-hbt-import" type="button">Import JSON</button>
            <button class="${NS}-btn" id="${NS}-hbt-clear"  type="button">Clear all</button>
            <span id="${NS}-hbt-count" style="margin-left:auto;opacity:.8;"></span>
          </div>
          <div class="${NS}-list" id="${NS}-hbt-list"></div>
        </div>
      `;
      document.body.append(mgrBackdrop, mgrBox);

      mgrList  = $('#'+NS+'-hbt-list', mgrBox);
      mgrInput = $('#'+NS+'-hbt-input', mgrBox);
      mgrCount = $('#'+NS+'-hbt-count', mgrBox);

      const close = ()=> { mgrBackdrop.classList.remove(`${NS}-open`); mgrBox.style.display='none'; };
      const open  = ()=> { mgrBackdrop.classList.add(`${NS}-open`);  mgrBox.style.display='block'; };
      on(mgrBackdrop, 'click', close);
      on($('.'+NS+'-close', mgrBox), 'click', close);
      on(document, 'keydown', (e)=>{ if (mgrBox.style.display!=='none' && e.key==='Escape') close(); });

      on($('#'+NS+'-hbt-add', mgrBox), 'click', async ()=> {
        const v = toCanon(mgrInput.value);
        if (!v) return;
        const list = await getList();
        if (!list.includes(v)) await setList([...list, v]);
        mgrInput.value = '';
        await renderList();
        document.dispatchEvent(new CustomEvent(`${NS}:hideByTags-updated`));
      });

      on($('#'+NS+'-hbt-export', mgrBox), 'click', async ()=>{
        const blob = new Blob([JSON.stringify(await getList(), null, 2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ao3h-hide-tags.json';
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      });

      on($('#'+NS+'-hbt-import', mgrBox), 'click', async ()=>{
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'application/json';
        input.addEventListener('change', async ()=>{
          const f = input.files?.[0]; if (!f) return;
          try{
            const arr = JSON.parse(await f.text());
            if (!Array.isArray(arr)) throw new Error('Invalid JSON (expected array)');
            await setList(arr);
            await renderList();
            document.dispatchEvent(new CustomEvent(`${NS}:hideByTags-updated`));
          } catch(err){ alert('Import failed: '+err.message); }
        }, { once:true });
        input.click();
      });

      on($('#'+NS+'-hbt-clear', mgrBox), 'click', async ()=>{
        if (!confirm('Clear all hidden tags?')) return;
        await setList([]);
        await renderList();
        document.dispatchEvent(new CustomEvent(`${NS}:hideByTags-updated`));
      });

      mgrBox.__open = open;
    }
    mgrBox.__open();
    renderList();
  }

  async function renderList(){
    const list = (await getList()).sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:'base'}));
    mgrList.innerHTML = '';
    mgrCount.textContent = `${list.length} tag${list.length!==1?'s':''}`;
    list.forEach((t, idx)=>{
      const row = document.createElement('div');
      row.className = `${NS}-pill`;
      row.innerHTML = `<b>${t}</b>`;
      const del = document.createElement('button');
      del.className = `${NS}-btn`;
      del.textContent = 'Delete';
      on(del, 'click', async ()=>{
        const arr = await getList();
        arr.splice(arr.indexOf(t), 1);
        await setList(arr);
        await renderList();
        document.dispatchEvent(new CustomEvent(`${NS}:hideByTags-updated`));
      });
      row.appendChild(del);
      mgrList.appendChild(row);
    });
  }

  /* ----------------------------- PUBLIC API ---------------------------- */
  let enabled = false;

  async function run(){
    if (!enabled) return;
    decorateTags();
    if (isListPage()) await applyListHiding();
    if (isWorkPage()) await applyWorkPageBanner();
  }

  AO3H.register?.({
    id: 'HideByTags',
    title: 'Hide works by tags',
    defaultFlagKey: 'hideByTags',

    init: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;

      // Manager entrypoint (menu fires this event)
      on(document, `${NS}:open-hide-manager`, (e)=> openManager());

      if (!enabled) return;

      onReady(() => {
        run();
        observe(document.body, debounce(run, 250));
      });
    },

    onFlagsUpdated: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;
      if (!enabled) {
        // un-wrap everything we've folded
        getWorkBlurbs().forEach(unwrap);
        $('#'+NS+'-tag-banner')?.remove();
      } else {
        run();
      }
    },
  });

  // React when the list changes
  on(document, `${NS}:hideByTags-updated`, debounce(run, 120));
  // Soft nav support
  on(document, `${NS}:navigated`, debounce(run, 120));

})();
