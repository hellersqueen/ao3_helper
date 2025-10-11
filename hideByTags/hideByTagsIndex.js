/* modules/hideByTags/hideByTagsIndex.js — entry point */
(function(){
  'use strict';

  const AO3H = window.AO3H || {};
  const { modules } = AO3H;
  const NS = (AO3H.env && AO3H.env.NS) || 'ao3h';

  if (!modules || !AO3H.flags || !AO3H.util) {
    console.error('[AO3H HideByTags] AO3H core not ready.');
    return;
  }

  const Engine  = window.hideByTagsEngine;
  const UI      = window.hideByTagsUI;
  const Persist = window.hideByTagsPersistence;

  if (!Engine || !UI || !Persist) {
    console.error('[AO3H HideByTags] one or more components missing.');
    return;
  }

  // Register with AO3H exactly as in original
  AO3H.modules.register('HideByTags',
    { title: 'Hide by tags', enabledByDefault: true },
    async function init(){
      try {
        // identical behaviour
        Persist.integrateModules(Engine, UI);
        Persist.exposeManagerAlwaysOn(UI.openManager);
        console.info('[AO3H] HideByTags initialized (modular build)');
      } catch (err) {
        console.error('[AO3H HideByTags] initialization failed:', err);
      }
    }
  );

})();
