(function (global) {
  'use strict';

  const AO3H = window.AO3H || {};
  const Storage = AO3H.store;
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const LS_MIRROR = true;
  const LS_KEY = `${NS}:hideTags`;
  const TM_KEY = 'hideTags';
  const LS_KEY_GROUPS = `${NS}:hideTagsGroups`;
  const TM_KEY_GROUPS = 'hideTagsGroups';

  let enabled = false;

  // ----------------------------------------------------
  // === Hidden tags (persistence)
  // ----------------------------------------------------
  async function getHidden(){
    let list = (await Storage.get(TM_KEY, [])) || [];
    if ((!list || !list.length) && LS_MIRROR){
      try {
        const fromLS = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        if (Array.isArray(fromLS) && fromLS.length) list = fromLS;
      }catch{}
    }
    return list;
  }

  async function setHidden(arr){
    const cleaned = Array.from(new Set(arr.map(s => String(s).trim().toLowerCase()).filter(Boolean)));
    await Storage.set(TM_KEY, cleaned);
    if (LS_MIRROR){
      try{ localStorage.setItem(LS_KEY, JSON.stringify(cleaned)); }catch{}
    }
    return cleaned;
  }

  async function addHiddenTag(canon){
    const cur = await getHidden();
    if (!cur.includes(canon)){
      cur.push(canon);
      await setHidden(cur);
    }
  }

  // ----------------------------------------------------
  // === Groups Map
  // ----------------------------------------------------
  async function getGroupsMap(){
    let map = (await Storage.get(TM_KEY_GROUPS, {})) || {};
    if ((!map || !Object.keys(map).length) && LS_MIRROR){
      try {
        const fromLS = JSON.parse(localStorage.getItem(LS_KEY_GROUPS) || '{}');
        if (fromLS && typeof fromLS === 'object') map = fromLS;
      }catch{}
    }
    const cleaned = {};
    for (const [k,v] of Object.entries(map)) {
      if (!k) continue;
      cleaned[String(k).toLowerCase()] = String(v||'').trim();
    }
    return cleaned;
  }

  async function setGroupsMap(map){
    const hidden = await getHidden();
    const setHiddenTags = new Set(hidden);
    const cleaned = {};
    for (const [k,v] of Object.entries(map||{})) {
      const key = String(k).toLowerCase();
      if (setHiddenTags.has(key)) cleaned[key] = String(v||'').trim();
    }
    await Storage.set(TM_KEY_GROUPS, cleaned);
    if (LS_MIRROR){
      try{ localStorage.setItem(LS_KEY_GROUPS, JSON.stringify(cleaned)); }catch{}
    }
    return cleaned;
  }

  // ----------------------------------------------------
  // === Toast helper (inline feedback)
  // ----------------------------------------------------
  function toast(msg){
    const el = document.createElement('div');
    el.className = `${NS}-toast`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(()=> el.style.opacity = '1');
    setTimeout(()=> {
      el.style.opacity = '0';
      setTimeout(()=> el.remove(), 200);
    }, 1000);
  }

  // ----------------------------------------------------
  // === Process all blurbs
  // ----------------------------------------------------
  async function processList(){
    if (!enabled) return;
    const hiddenList = await getHidden();
    const hiddenSet  = new Set(hiddenList);
    const blurbs = global.hideByTagsEngine.getWorkBlurbs();

    blurbs.forEach(blurb => {
      let scopeForTags = blurb;
      const existingCut = blurb.querySelector(`.${NS}-cut`);
      if (existingCut) scopeForTags = existingCut;

      const reasons = global.hideByTagsEngine.reasonsFor(scopeForTags, hiddenSet);

      if (reasons.length === 0){
        if (blurb.classList.contains(`${NS}-wrapped`)) global.hideByTagsEngine.unwrapWork(blurb);
        else { global.hideByTagsEngine.forceShow(blurb); }
        return;
      }
      global.hideByTagsEngine.wrapWork(blurb, reasons);
    });
  }

  // ----------------------------------------------------
  // === Run wrapper
  // ----------------------------------------------------
  function run(){
    if (!enabled) return;
    global.hideByTagsEngine.ensureInlineIcons();
    processList();
  }

  // ----------------------------------------------------
  // === Integration with AO3H flags (same as original)
  // ----------------------------------------------------
  function integrateModules(Engine, UI){
    const { attachDelegatesOnce } = Engine;
    const ENABLE_KEY = 'mod:HideByTags:enabled';
    enabled = !!AO3H.flags.get(ENABLE_KEY, true);

    AO3H.util.onReady(() => {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('AO3 Helper: Manage hidden tags…', UI.openManager);
        GM_registerMenuCommand('AO3 Helper: Show hidden tags', async ()=>{
          const list = await getHidden();
          console.log('[AO3H] Hidden tags (canonical):', list);
          alert(`Hidden tags (${list.length}):\n\n${list.join('\n') || '(none)'}`);
        });
        GM_registerMenuCommand('AO3 Helper: Export hidden tags (JSON)', async ()=>{
          const list = await getHidden();
          const blob = new Blob([JSON.stringify(list,null,2)],{type:'application/json'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'ao3h-hidden-tags.json';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        });
        GM_registerMenuCommand('AO3 Helper: Import hidden tags (paste JSON)', async ()=>{
          const raw = prompt('Paste JSON array of canonical tags to import:\n(e.g., ["midoriya izuku & shinsou hitoshi"])');
          if (!raw) return;
          try {
            const incoming = JSON.parse(raw);
            if (!Array.isArray(incoming)) throw new Error('Not an array');
            const current = await getHidden();
            const merged = Array.from(new Set(current.concat(incoming.map(s => String(s).trim().toLowerCase())))).filter(Boolean);
            await setHidden(merged);
            await processList();
            alert(`Imported. Hidden tags now: ${merged.length}`);
          } catch {
            alert('Import failed: please paste a valid JSON array.');
          }
        });
      }

      if (enabled){
        attachDelegatesOnce(addHiddenTag, processList, toast);
        run();
        if (!global.hideByTagsEngine._observerActive){
          AO3H.util.observe(document.body, AO3H.util.debounce(run, 250));
          global.hideByTagsEngine._observerActive = true;
        }
      }
    });

    AO3H.flags.watch(ENABLE_KEY, (val) => {
      const wasEnabled = enabled;
      enabled = !!val;

      if (enabled && !wasEnabled){
        attachDelegatesOnce(addHiddenTag, processList, toast);
        run();
        if (!global.hideByTagsEngine._observerActive){
          AO3H.util.observe(document.body, AO3H.util.debounce(run, 250));
          global.hideByTagsEngine._observerActive = true;
        }
        return;
      }

      if (!enabled && wasEnabled){
        global.hideByTagsEngine.getWorkBlurbs().forEach(global.hideByTagsEngine.unwrapWork);
        return;
      }

      if (enabled && wasEnabled){
        run();
      }
    });
  }

  // ----------------------------------------------------
  // === Always-on Manager exposure
  // ----------------------------------------------------
  function exposeManagerAlwaysOn(openManager){
    const handler = (e)=>{ try{e?.preventDefault?.();}catch{} openManager(); };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ()=> {
        document.addEventListener(`${NS}:open-hide-manager`, handler);
      }, {once:true});
    } else {
      document.addEventListener(`${NS}:open-hide-manager`, handler);
    }
    try{ window.ao3hOpenHiddenTagsManager = openManager; }catch{}
  }

  // ----------------------------------------------------
  // === Exports
  // ----------------------------------------------------
   global.hideByTagsPersistence = {
    getHidden,
    setHidden,
    addHiddenTag,
    getGroupsMap,
    setGroupsMap,
    processList,
    integrateModules,
    exposeManagerAlwaysOn
  };

  // 🔥 Immediately attach the "always-on" manager listener when UI exists
  try {
    const checkReady = () => {
      if (window.hideByTagsUI?.openManager) {
        exposeManagerAlwaysOn(window.hideByTagsUI.openManager);
      } else {
        // keep checking until UI loads (since order may vary)
        setTimeout(checkReady, 300);
      }
    };
    checkReady();
  } catch (err) {
    console.error('[HideByTags] Failed to attach always-on manager listener:', err);
  }

})(window);
