;(function(){
  'use strict';
  const { onReady, on, throttle } = AO3H.util;
  const Storage = AO3H.store;
  const { getFlags } = AO3H.flags; // conservé si tu veux l'utiliser plus tard

  const MOD = { id: 'SaveScroll' };

  const KEY_PREFIX = 'scroll:';
  const isTarget = () => /^\/works\/\d+$/.test(location.pathname);
  const keyFor   = () => KEY_PREFIX + location.pathname;

  // Permet de retirer proprement les écouteurs si besoin
  let abortCtrl;

  const save = throttle(async ()=>{
    if (!isTarget()) return;
    await Storage.set(keyFor(), Math.round(window.scrollY));
  }, 500);

  async function restore(){
    if (!isTarget()) return;

    // Si la page a déjà un hash (#anchor), on laisse le navigateur gérer
    if (location.hash) return;

    const y = await Storage.get(keyFor(), null);
    if (y != null) {
      try {
        window.scrollTo({ top: y, behavior: 'auto' }); // 'auto' est standard
      } catch {
        window.scrollTo(0, y);
      }
    }
  }

  MOD.init = async (flags)=>{
    if (!flags.saveScroll || !isTarget()) return;

    onReady(async ()=>{
      abortCtrl = new AbortController();

      await restore();

      // Sauvegarde régulière et aussi juste avant de quitter
      window.addEventListener('scroll', save, { passive: true, signal: abortCtrl.signal });
      window.addEventListener('beforeunload', save, { signal: abortCtrl.signal });

      // Si un jour tu veux réagir au toggle sans recharger:
      document.addEventListener('ao3h:flags-updated', async ()=>{
        const f = await getFlags();
        if (!f.saveScroll && abortCtrl) {
          abortCtrl.abort();        // retire tous les écouteurs
          abortCtrl = null;
        }
      }, { signal: abortCtrl.signal });
    });
  };

  AO3H.register(MOD);
})();
