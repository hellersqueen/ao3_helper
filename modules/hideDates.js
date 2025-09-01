/* modules/hideDates.js — hide dates via the module's own toggle */
;(function () {
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = AO3H.env?.NS || 'ao3h';
  const Flags = AO3H.flags;
  const log   = AO3H.util?.log || console;

  const MOD = 'HideDates';
  const ENABLE_KEY = `mod:${MOD}:enabled`;   // the ONLY toggle we use now
  const HIDE_CLASS = `${NS}-hide-dates`;

  if (!AO3H.modules?.register || !Flags) {
    log?.warn?.(`[${MOD}] AO3H core missing; aborting init`);
    return;
  }

  // CSS once
  (function injectCSS(){
    const CSS_ID = 'ao3h-hide-dates';
    const CSS_TEXT = `
      html.${HIDE_CLASS} p.datetime,
      html.${HIDE_CLASS} dd.published,
      html.${HIDE_CLASS} dd.status,
      html.${HIDE_CLASS} dd.completed,
      html.${HIDE_CLASS} li.published,
      html.${HIDE_CLASS} li.status,
      html.${HIDE_CLASS} li.completed { display: none !important; }
    `;
    if (AO3H.util?.css) AO3H.util.css(CSS_TEXT, CSS_ID);
    else if (!document.getElementById(CSS_ID)) {
      const s = document.createElement('style'); s.id = CSS_ID; s.textContent = CSS_TEXT;
      document.head.appendChild(s);
    }
  })();

  function apply(on) {
    document.documentElement.classList.toggle(HIDE_CLASS, !!on);
  }

  AO3H.modules.register(MOD, { title: 'Hide dates', enabledByDefault: true }, async function init () {
    // If an old UI toggle exists from earlier builds, remove its menu item.
    try {
      const oldKey = `ui:${MOD}:hidden`;
      document
        .querySelectorAll(`[data-flag="${oldKey}"], [data-ao3h-flag="${oldKey}"]`)
        .forEach(n => n.closest('[role="menuitem"], .menu-item, li, label')?.remove());
    } catch {}

    // Sync to module enabled state only.
    apply(!!Flags.get(ENABLE_KEY, true));
    const unwatch = Flags.watch(ENABLE_KEY, v => apply(!!v));

    log?.info?.(`[${MOD}] ready`);
    return () => { try { unwatch?.(); } catch {} apply(false); };
  });
})();
