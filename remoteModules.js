// remoteModules.js — dynamic module loader for AO3 Helper (CSP-safe)
;(function(){
  'use strict';

  const W  = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // --- Manifest location in your public GitHub repo ---
  const MANIFEST_URL = 'https://raw.githubusercontent.com/hellersqueen/ao3_helper/main/ao3h-manifest.json';

  // ---- Robust GET that works in Tampermonkey sandbox across origins ----
  function getText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: { 'Accept': 'text/plain,*/*;q=0.9' },
          onload: (res) => (res.status >= 200 && res.status < 300)
            ? resolve(res.responseText)
            : reject(new Error(`HTTP ${res.status} for ${url}`)),
          onerror: () => reject(new Error(`Network error for ${url}`)),
          ontimeout: () => reject(new Error(`Timeout for ${url}`)),
        });
      } else {
        fetch(url, { cache: 'no-store', credentials: 'omit' })
          .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status} for ${url}`)))
          .then(resolve, reject);
      }
    });
  }

  // ---- Evaluate JS code text in userscript sandbox (ordered) ----
  async function evalScriptFrom(url) {
    const code = await getText(url);
    // help debugging: make the code show up with a virtual filename
    const wrapped = `${code}\n//# sourceURL=${url}`;
    // Use Function over eval to avoid scoping surprises
    // eslint-disable-next-line no-new-func
    const fn = new Function(wrapped);
    fn();
    return url;
  }

  // Minimal storage facade (uses your AO3H.store if present)
  const Store = AO3H.store || {
    get(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  };

  // One-time migrations per manifest version (optional hook)
  async function runMigrationsIfNeeded(manifest) {
    const KEY = `${NS}:manifestVersion`;
    const prev = Store.get(KEY, null);
    const curr = manifest.version || '0.0.0';
    if (prev === curr) return;

    try {
      // Example:
      // if (prev && prev < '1.1.0') { /* rename some storage keys safely here */ }
      Store.set(KEY, curr);
      console.log(`[AO3H] Migrations checked for version ${curr}`);
    } catch (err) {
      console.warn('[AO3H] Migration error:', err);
    }
  }

  async function fetchManifest() {
    const text = await getText(MANIFEST_URL);
    return JSON.parse(text);
  }

  async function loadFromManifest(manifest) {
    const list = [];
    if (manifest.core?.length)    list.push(...manifest.core);
    if (manifest.menu?.length)    list.push(...manifest.menu);
    if (manifest.modules?.length) list.push(...manifest.modules);

    const v = encodeURIComponent(manifest.version || '');
    for (const baseUrl of list) {
      const url = v ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${v}` : baseUrl;
      await evalScriptFrom(url); // ordered, one by one
    }
  }

  async function boot() {
    try {
      const manifest = await fetchManifest();
      await runMigrationsIfNeeded(manifest);
      await loadFromManifest(manifest);

      if (W.AO3H?.modules?.bootAll) {
        await W.AO3H.modules.bootAll();
        W.AO3H.menu?.rebuild?.();
        console.log('[AO3H] Modules booted via manifest and menu rebuilt');
      } else {
        console.warn('[AO3H] modules.bootAll not found; verify core/menu loaded from manifest');
      }
    } catch (e) {
      console.error('[AO3H] Manifest boot error:', e);
    }
  }

  // Start
  boot();
})();
