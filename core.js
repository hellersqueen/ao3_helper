(function(){
.${NS}-root.${NS}-open .${NS}-menu{ display:block; }
`;
if (document.querySelector(`li.${NS}-root`)) return;
const li = document.createElement('li'); li.className = `dropdown ${NS}-root`; li.setAttribute('aria-haspopup','true');
const toggle = document.createElement('span'); toggle.className = `${NS}-navlink`; toggle.textContent = 'AO3 Helper'; toggle.setAttribute('aria-hidden','true');
const menu = document.createElement('ul'); menu.className = `menu dropdown-menu ${NS}-menu`; menu.setAttribute('role','menu');


function item(label, key, hint){
const li = document.createElement('li'); const a = document.createElement('a'); a.href='#'; a.setAttribute('role','menuitemcheckbox'); a.dataset.flag = key; a.innerHTML = `<span class="${NS}-label">${label}</span><span class="${NS}-state">${flags[key] ? '✓' : ''}</span>${hint ? `<span class="${NS}-kbd">${hint}</span>` : ''}`; a.setAttribute('aria-checked', String(!!flags[key])); li.appendChild(a); return li;
}
menu.appendChild(item('Save scroll position', 'saveScroll'));
menu.appendChild(item('Chapter word count', 'chapterWordCount'));
menu.appendChild(item('Hide works by tags', 'hideByTags'));
menu.appendChild(item('Auto filter', 'autoSearchFilters'));
menu.appendChild(item('Hide Fanfic (with notes)', 'hideFanficWithNotes'));


{ const manageLi = document.createElement('li'); const manageA = document.createElement('a'); manageA.href = '#'; manageA.innerHTML = `<span>Manage hidden tags…</span>`; manageA.addEventListener('click', (e)=>{ e.preventDefault(); document.dispatchEvent(new CustomEvent(`${NS}:open-hide-manager`)); closeMenu(); }); manageLi.appendChild(manageA); menu.appendChild(manageLi); }


{ ensureHiddenWorksChooser(); const ieLi = document.createElement('li'); const ieA = document.createElement('a'); ieA.href='#'; ieA.innerHTML = `<span>Hidden works…</span><span class="${NS}-kbd">Import / Export</span>`; ieA.addEventListener('click',(e)=>{ e.preventDefault(); const dlg = document.getElementById('ao3h-ie-dialog'); if (!dlg) { alert('Chooser dialog not found'); return; } try { dlg.showModal(); } catch { dlg.setAttribute('open',''); } closeMenu(); }); ieLi.appendChild(ieA); menu.appendChild(ieLi); }


li.appendChild(toggle); li.appendChild(menu); li.tabIndex = 0;


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
const a = e.target.closest('a'); if (!a || !a.dataset.flag) return; e.preventDefault(); const key = a.dataset.flag; const flags = await getFlags(); const next = !flags[key]; await setFlag(key, next); a.querySelector(`.${NS}-state`).textContent = next ? '✓' : ''; a.setAttribute('aria-checked', String(next)); document.dispatchEvent(new CustomEvent(`${NS}:flags-updated`));
});


document.addEventListener(`${NS}:flags-updated`, async ()=>{
const flags = await getFlags(); menu.querySelectorAll('a[data-flag]').forEach(a=>{ const k=a.dataset.flag, on=!!flags[k]; a.querySelector(`.${NS}-state`).textContent = on ? '✓' : ''; a.setAttribute('aria-checked', String(on)); });
});


const navUL = document.querySelector('ul.primary.navigation.actions') || document.querySelector('#header .primary.navigation ul') || document.querySelector('#header .navigation ul');
if (navUL) navUL.insertBefore(li, navUL.firstChild); else { const floater = document.createElement('div'); floater.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:999999;'; floater.appendChild(li); document.body.appendChild(floater); }
}


// --------------------------- MODULE REGISTRY -----------------------------
const modules = []; // {id, match?, init}
function register(def){ modules.push(def); }
function isMatch(m){ return m.match ? m.match(location) : true; }
async function start(){
const flags = await getFlags();
buildSettingsUI(flags);
for (const m of modules) {
try {
if (!isMatch(m)) continue;
await m.init(flags);
} catch(e){ console.error(`[AO3H] ${m.id||'module'} failed`, e); }
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


// Auto-start once DOM is ready (modules may also use onReady)
onReady(start);
})();
