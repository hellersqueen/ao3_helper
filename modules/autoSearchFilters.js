/* modules/autoSearchFilters.js — auto-apply 5k+ words • Complete • English filters */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, observe, debounce } = (AO3H.util || {});

  // ---------- Config ----------
  const WORDS_FROM = '5000';
  const COMPLETE   = 'T';
  const LANG       = 'en';

  // internal state
  let enabled = false;
  let mo = null;                  // MutationObserver (via helper)
  let unsubFlagSync = null;       // if we add extra listeners in future
  let applyGuard = false;         // prevent double-submit storms

  // ---------- Helpers ----------
  const dlog = (...a)=>{ if (AO3H.env?.DEBUG) console.log('[AO3H][AutoSearchFilters]', ...a); };

  function isWorksLikePath(p){
    return (/^\/works\/?$/.test(p) || /^\/tags\/[^/]+\/works\/?$/.test(p));
  }

  function scopeKeyFromLocation(loc = location){
    const m = loc.pathname.match(/^\/tags\/([^/]+)\/works\/?$/);
    if (m) return `${NS}:autoFilters:applied:tag:${m[1]}`;
    if (/^\/works\/?$/.test(loc.pathname)) return `${NS}:autoFilters:applied:works`;
    return `${NS}:autoFilters:applied:${loc.pathname}`;
  }

  function findFilterForm(){
    // try common AO3 locations first
    const f1 = document.querySelector('#work-filters form');
    if (f1) return f1;

    // otherwise, any form that targets /works or /tags/.../works
    const forms = Array.from(document.querySelectorAll('form')).filter(f=>{
      try {
        const a = new URL(f.getAttribute('action') || '', location.href);
        return /\/works\/?$/.test(a.pathname) || /^\/tags\/[^/]+\/works\/?$/.test(a.pathname);
      } catch { return false; }
    });
    return forms[0] || null;
  }

  function urlHasDesiredParams(u) {
    const sp = u.searchParams;
    return (
      sp.get('work_search[words_from]') === WORDS_FROM &&
      sp.get('work_search[complete]')   === COMPLETE &&
      sp.get('work_search[language_id]')=== LANG
    );
  }

  function setCoreFilterValues(form){
    // words_from
    let words = form.querySelector('input[name="work_search[words_from]"]');
    if (!words){
      words = document.createElement('input');
      words.type = 'hidden'; words.name = 'work_search[words_from]';
      form.appendChild(words);
    }
    words.value = WORDS_FROM;

    // complete flag (AO3 uses 'T' in hidden input when complete is selected)
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

    // language
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
    if (applyGuard) return;
    applyGuard = true;
    try {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    } finally {
      // release guard after a tick to avoid quick double fires
      setTimeout(()=>{ applyGuard = false; }, 800);
    }
  }

  function stripParams(url, keys){
    const u = new URL(url, location.origin);
    for (const k of keys) u.searchParams.delete(k);
    // wipe common nested keys work_search[...]
    for (const [k] of Array.from(u.searchParams)) {
      if (k.startsWith('work_search[')) {
        const inner = k.slice('work_search['.length, -1);
        if (keys.includes(k) || keys.includes(`work_search[${inner}]`) || keys.includes(inner)) {
          u.searchParams.delete(k);
        }
      }
    }
    return u.toString();
  }

  function clearCoreFilterValues(form){
    if (!form) return;

    const langSel = form.querySelector('select[name="work_search[language_id]"]');
    if (langSel) { langSel.value = ''; langSel.selectedIndex = 0; }

    const wFrom = form.querySelector('input[name="work_search[words_from]"]');
    const wTo   = form.querySelector('input[name="work_search[words_to]"]');
    if (wFrom) wFrom.value = '';
    if (wTo)   wTo.value = '';

    const completeHidden = form.querySelector('input[type="hidden"][name="work_search[complete]"]');
    if (completeHidden) completeHidden.value = '';

    const completeCheck = form.querySelector('input[name="work_search[complete]"][value="T"]');
    if (completeCheck) completeCheck.checked = false;

    // also uncheck radios named like complete/finished if they exist
    form.querySelectorAll('input[type="radio"][name*="complete"]').forEach(r=>{ r.checked = false; });
  }

  // ---------- Core actions ----------
  function applyAutoFiltersOncePerScope(){
    const u = new URL(location.href);
    const form = findFilterForm();
    if (!form) return;

    // prevent repeated runs on this DOM
    if (form.__ao3h_autofilter_done) return;

    const scopeKey = scopeKeyFromLocation(u);
    const alreadyAppliedInThisScope = sessionStorage.getItem(scopeKey) === '1';
    const haveDesired = urlHasDesiredParams(u);

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

  function resetFiltersToDefaultAndSubmit(){
    const form =
      document.querySelector('#work-filters form') ||
      document.querySelector('form#work_search') ||
      (()=> {
        const forms = Array.from(document.querySelectorAll('form')).filter(f=>{
          try { const a = new URL(f.getAttribute('action')||'', location.href);
                return /\/works\/?$/.test(a.pathname) || /^\/tags\/[^/]+\/works\/?$/.test(a.pathname);
          } catch { return false; }
        }); return forms[0] || null;
      })();

    // 1) Clear form fields (if present)
    clearCoreFilterValues(form);

    // 2) Clean the URL
    const cleanUrl = stripParams(location.href, [
      'work_search[language_id]',
      'work_search[words_from]',
      'work_search[words_to]',
      'work_search[complete]',
      'language_id','words_from','words_to','complete'
    ]);

    // 3) Clear per-scope "applied" memory so we don't re-force after off
    try { sessionStorage.removeItem(scopeKeyFromLocation()); } catch {}

    // 4) Submit/navigate so results revert to AO3 defaults
    if (form) {
      // make sure page resets to 1 when we submit back to defaults
      ensurePageOneWhenSubmitting(form);
      requestSubmit(form);
    } else if (cleanUrl !== location.href) {
      location.assign(cleanUrl);
    }
  }

  function run(){
    if (!enabled) return;
    if (!isWorksLikePath(location.pathname)) return;
    applyAutoFiltersOncePerScope();
  }

  // ---------- Module registration ----------
  function registerWithDisposer(){
    // Prefer new registry if present
    if (AO3H.modules && typeof AO3H.modules.register === 'function') {
      AO3H.modules.register('AutoSearchFilters', { title: 'Auto search filters (5k+, complete, EN)', enabledByDefault: true }, async () => {
        // start
        enabled = true;
        onReady(run);
        // watch DOM for filter widget appearing (pjax, lazy loads, etc.)
        mo = observe(document.body, debounce(run, 300));

        // return disposer
        return () => {
          enabled = false;
          try { mo?.disconnect?.(); } catch {}
          mo = null;
        };
      });
      return;
    }

    // Legacy shim fallback (still returns a disposer via the shim)
    AO3H.register?.({
      id: 'AutoSearchFilters',
      title: 'Auto search filters (5k+, complete, EN)',
      init: async ({ enabled: onFlag }) => {
        enabled = !!onFlag;
        if (!enabled) return;
        onReady(run);
        mo = observe(document.body, debounce(run, 300));
        return () => { enabled = false; try { mo?.disconnect?.(); } catch{} mo = null; };
      },
      onFlagsUpdated: async ({ enabled: onFlag }) => {
        const prev = enabled;
        enabled = !!onFlag;
        if (enabled && !prev) run();
        if (!enabled && prev) {
          // When turning OFF: immediately reset to defaults
          resetFiltersToDefaultAndSubmit();
        }
      },
    });
  }

  // If the new core is present, also respond instantly when toggled OFF
  // (Some UIs flip flags directly; this ensures we still reset)
  try {
    const key1 = 'mod:AutoSearchFilters:enabled';
    const key2 = 'mod:autosearchfilters:enabled';
    AO3H.flags?.watch?.(key1, (v)=>{ if (v === false) resetFiltersToDefaultAndSubmit(); });
    if (key2 !== key1) AO3H.flags?.watch?.(key2, (v)=>{ if (v === false) resetFiltersToDefaultAndSubmit(); });
  } catch {}

  registerWithDisposer();

})();
