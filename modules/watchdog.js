/* modules/watchdog.js — Surveille erreurs modules + globales, sans apparaître dans le menu */
;(function(){
  'use strict';

  const MOD = 'Watchdog';
  const { log } = AO3H.util;
  const Bus = AO3H.bus;

  const ERR = [];
  const MAX = 10;

  function push(label, error){
    ERR.push({ label, error, time: Date.now() });
    if (ERR.length > MAX) ERR.shift();
    log.warn?.(`[${MOD}]`, label, error);

    // Optionnel : ajoute une action dans le menu pour désactiver le module fautif
    AO3H.menu.addSeparator();
    AO3H.menu.addAction(`⚠ ${label} — disable`, async ()=>{
      const id = (label||'').replace(/^init:/,'');
      const key = `mod:${id}:enabled`;
      await AO3H.flags.set(key, false);
      alert(`Module "${id}" disabled.`);
    });
    AO3H.menu.rebuild();
  }

  // 1) Erreurs captées par guard() via le bus
  Bus?.on('error', ({label, error}) => push(label, error));

  // 2) Erreurs globales JS
  window.addEventListener('error', (e)=>{ push('global:error', e.error || e.message || e); });
  window.addEventListener('unhandledrejection', (e)=>{ push('global:promise', e.reason); });

  log.info?.(`[${MOD}] active (silent mode)`);
})();
