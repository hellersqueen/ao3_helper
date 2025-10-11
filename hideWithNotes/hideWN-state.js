// == hideWN-state.js ==
// Gestion de l’état, base de données IndexedDB et tempShow

(function(){
  'use strict';

  const { W, NS, DB_NAME, STORE } = window.AO3HHideWithNotes;

  /* ----------------------------- IndexedDB ------------------------------- */
  let db;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (event) => {
        const dbx = event.target.result;
        if (!dbx.objectStoreNames.contains(STORE)) {
          const objectStore = dbx.createObjectStore(STORE, { keyPath: 'workId' });
          objectStore.createIndex('reason', 'reason', { unique: false });
          objectStore.createIndex('isHidden', 'isHidden', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        db = e.target.result;
        db.onversionchange = () => { try { db.close(); } catch {} };
        resolve(db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function getAllWorks() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(new Error('getAll failed'));
    });
  }

  function getWork(workId) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readonly');
      const req = tx.objectStore(STORE).get(workId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(new Error('get failed'));
    });
  }

  function putWork(rec) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readwrite');
      const req = tx.objectStore(STORE).put(rec);
      req.onsuccess = () => resolve(true);
      req.onerror   = () => reject(new Error('put failed'));
    });
  }

  /* ----------------------------- TEMP-SHOW ------------------------------- */
  let tempShow = new Set();
  const tempKey = () => `${NS}:m5:tempShow:${location.pathname}`;
  function loadTempShow(){
    try{
      const raw = sessionStorage.getItem(tempKey());
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    }catch{ return new Set(); }
  }
  function saveTempShow(){
    try{ sessionStorage.setItem(tempKey(), JSON.stringify([...tempShow])); }catch{}
  }
  function clearTempShow(){
    tempShow.clear();
    try{ sessionStorage.removeItem(tempKey()); }catch{}
  }

  /* ------------------------------- Migration ------------------------------ */
  async function transferFromLocalStorage() {
    try {
      const raw = localStorage.getItem('ao3HiddenWorks');
      if (!raw) return;
      let legacy = {};
      try {
        legacy = JSON.parse(raw);
      } catch {
        console.warn('[AO3H] legacy store invalid JSON; skipping migration');
        localStorage.removeItem('ao3HiddenWorks');
        return;
      }
      const keys = Object.keys(legacy || {});
      if (!keys.length) return;
      if (!db) await openDB();
      for (const workId of keys) {
        const reason = legacy[workId];
        const existing = await getWork(workId);
        if (!existing) await putWork({ workId, reason, isHidden: true });
      }
      localStorage.removeItem('ao3HiddenWorks');
    } catch (e) { console.warn('[AO3H] legacy transfer skipped', e); }
  }

  // Expose toutes les fonctions au namespace
  Object.assign(window.AO3HHideWithNotes, {
    openDB, getAllWorks, getWork, putWork,
    loadTempShow, saveTempShow, clearTempShow,
    transferFromLocalStorage,
    get db(){ return db; },
    set db(v){ db = v; },
    get tempShow(){ return tempShow; },
    set tempShow(v){ tempShow = v; }
  });

})();
