// modules/autoSearchFilters.js
;(function () {
  'use strict';

  const MOD = { id: 'AutoSearchFilters', title: 'Auto Search Filters (5k+ • Complete • EN)' };

  // Desired defaults
  const WORDS_FROM = '5000';
  const COMPLETE   = 'T';
  const LANG       = 'en';

  function isWorksLikePath(p){
    return /^\/works\/?$/.test(p) || /^\/tags\/[^/]+\/works\/?$/.test(p);
  }

  function scopeKeyFromLocation(loc=location, NS='ao3h'){
    const m = loc.pathname.match(/^\/tags\/([^/]+)\/works\/?$/);
    if (m) return `${NS}:autoFilters:applied:tag:${m[1]}`;
    if (/^\/works\/?$/.test(loc.pathname)) return `${NS}:autoFilters:applied:works`;
    return `${NS}:autoFilters:applied:${loc.pathname}`;
  }

  function urlHasDesiredParams(u){
    const sp = u.searchParams;
    return sp.get('work_search[words_from]')===WORDS_FROM
        && sp.get('work_search[complete]')===COMPLETE
        && sp.get('work_search[language_id]')===LANG;
  }

  function findFilterForm(){
    const forms = Array.from(document.querySelectorAll('form')).filter(f=>{
      try{
        const a = new URL(f.getAttribute('action')||'', location.href);
        return /\/works\/?$/.test(a.pathname) || /^\/tags\/[^/]+\/works\/?$/.test(a.pathname);
      }catch{ return false; }
    });
    return forms[0] || document.querySelector('#work-filters form') || null;
  }

  function setCoreFilterValues(form){
    // words_from
    let words = form.querySelector('input[name="work_search[words_from]"]');
    if(!words){ words = document.createElement('input'); words.type='hidden'; words.name='work_search[words_from]'; form.appendChild(words); }
    words.value = WORDS_FROM;

    // complete = T
    let rComp = form.querySelector('input[name="work_search[complete]"][value="T"]');
    if(rComp){ rComp.checked = true; }
    else {
      let hidden = form.querySelector('input[type="hidden"][name="work_search[complete]"]');
      if(!hidden){ hidden = document.createElement('input'); hidden.type='hidden'; hidden.name='work_search[complete]'; form.appendChild(hidden); }
      hidden.value = COMPLETE;
    }

    // language = en
    let langSel = form.querySelector('select[name="work_search[language_id]"]');
    if(langSel){ langSel.value = LANG; }
    else {
      let langHidden = form.querySelector('input[type="hidden"][name="work_search[language_id]"]');
      if(!langHidden){ langHidden = document.createElement('input'); langHidden.type='hidden'; langHidden.name='work_search[language_id]'; form.appendChild(langHidden); }
      langHidden.value = LANG;
    }
  }

  function ensurePageOneWhenSubmitting(form){
    let page = form.querySelector('input[name="page"]');
    if(!page){ page = document.createElement('input'); page.type='hidden'; page.name='page'; form.appendChild(page); }
    page.value = '1';
  }

  function requestSubmit(form){
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }

  // init is called by core; only here we touch AO3H/util safely
  MOD.init = async (initialFlags) => {
    const A = window.AO3H || {};
    const { util = {}, flags: flagsAPI = {}, env = {} } = A;
    const { onReady, observe, debounce } = util || {};
    const { getFlags } = flagsAPI || {};
    const NS = env.NS || 'ao3h';

    if (!onReady || !observe || !debounce || !getFlags) {
      console.error('[AO3H][AutoSearchFilters] core not ready');
      return;
    }
    if (!initialFlags || !initialFlags.autoSearchFilters) return;

    function applyOncePerScope(){
      const u = new URL(location.href);
      if (!isWorksLikePath(u.pathname)) return;

      const have = urlHasDesiredParams(u);
      const form = findFilterForm();
      if(!form) return;
      if (form.__ao3h_autofilter_done) return;

      const scopeKey = scopeKeyFromLocation(u, NS);
      const already  = sessionStorage.getItem(scopeKey) === '1';

      if (have){
        sessionStorage.setItem(scopeKey, '1');
        return;
      }
      if (!already){
        form.__ao3h_autofilter_done = true;
        setCoreFilterValues(form);
        ensurePageOneWhenSubmitting(form);
        sessionStorage.setItem(scopeKey, '1');
        requestAnimationFrame(()=> requestSubmit(form));
      }
    }

    const run = () => applyOncePerScope();

    onReady(run);
    observe(document.body, debounce(run, 300));
    document.addEventListener(`${NS}:flags-updated`, async ()=>{
      const f = await getFlags();
      if (f.autoSearchFilters) run();
    });
  };

  // Robust registration: prefer AO3H.register, else queue, else direct map
  (function registerSafely(mod){
    const G = (window.AO3H = window.AO3H || {});
    if (typeof G.register === 'function') {
      try { G.register(mod); return; } catch {}
    }
    if (Array.isArray(G.__pending)) {
      G.__pending.push([mod]);
    }
    G.modules = G.modules || {};
    G.modules[mod.id] = mod;
  })(MOD);

})();
