;(function(){
  'use strict';

  // --- dépendances du core ---
  const { onReady, observe, debounce, css } = AO3H.util;
  const { getFlags } = AO3H.flags;
  const Storage = AO3H.store;
  const NS = AO3H.env.NS || 'ao3h';

  // --- état interne ---
  let enabled = false;
  let delegatesAttached = false;
  let observerActive = false;

  // --- clés storage (GM + miroir localStorage) ---
  const LS_MIRROR = true;
  const TM_KEY = 'hideTags';                     // GM (via AO3H.store)
  const LS_KEY = `${NS}:hideTags`;               // localStorage mirror

  // --------- utils ----------
  const toCanon = (s)=> String(s||'').trim().toLowerCase();
  const toNorm  = (s)=> (s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();

  function getWorkBlurbs(root=document){
    const a = Array.from(root.querySelectorAll('#main .work.blurb, #main .bookmark.blurb, #main .blurb, li.blurb'));
    return Array.from(new Set(a));
  }
  const getTagLinks = (scope) => Array.from(scope.querySelectorAll('a.tag'));

  function canonicalFromAnchor(a){
    try{
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/tags\/([^/]+)/);
      if (!m) return null;
      let s = decodeURIComponent(m[1]).replace(/\+/g, ' ');
      s = s.replace(/\*a\*/gi, '&').replace(/\*s\*/gi, '/');
      return toCanon(s.replace(/\s+/g, ' ').replace(/\u00A0/g, ' '));
    }catch{ return null; }
  }

  async function getHidden(){
    let list = (await Storage.get(TM_KEY, [])) || [];
    if ((!list || !list.length) && LS_MIRROR){
      try{
        const fromLS = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        if (Array.isArray(fromLS) && fromLS.length) list = fromLS;
      }catch{}
    }
    return list;
  }
  async function setHidden(arr){
    const cleaned = Array.from(new Set(arr.map(toCanon))).filter(Boolean);
    await Storage.set(TM_KEY, cleaned);
    if (LS_MIRROR){
      try{ localStorage.setItem(LS_KEY, JSON.stringify(cleaned)); }catch{}
    }
    return cleaned;
  }
  async function addHiddenTag(canon){
    const cur = await getHidden();
    if (!cur.includes(canon)){ cur.push(canon); await setHidden(cur); }
  }

  function reasonsFor(scope, hiddenList){
    const canon = getTagLinks(scope).map(canonicalFromAnchor).filter(Boolean);
    return canon.filter(t => hiddenList.includes(t));
  }

  // --------- styles ----------
  css`
/* Fold/cut */
.${NS}-fold{
  position: relative; display:flex; align-items:center; gap:.5rem; width:98%;
  padding:.65rem .8rem; border:1px dashed #bdbdbd; border-radius:8px;
  background:#fee9e9; font-size:.75rem; color:#333; cursor:pointer; user-select:none;
}
.${NS}-fold *{ pointer-events:none; }
.${NS}-hint{ margin-left:auto; font-size:.85em; opacity:.7; }
.${NS}-cut{ display:none; }
.${NS}-fold[aria-expanded="true"] + .${NS}-cut { display:block; }
.${NS}-fold[aria-expanded="true"]{
  position:sticky; top:0; z-index:100; margin-top:0; margin-bottom:8px;
  padding:.35rem .6rem; background:#fffbe6; border:1px solid #e6d28a; border-bottom:1px dashed #bdbdbd; border-radius:8px; opacity:.95;
}
.${NS}-force-show{ display:list-item !important; }

/* Icône inline pour cacher un tag */
a.tag.${NS}-tag-wrap{ position:relative; padding-right:0; overflow:visible; transition:padding-right .12s; }
a.tag.${NS}-tag-wrap:hover, a.tag.${NS}-tag-wrap:focus-visible{ padding-right:1.4em; }
.${NS}-hide-ico{
  position:absolute; right:.2em; top:50%; transform:translateY(-50%);
  width:1em; height:1em; line-height:1em; text-align:center; font-size:.9em;
  border:1px solid #bbb; border-radius:50%; background:#fff; opacity:0; pointer-events:none; transition:opacity .15s, transform .15s; z-index:2;
}
a.tag.${NS}-tag-wrap:hover .${NS}-hide-ico, a.tag.${NS}-tag-wrap:focus-visible .${NS}-hide-ico{ opacity:1; pointer-events:auto; }
.${NS}-hide-ico:hover{ transform:translateY(-50%) scale(1.06); }

/* Commas AO3 gérées */
.${NS}-own-commas li::after{ content:"" !important; }
a.tag.${NS}-tag-wrap .${NS}-tag-comma{ margin-right:.35em; text-decoration:none; }

/* Toast */
.${NS}-toast{
  position:fixed; bottom:10px; left:50%; transform:translateX(-50%);
  background:rgba(0,0,0,.75); color:#fff; padding:6px 10px; border-radius:10px;
  font-size:11px; z-index:999999; opacity:0; transition:opacity .15s ease; pointer-events:none;
}
  `;

  // --------- UI helpers ----------
  function updateFoldContent(fold, reasons, isExpanded){
    fold.innerHTML = '';
    const note = document.createElement('span'); note.className = `${NS}-note`;
    note.textContent = isExpanded ? 'ℹ️ This work was hidden.' : 'This work is hidden';
    const why = document.createElement('span'); why.className = `${NS}-reason`;

    if (reasons.length){
      why.appendChild(document.createTextNode(' — (Reason: tags include '));
      reasons.forEach((t,i)=>{
        const strong = document.createElement('strong'); strong.textContent = t + (i<reasons.length-1 ? ',' : '');
        why.appendChild(strong); if (i<reasons.length-1) why.appendChild(document.createTextNode(' '));
      });
      why.appendChild(document.createTextNode('.)'));
    }
    const hint = document.createElement('span'); hint.className = `${NS}-hint`; hint.textContent = isExpanded ? 'Click to hide' : 'Click to show';
    fold.dataset.reasons = reasons.join('|');
    fold.setAttribute('aria-expanded', String(!!isExpanded));
    fold.append(note, document.createTextNode(' '), why, hint);
  }

  function forceShow(el){
    try{ el.hidden=false; el.style && el.style.removeProperty && el.style.removeProperty('display'); el.classList.add(`${NS}-force-show`); }catch{}
  }

  function ensureWrapped(blurb){
    if (blurb.classList.contains(`${NS}-wrapped`)){
      return { fold: blurb.querySelector(`.${NS}-fold`), cut: blurb.querySelector(`.${NS}-cut`) };
    }
    blurb.classList.add(`${NS}-wrapped`);
    forceShow(blurb);

    const cut = document.createElement('div'); cut.className = `${NS}-cut`;
    while (blurb.firstChild){ cut.appendChild(blurb.firstChild); }
    blurb.appendChild(cut);

    const fold = document.createElement('div');
    fold.className = `${NS}-fold`;
    fold.setAttribute('role','button');
    fold.setAttribute('tabindex','0');
    fold.setAttribute('aria-expanded','false');
    blurb.insertBefore(fold, cut);

    const doToggle = () => {
      const nowExpanded = fold.getAttribute('aria-expanded')!=='true';
      fold.setAttribute('aria-expanded', String(nowExpanded));
      const reasons=(fold.dataset.reasons||'').split('|').filter(Boolean);
      updateFoldContent(fold, reasons, nowExpanded);
    };
    fold.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); doToggle(); });
    fold.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); doToggle(); } });

    return { fold, cut };
  }

  function wrapWork(blurb, reasons){
    const { fold } = ensureWrapped(blurb);
    const isExpanded = fold.getAttribute('aria-expanded')==='true';
    updateFoldContent(fold, reasons, isExpanded);
    forceShow(blurb);
  }
  function unwrapWork(blurb){
    const fold=blurb.querySelector(`.${NS}-fold`);
    const cut =blurb.querySelector(`.${NS}-cut`);
    blurb.classList.remove(`${NS}-wrapped`, `${NS}-force-show`);
    if (fold) fold.remove();
    if (cut){
      while (cut.firstChild){ blurb.insertBefore(cut.firstChild, cut); }
      cut.remove();
    }
    blurb.hidden=false;
    blurb.style && blurb.style.removeProperty && blurb.style.removeProperty('display');
  }

  // --- icône inline + virgule gérée ---
  function ensureInlineIcons(root=document){
    const scopes = getWorkBlurbs(root);
    if (scopes.length===0){
      const fallback = document.querySelector('#workskin')||document.querySelector('#main')||document;
      scopes.push(fallback);
    }
    scopes.forEach(ensureInlineIconsFor);
  }
  function ensureInlineIconsFor(scope){
    const tags = getTagLinks(scope);
    const managedLists = new Set();

    tags.forEach(a=>{
      a.classList.add(`${NS}-tag-wrap`);

      let ico = a.querySelector(`.${NS}-hide-ico`);
      if (!ico){
        const canon = canonicalFromAnchor(a);
        if (canon){
          ico=document.createElement('span');
          ico.className=`${NS}-hide-ico`;
          ico.title='Hide this tag from results';
          ico.setAttribute('role','button');
          ico.setAttribute('aria-label', `Hide tag "${canon}"`);
          ico.dataset.tag = canon;
          ico.textContent = '🚫';
          a.appendChild(ico);
        }
      }

      // wrap texte pour placer virgule avant l’icône
      let textWrap = a.querySelector(`.${NS}-tag-txt`);
      if (!textWrap){
        for (let n=a.firstChild; n; n=n.nextSibling){
          if (n.nodeType===Node.TEXT_NODE && n.nodeValue.trim()){
            textWrap=document.createElement('span');
            textWrap.className=`${NS}-tag-txt`;
            a.insertBefore(textWrap, n);
            textWrap.appendChild(n);
            break;
          }
        }
      }

      // gérer la virgule AO3 dans <a>
      const li = a.closest('li');
      const list = a.closest('ul.commas, ol.commas, .commas');
      if (!li || !list || !textWrap) return;

      managedLists.add(list);
      const needsComma = !!li.nextElementSibling;
      let comma = a.querySelector(`.${NS}-tag-comma`);
      if (needsComma){
        if (!comma){
          comma=document.createElement('span');
          comma.className=`${NS}-tag-comma`;
          comma.textContent=',';
          a.insertBefore(comma, ico || null);
        }
      } else if (comma){ comma.remove(); }
    });

    managedLists.forEach(ul=> ul.classList.add(`${NS}-own-commas`));
  }

  // --- petit toast ---
  function toast(msg){
    const el=document.createElement('div');
    el.className=`${NS}-toast`;
    el.textContent=msg;
    document.body.appendChild(el);
    requestAnimationFrame(()=> el.style.opacity='1');
    setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=> el.remove(), 200); }, 900);
  }

  // --- délégations (une seule fois) ---
  function attachDelegatesOnce(){
    if (delegatesAttached) return;
    delegatesAttached = true;

    // Click sur l’icône 🚫
    document.addEventListener('click', async (e)=>{
      const ico = e.target?.closest?.(`.${NS}-hide-ico`);
      if (!ico) return;
      e.preventDefault(); e.stopPropagation();
      const canon=(ico.dataset.tag||'').trim();
      if (!canon) return;
      await addHiddenTag(canon);
      await processList();
      toast(`Hidden: ${canon}`);
    }, true);

    // Alt+click sur le lien de tag
    document.addEventListener('click', async (e)=>{
      const link = e.target?.closest?.('a.tag');
      if (!link || !e.altKey) return;
      e.preventDefault();
      const canon=canonicalFromAnchor(link);
      if (!canon) return;
      await addHiddenTag(canon);
      await processList();
      toast(`Hidden: ${canon}`);
    }, true);
  }

  // --- “manager” simple (ouvre une alerte avec la liste) ---
  async function openManager(){
    const list = await getHidden();
    alert(`Hidden tags (${list.length}):\n\n${list.join('\n') || '(none)'}`);
  }

  // --- traitement principal ---
  async function processList(){
    if (!enabled) return;
    const hiddenList = await getHidden();
    const blurbs = getWorkBlurbs();

    blurbs.forEach(blurb=>{
      let scopeForTags = blurb;
      const existingCut = blurb.querySelector(`.${NS}-cut`);
      if (existingCut) scopeForTags = existingCut;

      const reasons = reasonsFor(scopeForTags, hiddenList);

      if (reasons.length===0){
        if (blurb.classList.contains(`${NS}-wrapped`)) unwrapWork(blurb);
        else { forceShow(blurb); }
        return;
      }
      wrapWork(blurb, reasons);
    });
  }

  function run(){
    if (!enabled) return;
    ensureInlineIcons();
    processList();
  }

  // --- module definition ---
  const MOD = { id: 'HideByTags' };
  MOD.init = async (flags)=>{
    enabled = !!flags.hideByTags;

    onReady(()=>{
      // écouteur “Manage hidden tags…” depuis le menu du core
      document.addEventListener(`${NS}:open-hide-manager`, openManager);
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('AO3 Helper: Manage hidden tags…', openManager);
      }

      // réagir aux toggles
      document.addEventListener(`${NS}:flags-updated`, async ()=>{
        const f = await getFlags();
        const was = enabled; enabled = !!f.hideByTags;

        if (enabled && !was){
          attachDelegatesOnce(); run();
          if (!observerActive){ observe(document.body, debounce(run, 250)); observerActive = true; }
        } else if (!enabled && was){
          getWorkBlurbs().forEach(unwrapWork);
        } else if (enabled && was){
          run();
        }
      });

      // état initial
      if (enabled){
        attachDelegatesOnce(); run();
        if (!observerActive){ observe(document.body, debounce(run, 250)); observerActive = true; }
      }
    });
  };

  AO3H.register(MOD);
})();
