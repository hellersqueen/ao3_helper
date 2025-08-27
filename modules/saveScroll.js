// modules/saveScroll.js
;(function(){
  'use strict';

  const AO3H = window.AO3H || {};
  const { env:{ NS } = {}, util = {}, flags } = AO3H || {};
  const { onReady, on, throttle, Storage } = util || {};
  const { getFlags } = flags || {};

  if (!NS || !onReady || !on || !throttle || !Storage || !getFlags) {
    console.error('[AO3H][SaveScroll] core not ready'); return;
  }

  const MOD_ID = 'SaveScroll';

  function isTargetPath() {
    // support /works/<id> and /works/<id>/chapters/<id>
    return /^\/works\/\d+(?:\/chapters\/\d+)?$/.test(location.pathname);
  }
  function keyForPath() {
    return `scroll:${location.pathname}`;
  }

  async function init(initialFlags){
    let enabled = !!(initialFlags && initialFlags.saveScroll);

    const save = throttle(async () => {
      if (!enabled || !isTargetPath()) return;
      try { await Storage.set(keyForPath(), Math.round(window.scrollY)); } catch {}
    }, 500);

    async function restore(){
      if (!enabled || !isTargetPath()) return;
      const y = await Storage.get(keyForPath(), null);
      if (y == null) return;
      try { window.scrollTo({ top: y, behavior: 'auto' }); }
      catch { window.scrollTo(0, y); }
    }

    // Always wire listeners so toggling from the menu works without reload
    onReady(async () => {
      await restore();
      on(window, 'scroll', save, { passive: true });

      // React to menu toggles
      document.addEventListener(`${NS}:flags-updated`, async () => {
        try { enabled = !!(await getFlags()).saveScroll; } catch {}
        // If it was turned on, try restoring once immediately
        if (enabled) restore();
      });
    });
  }

  // Prefer AO3H.register; fall back to direct registry if needed
  const MOD = { id: MOD_ID, title: 'Save scroll position', init };
  if (AO3H && typeof AO3H.register === 'function') {
    AO3H.register(MOD);
  } else {
    AO3H.modules = AO3H.modules || {};
    AO3H.modules[MOD_ID] = MOD;
  }
})();
