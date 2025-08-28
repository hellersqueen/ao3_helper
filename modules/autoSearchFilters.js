/* modules/autoSearchFilters.js — auto-apply 5k+ words • Complete • English filters */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, observe, debounce } = (AO3H.util || {});
  const dlog = (...a)=>{ if (AO3H.env?.DEBUG) console.log('[AO3H][AutoSearchFilters]', ...a); };

  let enabled = false;

  const WORDS_FROM = '5000';
  const COMPLETE   = 'T';
  const LANG       = 'en';

  // Works listing paths: /works and /tags/<tag>/works
  function isWorksLikePath(p){
    return (/^\/works\/?$/.test(p) || /^\/tags\/[^/]+\/works\/?$/.test(p));
  }

  // Build a per-scope key so each tag (or /works) is handled once per session
  function scopeKeyFromLocation(loc = location){
    const m = loc.pathname.match(/^\/tags\/([^/]+)\/works\/?$/);
    if (m) return `${NS}:autoFilters:applied:tag:${m[1]}`;
    if (/^\/works\/?$/.test(loc.pathname)) return `${NS}:autoFilters:applied:works`;
    return `${NS}:autoFilters:applied:${loc.pathname}`;
  }

  function urlHasDesiredParams(u) {
    const sp = u.searchParams;
    return (
      sp.get('work_search[words_from]') === WORDS_FROM &&
      sp.get('work_search[complete]') === COMPLETE &&
      sp.get('work_search[language_id]') === LANG
    );
  }

  // Try to find the correct filter form on the page
  function findFilterForm(){
    const forms = Array.from(document.querySelectorAll('form')).filter(f=>{
      try {
        const a = new URL(f.getAttribute('action') || '', location.href);
        return /\/works\/?$/.test(a.pathname) || /^\/tags\/[^/]+\/works\/?$/.test(a.pathname);
      } catch { return false; }
    });
    if (forms.length) return forms[0];
    return document.querySelector('#work-filters form') || null;
  }

  // Ensure the three fields exist and set their values
  function setCoreFilterValues(form){
    let words = form.querySelector('input[name="work_search[words_from]"]');
    if (!words){
      words = document.createElement('input');
      words.type = 'hidden'; words.name = 'work_search[words_from]';
      form.appendChild(words);
    }
    words.value = WORDS_FROM;

    let rComp = form.querySelector('input[name="work_search[complete]"][value="T"]');
    if (rComp) {
      rComp.checked = true;
    } else {
      let hidden = form.querySelector('input[type="hidden"][name="work_search[complete]"]');
      if (!hidden){
        hidden = document.createElement('input');
        hidden.type = 'hidden'; hidden.name = 'work_search[complete]';
        form.appendChild(hidden);
      }
      hidden.value = COMPLETE;
    }

    let langSel = form.querySelector('select[name="work_search[language_id]"]');
    if (langSel){
      langSel.value = LANG;
    } else {
      let langHidden = form.querySelector('input[type="hidden"][name="work_search[language_id]"]');
      if (!langHidden){
        langHidden = document.createElement('input');
        langHidden.type = 'hidden'; langHidden.name = 'work_search[language_id]';
        form.appendChild(langHidden);
      }
      langHidden.value = LANG;
    }
  }

  function ensurePageOneWhenSubmitting(form){
    let page = form.querySelector('input[name="page"]');
    if (!page){
      page = document.createElement('input');
      page.type = 'hidden'; page.name = 'page';
      form.appendChild(page);
    }
    page.value = '1';
  }

  function requestSubmit(form){
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }

  function applyOncePerScope(){
    const u = new URL(location.href);
    const haveDesired = urlHasDesiredParams(u);
    const form = findFilterForm();
    if (!form) return;

    if (form.__ao3h_autofilter_done) return;

    const scopeKey = scopeKeyFromLocation(u);
    const alreadyAppliedInThisScope = sessionStorage.getItem(scopeKey) === '1';

    if (haveDesired){
      sessionStorage.setItem(scopeKey, '1');
      return;
    }

    if (!alreadyAppliedInThisScope){
      form.__ao3h_autofilter_done = true;
      setCoreFilterValues(form);
      ensurePageOneWhenSubmitting(form);
      sessionStorage.setItem(scopeKey, '1');
      requestAnimationFrame(() => requestSubmit(form));
    }
  }

  function run(){
    if (!enabled) return;
    if (!isWorksLikePath(location.pathname)) return;
    applyOncePerScope();
  }

  AO3H.register?.({
    id: 'AutoSearchFilters',
    title: 'Auto search filters (5k+, complete, EN)',
    defaultFlagKey: 'autoSearchFilters',

    init: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;
      if (!enabled) return;
      onReady(run);
      observe(document.body, debounce(run, 300));
    },

    onFlagsUpdated: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;
      if (enabled) run();
    },
  });

})();
