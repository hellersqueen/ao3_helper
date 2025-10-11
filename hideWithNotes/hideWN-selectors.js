// == hideWN-selectors.js ==
// Fonctions DOM et utilitaires pour HideFanficWithNotes (Hide WN)

(function(){
  'use strict';

  const { W, NS } = window.AO3HHideWithNotes;

  /* ----------------------------- Utilities -------------------------------- */
  // jQuery est déjà présent sur AO3 — on réutilise la copie de la page.
  function $(sel, root){ return (W.jQuery || W.$)(sel, root); }

  // Extraire l'identifiant du work depuis un blurb
  function workIdFromBlurb($blurb) {
    const a = $blurb.find('.header .heading a[href*="/works/"]').first();
    const href = (a.attr('href') || '').replace(/(#.*|\?.*)$/, '');
    return href || ($blurb.find('a[href*="/works/"]').first().attr('href') || '').replace(/(#.*|\?.*)$/, '');
  }

  // Expose dans le namespace
  Object.assign(window.AO3HHideWithNotes, { $, workIdFromBlurb });

})();
