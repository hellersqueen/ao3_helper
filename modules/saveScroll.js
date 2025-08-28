/* modules/saveScroll.js — Save & restore scroll on exact /works/<id> pages */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, on, throttle } = (AO3H.util || {});
  const Storage = (AO3H.store || {});
  const Routes  = (AO3H.routes || {});

  const KEY_PREFIX = 'scroll:';
  const isTarget = () => (Routes.isWorkShow?.() || /^\/works\/\d+$/.test(location.pathname));
  const keyFor   = () => KEY_PREFIX + location.pathname; // e.g. "scroll:/works/12345678"

  let enabled = false;
  let bound   = false;     // whether we've attached the scroll handler
  let handler = null;

  async function restore(){
    if (!isTarget()) return;
    const y = await Storage.get(keyFor(), null);
    if (y == null) return;
    // avoid smooth scrolling; jump instantly
    W.scrollTo(0, Number(y) || 0);
  }

  function bind(){
    if (bound) return;
    handler = throttle(async ()=>{
      if (!enabled || !isTarget()) return;
      try { await Storage.set(keyFor(), Math.round(W.scrollY)); } catch {}
    }, 500);
    on(W, 'scroll', handler, { passive: true });
    bound = true;
  }

  function unbind(){
    if (!bound || !handler) return;
    W.removeEventListener('scroll', handler);
    bound = false;
    handler = null;
  }

  async function start(){
    if (!enabled || !isTarget()) return;
    await restore();
    bind();
  }

  AO3H.register?.({
    id: 'SaveScroll',
    title: 'Save scroll position',
    defaultFlagKey: 'saveScroll',

    init: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;
      if (enabled) onReady(start);
      // re-run when your app does a soft navigation
      document.addEventListener(`${NS}:navigated`, () => { if (enabled) start(); });
    },

    onFlagsUpdated: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;
      if (enabled) start();
      else unbind();
    },
  });

})();
