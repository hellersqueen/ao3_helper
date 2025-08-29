/* modules/watchdog.js — Silent Watchdog: logs only, no UI, no flags */
;(function(){
  'use strict';

  // Exige AO3H (core) déjà chargé
  const AO3H = window.AO3H || {};
  const { bus, util } = AO3H;
  const log = util?.log || console;

  if (!bus) { console.warn('[AO3H][Watchdog] bus not available'); return; }

  const MOD = 'Watchdog';
  const history = [];
  const MAX = 20;

  function record(label, error){
    const entry = { label, error, time: Date.now() };
    history.push(entry);
    if (history.length > MAX) history.shift();
    // Logging clair (inclut stack si disponible)
    const msg = `[${MOD}] ${label}`;
    if (error && error.stack) log.err?.(msg, error.stack);
    else if (error)          log.err?.(msg, error);
    else                     log.err?.(msg);
  }

  // 1) Erreurs captées par guard() → AO3H.bus.emit('error', {label, error})
  bus.on?.('error', ({ label, error }) => record(label, error));

  // 2) Erreurs globales
  window.addEventListener('error', (e)=>{
    record('global:error', e?.error || e?.message || e);
  });
  window.addEventListener('unhandledrejection', (e)=>{
    record('global:promise', e?.reason);
  });

  // Optionnel: exposer un petit getter pour debugging manuel (depuis console)
  AO3H.debug = AO3H.debug || {};
  AO3H.debug.getLastErrors = () => history.slice(-5);

  log.info?.('[AO3H][Watchdog] silent mode active');
})();
