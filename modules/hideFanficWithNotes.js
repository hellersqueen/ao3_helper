(function(){
const NS = AO3H.env.NS;
const MOD_ID = 'HideFanficWithNotes';
const DB_NAME='hiddenWorksDB'; const STORE='works';


const CSS = `
.custom-hide-button { position: relative; float: right; margin-right: 10px; top: -25px; }
.hide { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: #f0f0f0; border-radius: 5px; }
.hide .hideleft { width: 85%; font-size: 0.9em; line-height: 1.2em; margin-right: 10px; }
.hide .hideright { display: flex; gap: 6px; }
li.blurb { padding: 5px 5px; }
#${NS}-m5-picker{ position:fixed; z-index:99999; min-width:280px; max-width:420px; background:#fff; border:1px solid #d0d0d0; border-radius:10px; box-shadow:0 10px 28px rgba(0,0,0,.18); padding:12px; display:none; font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#222; left:50%; top:50%; transform:translate(-50%,-50%); }
#${NS}-m5-picker.${NS}-open{ display:block; }
#${NS}-m5-picker .${NS}-m5p-title{ font-weight:600; margin-bottom:6px; }
#${NS}-m5-picker .${NS}-m5p-chips{ display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 10px; }
#${NS}-m5-picker .${NS}-m5p-chip{ border:1px solid #c7c7c7; border-radius:999px; padding:4px 10px; cursor:pointer; user-select:none; background:#fafafa; }
#${NS}-m5-picker .${NS}-m5p-row{ display:flex; gap:8px; }
#${NS}-m5-picker input[type="text"]{ flex:1; padding:6px 8px; border:1px solid #cfcfcf; border-radius:6px; }
#${NS}-m5-picker button{ border:1px solid #bdbdbd; background:#f6f6f6; border-radius:6px; padding:6px 10px; cursor:pointer; }
#${NS}-m5-picker button:hover{ background:#efefef; }
#${NS}-m5-picker .${NS}-m5p-hint{ font-size:12px; color:#666; margin-top:8px; }
#${NS}-m5-picker .${NS}-bar{ display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
`;


function injectCSS(){ if (document.getElementById(`${NS}-m5-style`)) return; const el=document.createElement('style'); el.id=`${NS}-m5-style`; el.textContent=CSS; document.head.appendChild(el); }


let db; function openDB(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open(DB_NAME,1); req.onupgradeneeded=(ev)=>{ const dbx=ev.target.result; const os=dbx.createObjectStore(STORE,{keyPath:'workId'}); os.createIndex('reason','reason',{unique:false}); os.createIndex('isHidden','isHidden',{unique:false}); }; req.onsuccess=(e)=>{ db=e.target.result; resolve(db); }; req.onerror=(e)=> reject(e.target.error); }); }
function getAllWorks(){ return new Promise((res,rej)=>{ const tx=db.transaction([STORE],'readonly'); const req=tx.objectStore(STORE).getAll(); req.onsuccess=()=> res(req.result||[]); req.onerror=()=> rej(new Error('getAll failed')); }); }
function getWork(id){ return new Promise((res,rej)=>{ const tx=db.transaction([STORE],'readonly'); const req=tx.objectStore(STORE).get(id); req.onsuccess=()=> res(req.result||null); req.onerror=()=> rej(new Error('get failed')); }); }
function putWork(rec){ return new Promise((res,rej)=>{ const tx=db.transaction([STORE],'readwrite'); const req=tx.objectStore(STORE).put(rec); req.onsuccess=()=> res(true); req.onerror=()=> rej(new Error('put failed')); }); }


function workIdFromBlurb(jQblurb){ const href=jQblurb.find('.header .heading a:first').attr('href')||''; return href.replace(/(#.*|\?.*)$/,''); }


const USER_QUICK_TAGS_DEFAULT=[ 'crossover','sequel','bad summary','parent/dad','unfinished','growing up together','not sterek focused','1rst pov','established','always-a-girl' ];
const QUICK_TAGS_KEY = `${NS}:m5QuickTagsUser`;
function getUserQuickTags(){ try{ const v=JSON.parse(localStorage.getItem(QUICK_TAGS_KEY)||'null'); if (Array.isArray(v)&&v.every(x=>typeof x==='string')) return v; }catch{} return USER_QUICK_TAGS_DEFAULT; }


async function pickReason(seed=''){
let panel=document.getElementById(`${NS}-m5-picker`); if(!panel){ panel=document.createElement('div'); panel.id=`${NS}-m5-picker`; panel.innerHTML=`
<div class="${NS}-m5p-title">Choose a tag or write a note</div>
<div class="${NS}-m5p-chips"></div>
<div class="${NS}-m5p-row"><input type="text" class="${NS}-m5p-input" placeholder="Write a note here…" /><button type="button" class="${NS}-m5p-add">Add</button></div>
<div class="${NS}-m5p-hint">Tip: click a tag to save immediately • Esc to cancel • Enter = Add</div>
<div class="${NS}-bar"><button type="button" class="${NS}-m5p-cancel">Cancel</button></div>`; document.body.appendChild(panel); }
const chipsWrap=panel.querySelector(`.${NS}-m5p-chips`); chipsWrap.innerHTML=''; for (const tag of getUserQuickTags()){ const chip=document.createElement('span'); chip.className=`${NS}-m5p-chip`; chip.textContent=tag; chip.addEventListener('click',()=>finish(tag)); chipsWrap.appendChild(chip);} const input=panel.querySelector(`.${NS}-m5p-input`); const addBtn=panel.querySelector(`.${NS}-m5p-add`); const cancelBtn=panel.querySelector(`.${NS}-m5p-cancel`); input.value=seed||''; const onAdd=()=>{ const v=(input.value||'').trim(); if(!v) return; finish(v); }; const onCancel=()=> finish(null); const onKey=(e)=>{ if(e.key==='Escape'){ e.preventDefault(); finish(null);} if(e.key==='Enter'){ e.preventDefault(); onAdd(); } };
addBtn.onclick=onAdd; cancelBtn.onclick=onCancel; panel.classList.add(`${NS}-open`); input.focus(); document.addEventListener('keydown', onKey, true);
let resolver; const p=new Promise(r=> resolver=r);
function finish(result){ panel.classList.remove(`${NS}-open`); document.removeEventListener('keydown', onKey, true); resolver(result); }
return p;
}


function ensureHideButton(jQ, jQblurb){ if (jQblurb.find('.custom-hide-button').length) return; const btn=document.createElement('button'); btn.textContent='Hide'; btn.className='custom-hide-button'; jQblurb.find('.header').append(btn);
btn.addEventListener('click', async ()=>{ const workId=workIdFromBlurb(jQblurb); try{ const existing=await getWork(workId); let reason=await pickReason(existing && existing.reason ? existing.reason : ''); if (reason===null) return; reason=String(reason).trim(); if(!reason) return; hideWork(jQ, jQblurb[0], reason); await putWork({ workId, reason, isHidden:true }); }catch(e){ console.error('[AO3H] hide click failed', e); } }); }


function hideWork(jQ, blurbEl, reason){ const jQb=jQ(blurbEl); if (jQb.find('.hide').length) return; const hideDiv=document.createElement('div'); hideDiv.className='hide'; hideDiv.innerHTML=`<div class="hideleft">This work is hidden: <strong class="reason-text"></strong></div><div class="hideright"><button type="button" class="edit-reason">Edit</button><button type="button" class="show">Show</button><button type="button" class="unhide">Unhide</button></div>`; hideDiv.querySelector('.reason-text').textContent=reason; blurbEl.appendChild(hideDiv); jQb.children(':not(.hide)').css('display','none'); jQb.find('.custom-hide-button').hide(); }
function showWork(jQ, blurbEl){ const jQb=jQ(blurbEl); jQb.children(':not(.hide)').show(); jQb.find('.hide').remove(); jQb.find('.custom-hide-button').show(); }


async function exportHiddenWorks(){ try{ if(!db) await openDB(); const all=await getAllWorks(); const blob=new Blob([JSON.stringify(all, null, 2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`ao3h-hidden-works-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); alert('Exported '+all.length+' hidden works.'); }catch(e){ console.error('[AO3H] export failed', e); alert('Export failed. See console for details.'); } }
window.ao3hExportHiddenWorks = exportHiddenWorks;


async function importHiddenWorksFromFile(file){ try{ const text=await file.text(); const parsed=JSON.parse(text); if(!Array.isArray(parsed)){ alert('Import failed: JSON must be an array.'); return; } if(!db) await openDB(); let created=0, updated=0, skipped=0; for (const rec of parsed){ if(!rec||typeof rec!=='object'){ skipped++; continue; } const workId=rec.workId||rec.id||rec.href; const reason=rec.reason??''; if(!workId){ skipped++; continue; } const toPut={ workId, reason, isHidden: rec.isHidden ?? true }; const existing=await getWork(workId); existing?updated++:created++; await putWork(toPut); } alert(`Import complete.\nCreated: ${created}\nUpdated: ${updated}\nSkipped: ${skipped}`); if (confirm('Reload now to apply hides on this page?')) location.reload(); }catch(e){ console.error('[AO3H] import failed', e); alert('Import failed. See console for details.'); } }
function promptImportHiddenWorks(){ const input=document.createElement('input'); input.type='file'; input.accept='application/json'; input.addEventListener('change', ()=>{ if (input.files && input.files[0]) importHiddenWorksFromFile(input.files[0]); }, { once:true }); input.click(); }
window.ao3hImportHiddenWorks = promptImportHiddenWorks;


try{ if (typeof GM_registerMenuCommand!=='undefined'){ GM_registerMenuCommand('Export hidden works (JSON)', exportHiddenWorks); GM_registerMenuCommand('Import hidden works (JSON)', promptImportHiddenWorks); } }catch{}


async function transferFromLocalStorage(){ try{ const legacy=JSON.parse(localStorage.getItem('ao3HiddenWorks')||'{}'); const keys=Object.keys(legacy); if(!keys.length) return; if(!db) await openDB(); for (const workId of keys){ const reason=legacy[workId]; const existing=await getWork(workId); if(!existing) await putWork({ workId, reason, isHidden:true }); } localStorage.removeItem('ao3HiddenWorks'); }catch(e){ console.warn('[AO3H] legacy transfer skipped', e); } }


async function init(){ if (!/\/works\b/.test(location.pathname)) return; injectCSS(); const jQ = window.jQuery; if (!jQ){ console.error('[AO3H] jQuery missing'); return; } if(!db) await openDB(); await transferFromLocalStorage(); const all=await getAllWorks(); jQ('ol.index li.blurb').each((_,el)=>{ const jQb=jQ(el); const id=workIdFromBlurb(jQb); ensureHideButton(jQ, jQb); const rec=all.find(r=> r.workId===id); if (rec && rec.isHidden) hideWork(jQ, el, rec.reason); });
jQ(document).on('click', '.hide .show', async function(){ const blurbEl=jQ(this).closest('li')[0]; const jQb=jQ(blurbEl); const id=workIdFromBlurb(jQb); showWork(jQ, blurbEl); try{ const rec=await getWork(id); if(rec
