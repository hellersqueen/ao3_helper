/* modules/hideDates.js — Hide dates via Standard Lifecycle Rule
   - Aucun GM_* direct, aucune auto-exécution.
   - Le core appelle start()/stop() selon le toggle (flags).
   - Ajoute/retire une classe sur <html> + injecte un style scoping.
*/

;(function () {
  'use strict';

  const AO3H  = window.AO3H || {};
  const NS    = AO3H.env?.NS || 'ao3h';
  const MOD   = 'HideDates';
  const LOG   = (AO3H.util && AO3H.util.log) ? AO3H.util.log : console;

  // Classe appliquée au scope (on prend <html> pour couvrir tout)
  const HIDE_CLASS = `${NS}-hide-dates`;
  const STYLE_ID   = `${NS}-${MOD}-style`;

  let RUNNING = false;

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

  function addScopeClass() {
    document.documentElement.classList.add(HIDE_CLASS);
  }

  function removeScopeClass() {
    document.documentElement.classList.remove(HIDE_CLASS);
  }

  // ── Lifecycle API ───────────────────────────────────────────────
  async function start() {
    if (RUNNING) return;
    RUNNING = true;

    installStyles();
    addScopeClass();

    try {
      LOG.debug?.(`[AO3H] [${MOD}] started`);
    } catch {}
  }

  async function stop() {
    if (!RUNNING) return;
    RUNNING = false;

    removeScopeClass();
    removeStyles();

    try {
      LOG.debug?.(`[AO3H] [${MOD}] stopped`);
    } catch {}
  }

  // Enregistre le module auprès du core (Standard Lifecycle Rule)
  if (AO3H.modules?.register) {
    AO3H.modules.register(MOD, { start, stop });
    try { LOG.debug?.(`[AO3H] [${MOD}] ready`); } catch {}
  } else {
    // Si le core n'est pas encore prêt, on expose dans un hook minimal
    (AO3H.pendingModules = AO3H.pendingModules || []).push([MOD, { start, stop }]);
  }
})();
