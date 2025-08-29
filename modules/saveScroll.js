/* modules/saveScroll.js — Save & restore scroll on exact /works/<id> pages */
;(function(){
  'use strict';

  const { onReady, on, throttle, log } = AO3H.util;
  const Storage = AO3H.store;
  const Routes  = AO3H.routes;

  const MOD_NAME   = 'SaveScroll';
  const ENABLE_KEY = `mod:${MOD_NAME}:enabled`; // géré par le menu automatiquement
  const KEY_PREFIX = 'scroll:';                 // e.g. "scroll:/works/12345678"

  const isTarget = () => Routes.isWork?.() || /^\/works\/\d+$/.test(location.pathname);
  const keyFor   = () => KEY_PREFIX + location.pathname;

  let enabled = false;
  let bound   = false;
  let handler = null;
  let lastPath = location.pathname;

  async function restore(){
    if (!isTarget()) return;
    const y = await Storage.get(keyFor(), null);
    if (y == null) return;
    window.scrollTo(0, Number(y) || 0); // saut instantané
  }

  function bind(){
    if (bound) return;
    handler = throttle(async ()=>{
      if (!enabled || !isTarget()) return;
      try { await Storage.set(keyFor(), Math.round(window.scrollY)); } catch {}
    }, 500);
    on(window, 'scroll', handler, { passive: true });
    bound = true;
  }

  function unbind(){
    if (!bound || !handler) return;
    window.removeEventListener('scroll', handler);
    bound = false;
    handler = null;
  }

  async function start(){
    if (!enabled || !isTarget()) return;
    await restore();
    bind();
  }

  // Détection « soft navigation » (URL qui change sans reload complet)
  // On surveille le DOM et l’URL pour relancer start() si le path change.
  const watchUrlChange = (() => {
    let ticking = false;
    const check = () => {
      if (ticking) return;
      ticking = true;
      queueMicrotask(() => {
        ticking = false;
        const cur = location.pathname;
        if (cur !== lastPath) {
          lastPath = cur;
          if (enabled) start();
        }
      });
    };
    const mo = new MutationObserver(check);
    return {
      start(){
        mo.observe(document.documentElement, { childList:true, subtree:true });
        on(window, 'popstate', check);
        // fallback périodique au cas où
        setInterval(check, 800);
      }
    };
  })();

  // Enregistrement via l’API modules du core
  AO3H.modules.register(MOD_NAME, { title: 'Save scroll position', enabledByDefault: true }, async function init(){
    enabled = !!AO3H.flags.get(ENABLE_KEY, true);

    onReady(() => {
      if (enabled) start();
      watchUrlChange.start();
    });

    // Réagir aux changements de toggle venant du menu (sans reload)
    AO3H.flags.watch(ENABLE_KEY, (val)=>{
      enabled = !!val;
      if (enabled) start();
      else unbind();
    });

    log.info(`[${MOD_NAME}] ready`);
  });

})();
