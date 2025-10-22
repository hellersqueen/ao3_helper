/* ────────────────────────────────────────────────────────────────
   AO3H — store.js
   Centralise toute la persistance (flags, settings, cache, etc.)
   - Fallback GM_* → localStorage si sandbox absent
   - Sérialisation JSON sécurisée
   - Préfixe "ao3h:" pour éviter collisions
   - API : get, set, del, keys, ns()
──────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const PREFIX = 'ao3h:';
  const hasGM =
    typeof GM_getValue === 'function' &&
    typeof GM_setValue === 'function' &&
    typeof GM_deleteValue === 'function' &&
    typeof GM_listValues === 'function';

  function safeParse(v, def) {
    try {
      return v === undefined || v === null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  }

  function safeStringify(v) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  const raw = {
    get: (key, def) => {
      if (hasGM) return GM_getValue(PREFIX + key, def);
      const val = localStorage.getItem(PREFIX + key);
      return safeParse(val, def);
    },

    set: (key, val) => {
      if (hasGM) return GM_setValue(PREFIX + key, val);
      localStorage.setItem(PREFIX + key, safeStringify(val));
    },

    del: (key) => {
      if (hasGM) return GM_deleteValue(PREFIX + key);
      localStorage.removeItem(PREFIX + key);
    },

    keys: () => {
      if (hasGM) return GM_listValues().filter(k => k.startsWith(PREFIX));
      return Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
    },
  };

  // Namespacing: ex. AO3H.store.ns('HideByTags').set('enabled', true)
  raw.ns = (mod) => ({
    get: (k, d) => raw.get(`${mod}:${k}`, d),
    set: (k, v) => raw.set(`${mod}:${k}`, v),
    del: (k) => raw.del(`${mod}:${k}`),
    keys: () => raw.keys().filter(k => k.startsWith(`${PREFIX}${mod}:`)),
  });

  // Attache au namespace global AO3H
  if (window.AO3H) window.AO3H.store = raw;
  else window.AO3H = { store: raw };

  console.debug('[AO3H] Store ready (GM fallback:', !hasGM ? 'localStorage' : 'GM', ')');
})();
