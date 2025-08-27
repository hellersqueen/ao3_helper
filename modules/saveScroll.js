// modules/saveScroll.js
;(function(){
  'use strict';

  // Pull what we need from AO3H (defined by core.js)
  const AO3H = window.AO3H || {};
  const { env:{ NS } = {}, util = {}, store: Storage, flags } = AO3H;
  const { onReady, on, throttle } = util || {};
  const { getFlags } = flags || {};

  if (!Storage || !onReady || !on || !throttle || !getFlags || !NS) {
    console.error('[AO3H][SaveScroll] core not ready'); return;
  }

  const MOD_ID = 'SaveScroll';

  async function init(initialFlags){
    let enabled = !!(initialFlags && initialFlags.saveScroll);

    const isTarget = () => /^\/works\/\d+$/.test(location.pathname);  // only /works/<id>
    const keyFor   = () => `scroll:${location.pathname}`;

    const save = throttle(async () => {
      if (!enabled || !isTarget()) return;
      try { await Storage.set(keyFor(), Math.round(window.scrollY)); } catch {}
    }, 500);

    async function restore(){
      if (!isTarget()) return;
      const y = await Storage.get(keyFor(), null);
      if (y == null) return;
      try {
        // 'instant' isn't standard everywhere; fall back to auto/xy.
        window.scrollTo({ top: y, behavior: 'auto' });
      } catch {
        window.scrollTo(0, y);
      }
    }

    if (!enabled || !isTarget()) return;

    onReady(async () => {
      await restore();
      on(window, 'scroll', save, { passive: true });

      // React to toggle changes from the menu
      document.addEventListener(`${NS}:flags-updated`, async () => {
        try { enabled = !!(await getFlags()).saveScroll; } catch {}
      });
    });
  }

  // Register into the shared registry
  AO3H.modules = AO3H.modules || {};
  AO3H.modules[MOD_ID] = { id: MOD_ID, title: 'Save scroll position', init };
})();
