// modules/autoSearchFilters.js
;(function () {
  'use strict';

  const AO3H = window.AO3H || {};
  const { env:{ NS } = {}, util = {}, flags } = AO3H;
  const { onReady, observe, debounce, on } = util || {};
  const { getFlags } = flags || {};

  if (!NS || !onReady || !observe || !debounce || !on || !getFlags) {
    console.error('[AO3H][AutoSearchFilters] core not ready');
    return;
  }

  const MOD_ID = 'AutoSearchFilters';

  let enabled = false;
  const WORDS_FROM = '5000';
  const COMPLETE   = 'T';
  const LANG       = 'en';

  // /works  OR  /tags/<tag>/works
  function isWorksLikePath(p){
    return /^\/works\/?$/.test(p) || /^\/tags\/[^/]+\/works\/?$/.test(p);
  }

  // key so each scope (/works or each /tags/<tag>/works) is applied once per session
  function scopeKeyFromLocation(loc = location){
    const m = loc.pathname.match(/^\/tags\/([^/]+)\/works\/?$/);
    if (m) return `ao3h:autoFilters:applied:tag:${m[1]}`;
    if (/^\/works\/?$/.test(loc.pathname)) return `ao3h:autoFilters:applied:works`;
    return `ao3h:autoFilters:applied:${loc.pathname}`;
  }

  function urlHasDesiredParams(u) {
    const sp = u.searchParams;
    return (
      sp.get('work_search[words_from]')    === WORDS_FROM &&
      sp.get('work_search[complete]')      === COMPLETE &&
      sp.get('work_search[language_id]')   === LANG
    );
  }

  // Find the proper filter form
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

  // Ensure the three fields exist and have the desired values
  function setCoreFilterValues(form){
    // words_from
    let words = form.querySelector('input[name="work_search[words_from]"]');
    if (!words){
      words = document.createElement('input');
      words.type = 'hidden';
      words.name = 'work_search[words_from]';
      form.appendChild(words);
    }
    words.value = WORDS_FROM;

    // complete = T
    let rComp = form.querySelector('input[name="work_search[complete]"][value="T"]');
    if (rComp){
      rComp.checked = true;
    } else {
      let hidden = form.querySelector('input[type="hidden"][name="work_search[complete]"]');
      if (!hidden){
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'work_search[complete]';
        form.appendChild(hidden);
      }
      hidden.value = COMPLETE;
    }

    // language = en
    let langSel = form.querySelector('select[name="work_search[language_id]"]');
    if (langSel){
      langSel.value = LANG;
    } else {
      let langHidden = form.querySelector('input[type="hidden"][name="work_search[language_id]"]');
      if (!langHidden){
        langHidden = document.createElement('input');
        langHidden.type = 'hidden';
        langHidden.name = 'work_search[language_id]';
        form.appendChild(langHidden);
      }
      langHidden.value = LANG;
    }
  }

  // Only set page=1 when we first apply (avoid breaking pagination later)
  function ensurePageOneWhenSubmitting(form){
    let page = form.querySelector('input[name="page"]');
    if (!page){
      page = document.createElement('input');
      page.type = 'hidden';
      page.name = 'page';
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

    // prevent double-run within same paint / mutation
    if (form.__ao3h_autofilter_done) return;

    const scopeKey = scopeKeyFromLocation(u);
    const already = sessionStorage.getItem(scopeKey) === '1';

    // If URL already has the params, mark and bail
    if (haveDesired){
      sessionStorage.setItem(scopeKey, '1');
      return;
    }

    // If not yet applied in this scope this session → apply once
    if (!already){
      form.__ao3h_autofilter_done = true;
      setCoreFilterValues(form);
      ensurePageOneWhenSubmitting(form);
      sessionStorage.setItem(scopeKey, '1');
      requestAnimationFrame(() => requestSubmit(form));
    }
    // If already applied but URL lacks params, do nothing (don't reset page)
  }

  function run(){
    if (!enabled) return;
    if (!isWorksLikePath(location.pathname)) return;
    applyOncePerScope();
    // console.log('[AO3H:AutoSearchFilters] active on', location.pathname);
  }

  async function init(initialFlags){
    enabled = !!(initialFlags && initialFlags.autoSearchFilters);
    if (!enabled) return;

    onReady(run);

    // Re-check on big DOM changes (form might appear later)
    observe(document.body, debounce(run, 300));

    // reacts to menu toggles
    on(document, `${NS}:flags-updated`, async () => {
      try { enabled = (await getFlags()).autoSearchFilters; }
      catch { enabled = true; }
      if (enabled) run();
    });
  }

  AO3H.modules = AO3H.modules || {};
  AO3H.modules[MOD_ID] = { id: MOD_ID, title: 'Auto filter (5k+ • Complete • EN)', init };
})();
