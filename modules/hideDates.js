/* modules/hideDates.js — DIAGNOSTIC VERSION
   Objectif: vérifier (1) que le fichier se charge, (2) que le flag est lu,
   (3) que l'effet s'applique correctement quand on toggle via le menu.
   -> Logs très verbeux, styles visibles.
*/

;(function () {
  'use strict';

  const AO3H   = window.AO3H || {};
  const NS     = AO3H.env?.NS || 'ao3h';
  const Flags  = AO3H.flags;
  const LOG    = (AO3H.util && AO3H.util.log) ? AO3H.util.log : console;

  const MOD        = 'HideDates';
  const ENABLE_KEY = `mod:${MOD}:enabled`;
  const HIDE_CLASS = `${NS}-hide-dates`;
  const STYLE_ID   = `${NS}-${MOD}-style`;

  // 0) Sanity
  try {
    LOG.info?.(`[AO3H][${MOD}] DIAG: file loaded. NS="${NS}" ENABLE_KEY="${ENABLE_KEY}"`);
  } catch {}

  if (!AO3H.modules?.register || !Flags) {
    LOG.error?.(`[AO3H][${MOD}] DIAG: missing core/flags -> abort`);
    return;
  }

  // 1) Styles très visibles + masquage dates
  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      /* === DIAG VISUEL ===
         Quand ${HIDE_CLASS} est actif, on ajoute un contour pour confirmer l'état.
       */
      html.${HIDE_CLASS} {
        outline: 4px dashed rgba(255,0,0,.65) !important;
        outline-offset: 6px !important;
      }

      /* Masquage des dates (couverture large) */
      html.${HIDE_CLASS} time,
      html.${HIDE_CLASS} .datetime,
      html.${HIDE_CLASS} .posted,
      html.${HIDE_CLASS} .status,
      html.${HIDE_CLASS} dl.stats dd.published,
      html.${HIDE_CLASS} dl.stats dd.status,
      html.${HIDE_CLASS} .series .datetime,
      html.${HIDE_CLASS} .chapter .datetime,
      html.${HIDE_CLASS} .work .datetime,
      html.${HIDE_CLASS} p.datetime,
      html.${HIDE_CLASS} dd.completed,
      html.${HIDE_CLASS} li.published,
      html.${HIDE_CLASS} li.status,
      html.${HIDE_CLASS} li.completed {
        display: none !important;
      }
    `.trim();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.documentElement.appendChild(style);
    try { LOG.info?.(`[AO3H][${MOD}] DIAG: styles installed (${STYLE_ID})`); } catch {}
  }

  function removeStyles() {
    const node = document.getElementById(STYLE_ID);
    if (node && node.parentNode) node.parentNode.removeChild(node);
    try { LOG.info?.(`[AO3H][${MOD}] DIAG: styles removed`); } catch {}
  }

  function apply(on) {
    document.documentElement.classList.toggle(HIDE_CLASS, !!on);
    try { LOG.info?.(`[AO3H][${MOD}] DIAG: apply(${!!on}) -> class "${HIDE_CLASS}" ${on ? 'ADDED' : 'REMOVED'}`); } catch {}
  }

  // 2) Register (signature actuelle: init() retourne un disposer)
  AO3H.modules.register(
    MOD,
    { title: 'Hide dates (DIAG)', enabledByDefault: true },
    function init () {
      try { LOG.info?.(`[AO3H][${MOD}] DIAG: init() called`); } catch {}

      installStyles();

      const initial = !!Flags.get(ENABLE_KEY, true);
      try { LOG.info?.(`[AO3H][${MOD}] DIAG: initial flag ${ENABLE_KEY} =`, initial); } catch {}
      apply(initial);

      const unwatch = Flags.watch(ENABLE_KEY, v => {
        try { LOG.info?.(`[AO3H][${MOD}] DIAG: flag changed ${ENABLE_KEY} ->`, v); } catch {}
        apply(!!v);
      });

      try { LOG.info?.(`[AO3H][${MOD}] DIAG: ready & watching "${ENABLE_KEY}"`); } catch {}

      // disposer
      return () => {
        try { unwatch?.(); } catch {}
        apply(false);
        removeStyles();
        try { LOG.info?.(`[AO3H][${MOD}] DIAG: disposed`); } catch {}
      };
    }
  );
})();
