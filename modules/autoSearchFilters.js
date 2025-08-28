;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const { util = {}, flags = {}, env:{ NS='ao3h' } = {} } = AO3H;
  const { onReady, observe, debounce } = util;
  const { getFlags } = flags;

  if (!onReady || !observe || !debounce || !getFlags) {
    // core not ready yet → still register module safely so core can init it later
    safeRegister({ id:'AutoSearchFilters', init: ()=>{} });
    return;
  }

  const WORDS_FROM = '5000', COMPLETE = 'T', LANG = 'en';

  function isWorksLikePath(p){
    return /^\/works\/?$/.test(p) || /^\/tags\/[^/]+\/works\/?$/.test(p);
  }
  function scopeKeyFromLocation(loc=location){
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
    let words = form.querySelector('input[name="work_search[words_from]"]');
    if(!words){ words = document.createElement('input'); words.type='hidden'; words.name='work_search[words_from]'; form.appendChild(words); }
    words.value = WORDS_FROM;

    let rComp = form.querySelector('input[name="work_search[complete]"][value="T"]');
    if(rComp){ rComp.checked = true; }
    else {
      let hidden = form.querySelector('input[type="hidden"][name="work_search[complete]"]');
      if(!hidden){ hidden = document.createElement('input'); hidden.type='hidden'; hidden.name='work_search[complete]'; form.appendChild(hidden); }
      hidden.value = COMPLETE;
    }

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
  function applyOncePerScope(){
    const u = new URL(location.href);
    const have = urlHasDesiredParams(u);
    const form = findFilterForm();
    if(!form) return;
    if (form.__ao3h_autofilter_done) return;

    const scopeKey = scopeKeyFromLocation(u);
    const already = sessionStorage.getItem(scopeKey) === '1';

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
  function run(){
    if (!isWorksLikePath(location.pathname)) return;
    applyOncePerScope();
  }

  const MOD = {
    id: 'AutoSearchFilters',
    init: async (flags)=>{
      if (!flags.autoSearchFilters) return;
      onReady(run);
      observe(document.body, debounce(run, 300));
      document.addEventListener(`${NS}:flags-updated`, async ()=>{
        const f = await getFlags();
        if (f.autoSearchFilters) run();
      });
    }
  };

  safeRegister(MOD);

  function safeRegister(mod){
    const G = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    G.AO3H = G.AO3H || {};
    if (typeof G.AO3H.register === 'function') { try { G.AO3H.register(mod); return; } catch {}
    }
    (G.AO3H.__pending = G.AO3H.__pending || []).push([mod]);
    (G.AO3H.modules = G.AO3H.modules || {})[mod.id] = mod;
  }
})();
