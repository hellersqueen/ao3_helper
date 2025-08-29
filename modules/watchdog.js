/* modules/watchdog.js — Surveille erreurs modules + globales et propose disable */
;(function(){
  'use strict';
  const MOD = 'Watchdog';
  const { log } = AO3H.util;

  const ERR = [];
  const MAX = 10;

  function push(label, error){
    ERR.push({ label, error, time: Date.now() });
    if (ERR.length > MAX) ERR.shift();
    log.warn?.(`[${MOD}]`, label, error);

    // Ajoute action contextuelle dans le menu (disable rapide)
    AO3H.menu.addSeparator();
    AO3H.menu.addAction(`⚠ ${label} — disable`, async ()=>{
      const id = (label||'').replace(/^init:/,''); // ex: "init:SaveScroll" -> "SaveScroll"
      const key = `mod:${id}:enabled`;
      await AO3H.flags.set(key, false);
      alert(`Module "${id}" disabled.`);
    });
    AO3H.menu.rebuild();
  }

  AO3H.modules.register(MOD, { title:'Error Watchdog', enabledByDefault:true }, async function init(){
    // 1) Erreurs captées par guard() via le bus
    AO3H.bus?.on('error', ({label, error}) => push(label, error));

    // 2) Erreurs globales JS
    window.addEventListener('error', (e)=>{ push('global:error', e.error || e.message || e); });
    window.addEventListener('unhandledrejection', (e)=>{ push('global:promise', e.reason); });

    // 3) Action: afficher le dernier message
    AO3H.menu.addAction('Watchdog — last error…', ()=>{
      if (!ERR.length) return alert('No errors captured.');
      const {label, error, time} = ERR[ERR.length-1];
      alert(`[${new Date(time).toLocaleString()}]\n${label}\n\n` + (error?.stack || error));
    });

    log.info?.(`[${MOD}] active`);
  });

})();
