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

 /* --------------------------- Hidden Tags Manager (CLASSIC) --------------------------- */
function openManager(){
  css`
  .${NS}-mgr-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:999998; }
  .${NS}-mgr {
    position:fixed; top:10vh; left:50%; transform:translateX(-50%);
    background:#fff; color:#000; border:1px solid #e5e7eb; border-radius:12px;
    padding:12px; z-index:999999; box-shadow:0 16px 40px rgba(2,15,35,.12);
    font: 13px/1.4 system-ui,-apple-system, Segoe UI, Roboto, sans-serif;
    width:min(780px, 96vw); max-height: 82vh; display:grid; gap:10px; overflow:auto;
  }
  .${NS}-mgr h3{ margin:0 0 4px; font-size:18px; }
  .${NS}-row{ display:grid; grid-template-columns: 1fr auto; gap:10px; }
  .${NS}-ta{
    width:100%; min-height: 280px; resize:vertical;
    font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    border:1px solid #cfd6e4; border-radius:8px; padding:10px; background:#f9fbff;
  }
  .${NS}-help{ font-size:12px; color:#4b5563; }
  .${NS}-btnbar{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .${NS}-btn{
    height: 32px; padding: 0 12px; border-radius: 8px; border:1px solid #cfd6e4;
    background:#f5f7fb; cursor:pointer; transition: background .15s, transform .12s, border-color .15s;
    font-size:13px;
  }
  .${NS}-btn:hover{ background:#ecf1f8; border-color:#b8c3d8; transform: translateY(-1px); }
  .${NS}-count{ font-weight:600; }
  .${NS}-split{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .${NS}-mini{ width: 220px; }
  `;

  const backdrop = document.createElement('div');
  backdrop.className = `${NS}-mgr-backdrop`;

  const box = document.createElement('div');
  box.className = `${NS}-mgr`;
  box.innerHTML = `
    <h3>AO3 Helper — Hidden Tags</h3>
    <div class="${NS}-split">
      <span class="${NS}-help">One tag per line (canonical form). Example: <code>midoriya izuku & shinsou hitoshi</code></span>
      <span class="${NS}-count"></span>
    </div>
    <div class="${NS}-row">
      <textarea class="${NS}-ta" spellcheck="false" placeholder="Type or paste hidden tags here…"></textarea>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <input class="${NS}-mini" type="text" placeholder="Add single tag…" />
        <button class="${NS}-btn add" type="button">Add</button>
        <button class="${NS}-btn remove" type="button">Remove</button>
        <button class="${NS}-btn sort" type="button">Sort A→Z</button>
        <button class="${NS}-btn dedupe" type="button">De-duplicate</button>
        <button class="${NS}-btn export" type="button">Export JSON</button>
        <button class="${NS}-btn import" type="button">Import JSON</button>
        <button class="${NS}-btn close" type="button">Close</button>
      </div>
    </div>
    <div class="${NS}-btnbar">
      <button class="${NS}-btn apply" type="button">Save changes</button>
    </div>
  `;

  function close(){ backdrop.remove(); box.remove(); }

  backdrop.addEventListener('click', close);
  box.querySelector('.close').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e){
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  document.body.append(backdrop, box);

  const $ta = box.querySelector(`.${NS}-ta`);
  const $count = box.querySelector(`.${NS}-count`);
  const $input = box.querySelector(`.${NS}-mini`);

  const norm = (s)=> String(s||'').replace(/\s+/g,' ').replace(/\u00A0/g,' ').trim().toLowerCase();
  const readLines = ()=> $ta.value.split(/\r?\n/).map(norm).filter(Boolean);
  const writeLines = (arr)=>{ $ta.value = (arr||[]).join('\n'); updateCount(); };
  const updateCount = ()=>{ const n = readLines().length; $count.textContent = `${n} tag${n===1?'':'s'}`; };

  // Load existing list
  (async () => { writeLines(await getHidden()); })();

  // Buttons
  box.querySelector('.add').addEventListener('click', ()=>{
    const v = norm($input.value); if (!v) return;
    const list = readLines(); if (!list.includes(v)) list.push(v);
    writeLines(list); $input.value = '';
  });

  box.querySelector('.remove').addEventListener('click', ()=>{
    const v = norm($input.value); if (!v) return;
    writeLines(readLines().filter(t => t !== v)); $input.value = '';
  });

  box.querySelector('.sort').addEventListener('click', ()=>{
    writeLines(readLines().sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'})));
  });

  box.querySelector('.dedupe').addEventListener('click', ()=>{
    writeLines(Array.from(new Set(readLines())));
  });

  box.querySelector('.export').addEventListener('click', ()=>{
    const list = readLines();
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ao3h-hidden-tags.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  box.querySelector('.import').addEventListener('click', ()=>{
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]; if (!file) return;
      try {
        const incoming = JSON.parse(await file.text());
        if (!Array.isArray(incoming)) throw new Error('Not an array');
        const merged = Array.from(new Set(readLines().concat(incoming.map(norm)))).filter(Boolean);
        writeLines(merged);
      } catch (err) {
        alert('Invalid JSON file for tags.\n' + (err?.message || ''));
      }
    }, { once:true });
    input.click();
  });

  // Save changes
  box.querySelector('.apply').addEventListener('click', async ()=>{
    const cleaned = Array.from(new Set(readLines()));
    await setHidden(cleaned);

    // Keep groups map consistent (we can leave helpers in place)
    const map = await getGroupsMap();
    let changed = false;
    for (const k of Object.keys(map)) {
      if (!cleaned.includes(k)) { delete map[k]; changed = true; }
    }
    if (changed) await setGroupsMap(map);

    await processList(); // re-apply hides to the current page
    close();
  });

  $ta.addEventListener('input', updateCount);
}
/* ------------------------- /Hidden Tags Manager (CLASSIC) -------------------------- */

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
