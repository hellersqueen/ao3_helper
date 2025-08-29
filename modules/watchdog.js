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

  // 1) Erreurs captées par guard() via le bus
  Bus?.on('error', ({label, error}) => push(label, error));

  // 2) Erreurs globales JS
  window.addEventListener('error', (e)=>{ push('global:error', e.error || e.message || e); });
  window.addEventListener('unhandledrejection', (e)=>{ push('global:promise', e.reason); });

  log.info?.(`[${MOD}] active (silent mode)`);
})();
