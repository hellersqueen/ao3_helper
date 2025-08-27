(function(){
.${NS}-fold[aria-expanded="true"] + .${NS}-cut { display:block; }
.${NS}-fold[aria-expanded="true"]{ position:sticky; top:0; z-index:100; margin-top:0; margin-bottom:8px; padding:.35rem .6rem; background:#fffbe6; border:1px solid #e6d28a; border-bottom:1px dashed #bdbdbd; border-radius:8px; opacity:.95; }
.${NS}-force-show{ display:list-item !important; }
/* inline icon / commas / manager CSS blocks kept here (omitted for brevity) */
`;


function updateFoldContent(fold, reasons, isExpanded){ fold.innerHTML=''; const note=document.createElement('span'); note.className=`${NS}-note`; note.textContent = isExpanded ? 'ℹ️ This work was hidden.' : 'This work is hidden'; const why=document.createElement('span'); why.className=`${NS}-reason`; const addText=(el,txt)=> el.appendChild(document.createTextNode(txt)); if (reasons.length){ addText(why,' — (Reason: tags include '); reasons.forEach((t,i)=>{ const strong=document.createElement('strong'); strong.textContent = t + (i<reasons.length-1 ? ',' : ''); why.appendChild(strong); if (i<reasons.length-1) why.appendChild(document.createTextNode(' ')); }); addText(why, '.)'); }
const hint=document.createElement('span'); hint.className=`${NS}-hint`; hint.textContent = isExpanded ? 'Click to hide' : 'Click to show'; fold.dataset.reasons = reasons.join('|'); fold.setAttribute('aria-expanded', String(!!isExpanded)); fold.append(note, document.createTextNode(' '), why, hint); }


function forceShow(el){ try{ el.hidden=false; el.style && el.style.removeProperty && el.style.removeProperty('display'); el.classList.add(`${NS}-force-show`); }catch{} }
function ensureWrapped(blurb){ if (blurb.classList.contains(`${NS}-wrapped`)){ return { fold: blurb.querySelector(`.${NS}-fold`), cut: blurb.querySelector(`.${NS}-cut`) }; }
blurb.classList.add(`${NS}-wrapped`); forceShow(blurb); const cut=document.createElement('div'); cut.className=`${NS}-cut`; while (blurb.firstChild){ cut.appendChild(blurb.firstChild); } blurb.appendChild(cut); const fold=document.createElement('div'); fold.className=`${NS}-fold`; fold.setAttribute('role','button'); fold.setAttribute('tabindex','0'); fold.setAttribute('aria-expanded','false'); blurb.insertBefore(fold, cut);
const doToggle=()=>{ const nowExpanded = fold.getAttribute('aria-expanded')!=='true'; fold.setAttribute('aria-expanded', String(nowExpanded)); const reasons=(fold.dataset.reasons||'').split('|').filter(Boolean); updateFoldContent(fold, reasons, nowExpanded); };
fold.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); doToggle(); });
fold.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); doToggle(); } });
return { fold, cut };
}


function wrapWork(blurb, reasons){ const { fold } = ensureWrapped(blurb); const isExpanded = fold.getAttribute('aria-expanded')==='true'; updateFoldContent(fold, reasons, isExpanded); forceShow(blurb); }
function unwrapWork(blurb){ const fold=blurb.querySelector(`.${NS}-fold`); const cut=blurb.querySelector(`.${NS}-cut`); blurb.classList.remove(`${NS}-wrapped`, `${NS}-force-show`); if (fold) fold.remove(); if (cut){ while (cut.firstChild){ blurb.insertBefore(cut.firstChild, cut); } cut.remove(); } blurb.hidden=false; blurb.style && blurb.style.removeProperty && blurb.style.removeProperty('display'); }


function getScopesAndTags(root=document){ const scopes = getWorkBlurbs(root); if (scopes.length===0){ const fallback = document.querySelector('#workskin')||document.querySelector('#main')||document; scopes.push(fallback); } return scopes; }


function ensureInlineIcons(root=document){ getScopesAndTags(root).forEach(ensureInlineIconsFor); }
function ensureInlineIconsFor(scope){ const tags = getTagLinks(scope); const managedLists = new Set();
tags.forEach(a=>{ a.classList.add(`${NS}-tag-wrap`); let ico = a.querySelector(`.${NS}-hide-ico`); if (!ico){ const canon = canonicalFromAnchor(a); if (canon){ ico=document.createElement('span'); ico.className=`${NS}-hide-ico`; ico.title='Hide this tag from results'; ico.setAttribute('role','button'); ico.setAttribute('aria-label', `Hide tag "${canon}"`); ico.dataset.tag = canon; ico.textContent = '🚫'; a.appendChild(ico); } }
let textWrap = a.querySelector(`.${NS}-tag-txt`); if (!textWrap){ for (let n=a.firstChild; n; n=n.nextSibling){ if (n.nodeType===Node.TEXT_NODE && n.nodeValue.trim()){ textWrap=document.createElement('span'); textWrap.className=`${NS}-tag-txt`; a.insertBefore(textWrap, n); textWrap.appendChild(n); break; } } }
const li = a.closest('li'); const list = a.closest('ul.commas, ol.commas, .commas'); if (!li||!list||!textWrap) return; managedLists.add(list); const needsComma = !!li.nextElementSibling; let comma = a.querySelector(`.${NS}-tag-comma`); if (needsComma){ if (!comma){ comma=document.createElement('span'); comma.className=`${NS}-tag-comma`; comma.textContent=','; a.insertBefore(comma, ico || null); } } else if (comma){ comma.remove(); }
});
managedLists.forEach(ul=> ul.classList.add(`${NS}-own-commas`));
}


function toast(msg){ const el=document.createElement('div'); el.className=`${NS}-toast`; el.textContent=msg; document.body.appendChild(el); requestAnimationFrame(()=> el.style.opacity='1'); setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=> el.remove(), 200); }, 1000); }


function attachDelegatesOnce(){ if (delegatesAttached) return; delegatesAttached = true;
document.addEventListener('click', async (e)=>{ const ico = e.target?.closest?.(`.${NS}-hide-ico`); if (!ico) return; e.preventDefault(); e.stopPropagation(); const canon=(ico.dataset.tag||'').trim(); if (!canon) return; await addHiddenTag(canon); await processList(); toast(`Hidden: ${canon}`); }, true);
document.addEventListener('click', async (e)=>{ const link = e.target?.closest?.('a.tag'); if (!link || !e.altKey) return; e.preventDefault(); const canon=canonicalFromAnchor(link); if (!canon) return; await addHiddenTag(canon); await processList(); toast(`Hidden: ${canon}`); }, true);
}


function openManager(){ document.dispatchEvent(new CustomEvent(`${NS}:open-hide-manager`)); }


async function processList(){ if (!enabled) return; const hiddenList = await getHidden(); const blurbs = getWorkBlurbs();
blurbs.forEach(blurb=>{ let scopeForTags = blurb; const existingCut = blurb.querySelector(`.${NS}-cut`); if (existingCut) scopeForTags = existingCut; const reasons = reasonsFor(scopeForTags, hiddenList); if (reasons.length===0){ if (blurb.classList.contains(`${NS}-wrapped`)) unwrapWork(blurb); else { forceShow(blurb); } return; } wrapWork(blurb, reasons); }); }


function run(){ if (!enabled) return; ensureInlineIcons(); processList(); }


const MOD = { id: 'HideByTags' };
MOD.init = async (flags)=>{
enabled = !!flags.hideByTags;
AO3H.util.onReady(()=>{
document.addEventListener(`${NS}:open-hide-manager`, openManager);
if (typeof GM_registerMenuCommand === 'function') {
GM_registerMenuCommand('AO3 Helper: Manage hidden tags…', openManager);
}
AO3H.util.on(document, `${NS}:flags-updated`, async ()=>{
const f = await getFlags(); const was = enabled; enabled = !!f.hideByTags;
if (enabled && !was){ attachDelegatesOnce(); run(); if (!observerActive){ observe(document.body, debounce(run, 250)); observerActive=true; } }
else if (!enabled && was){ getWorkBlurbs().forEach(unwrapWork); }
else if (enabled && was){ run(); }
});
if (enabled){ attachDelegatesOnce(); run(); if (!observerActive){ observe(document.body, debounce(run, 250)); observerActive=true; } }
});
};


AO3H.register(MOD);
})();
