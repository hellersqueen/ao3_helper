/* modules/hideDates.js — compat core actuel (Flags) + zéro GM_*
   - Ne s’auto-démarre pas à l’aveugle : se cale sur le flag
   - Aucun GM_* (persistance via ton core + store.js)
   - Ajoute/retire une classe sur <html> et injecte un style scoping
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

  if (!AO3H.modules?.register || !Flags) {
    LOG?.warn?.(`[${MOD}] AO3H core/flags missing; aborting init`);
    return;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      /* AO3H:${MOD} — masque différentes zones contenant des dates */
      html.${HIDE_CLASS} time,
      html.${HIDE_CLASS} .datetime,
      html.${HIDE_CLASS} .posted,
      html.${HIDE_CLASS} .status,
      html.${HIDE_CLASS} dl.stats dd.published,
      html.${HIDE_CLASS} dl.stats dd.status,
      html.${HIDE_CLASS} .series .datetime,
      html.${HIDE_CLASS} .chapter .datetime,
      html.${HIDE_CLASS} .work .datetime {
        display: none !important;
      }
    `.trim();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.documentElement.appendChild(style);
  }

  function removeStyles() {
    const node = document.getElementById(STYLE_ID);
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function apply(on) {
    document.documentElement.classList.toggle(HIDE_CLASS, !!on);
  }

  // Enregistrement avec la signature actuelle du core:
  // register(id, meta, initFn) where initFn peut retourner un disposer
  AO3H.modules.register(
    MOD,
    { title: 'Hide dates', enabledByDefault: true },
    function init () {
      installStyles();

      // état initial depuis les flags
      apply(!!Flags.get(ENABLE_KEY, true));

      // suivre le toggle (core met à jour le flag → on s’applique)
      const unwatch = Flags.watch(ENABLE_KEY, v => apply(!!v));

      try { LOG.debug?.(`[AO3H] [${MOD}] ready`); } catch {}

      // disposer: arrêter d’écouter + retirer l’effet
      return () => {
        try { unwatch?.(); } catch {}
        apply(false);
        removeStyles();
        try { LOG.debug?.(`[AO3H] [${MOD}] stopped`); } catch {}
      };
    }
  );
})();
