// modules/hideDates.js 

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
  }

  function removeStyles() {
    const node = document.getElementById(STYLE_ID);
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function apply(on) {
    document.documentElement.classList.toggle(HIDE_CLASS, !!on);
  }

  AO3H.modules.register(
    MOD,
    { title: 'Hide dates', enabledByDefault: true },
    function init () {
      installStyles();
      apply(!!Flags.get(ENABLE_KEY, true));

      const unwatch = Flags.watch(ENABLE_KEY, v => apply(!!v));

      LOG.debug?.(`[AO3H][${MOD}] ready`);
      return () => {
        try { unwatch?.(); } catch {}
        apply(false);
        removeStyles();
        LOG.debug?.(`[AO3H][${MOD}] stopped`);
      };
    }
  );
})();
