// remoteModules.js — dynamic module loader for AO3 Helper
;(function(){
  'use strict';

  const W  = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H = W.AO3H || {};
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  // --- Manifest location in your public GitHub repo ---
  const MANIFEST_URL = 'https://raw.githubusercontent.com/hellersqueen/ao3_helper/main/ao3h-manifest.json';

  // Simple script loader (ordered; no async reordering)
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.onload = () => resolve(url);
      s.onerror = () => reject(new Error('Failed to load ' + url));
      document.documentElement.appendChild(s);
    });
  }

  // Minimal storage facade (uses your AO3H.store if present)
  const Store = AO3H.store || {
    get(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  };

  // One-time migrations per manifest version (optional hook you can expand)
  async function runMigrationsIfNeeded(manifest) {
    const KEY = `${NS}:manifestVersion`;
    const prev = Store.get(KEY, null);
    const curr = manifest.version || '0.0.0';
    if (prev === curr) return;

    try {
      // Example: add your key renames here if you ever need them
      // if (prev && prev < '1.1.0') { /* rename some storage keys */ }

      Store.set(KEY, curr);
      console.log(`[AO3H] Migrations checked for version ${curr}`);
    } catch (err) {
      console.warn('[AO3H] Migration error:', err);
    }
  }

  async function fetchManifest() {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
    return res.json();
  }

  async function loadFromManifest(manifest) {
    const queue = [];
    if (manifest.core?.length)    queue.push(...manifest.core);
    if (manifest.menu?.length)    queue.push(...manifest.menu);
    if (manifest.modules?.length) queue.push(...manifest.modules);

    const v = encodeURIComponent(manifest.version || '');
    for (const url of queue) {
      const withV = v ? `${url}${url.includes('?') ? '&' : '?'}v=${v}` : url;
      await loadScript(withV);
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

  // Kick off at document start
  boot();
})();
