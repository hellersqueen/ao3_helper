(function(){
const { onReady, on, throttle } = AO3H.util;
const Storage = AO3H.store;
const { getFlags } = AO3H.flags;


const MOD = { id: 'SaveScroll' };
const KEY_PREFIX = 'scroll:';
const isTarget = () => /^\/works\/\d+$/.test(location.pathname);
const keyFor = () => KEY_PREFIX + location.pathname;


const save = throttle(async ()=>{
if (!isTarget()) return; await Storage.set(keyFor(), Math.round(window.scrollY));
}, 500);


async function restore(){ if (!isTarget()) return; const y = await Storage.get(keyFor(), null); if (y != null) window.scrollTo({ top: y, behavior: 'instant' }); }


MOD.init = async (flags)=>{
if (!flags.saveScroll || !isTarget()) return;
onReady(async ()=>{ await restore(); on(window,'scroll', save, { passive:true }); AO3H.util.on(document, 'ao3h:flags-updated', async ()=>{ /* no-op; flag handled by core menu */ }); });
};


AO3H.register(MOD);
})();
