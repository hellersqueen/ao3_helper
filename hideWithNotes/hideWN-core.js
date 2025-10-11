// == hideWN-core.js ==
// Core du module HideFanficWithNotes (Hide WN)
// (⚠️ Tous les comportements sont inchangés)

(function(){
  'use strict';

  // --- Namespace global AO3H ---
  window.AO3HHideWithNotes = window.AO3HHideWithNotes || {};

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, observe, css } = (AO3H.util || {});

  const MOD_ID   = 'HideFanficWithNotes';

  const DB_NAME = 'ao3h-hiddenWorksDB';
  const STORE   = 'works';

  // Expose local constants to namespace
  Object.assign(window.AO3HHideWithNotes, {
    W, AO3H, NS, MOD_ID, DB_NAME, STORE
  });

  /* ------------------------------- Styles -------------------------------- */
  if (css) css`
    .${NS}-m5-hidebar{
      display:flex; 
      align-items:center; 
      justify-content:space-between;
      gap:10px;
      padding:6px 10px;
      background:#f5f6f8;
      border:1px solid #d7dbe3;
      border-radius:8px;
      margin:.5em 0;
      font-size:11px;
      color:#1b2430;
    }
    .${NS}-m5-hidebar .left{
      display:flex; gap:.5em; align-items:center; min-width:0;
    }
    .${NS}-m5-hidebar .label{ opacity:.8 }
    .${NS}-m5-hidebar .reason-text{
      font-weight:600;
      white-space:normal;
      overflow:visible;
      text-overflow:unset;
      max-width:none;
      overflow-wrap:anywhere;
      word-break:break-word;
    }

    .${NS}-m5-hidebar .right{ display:flex; gap:6px }
    .${NS}-m5-btn{
      border:1px solid #cfd6e2; background:#fff; border-radius:6px; padding:4px 8px; cursor:pointer;
    }
    .${NS}-m5-btn:hover{ background:#f1f5fb }

    .${NS}-m5-hide-btn{
      float:right; margin-right:8px; margin-top:-20px;
      border:1px solid #cfd6e2; background:#fff; border-radius:6px; padding-bottom: 5px; cursor:pointer;
      font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    }
    .${NS}-m5-hide-btn:hover{ background:#f1f5fb }

    .${NS}-m5-picker{
      position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
      background:#fff; border:1px solid #cfd6e2; border-radius:12px; padding:14px;
      box-shadow:0 18px 48px rgba(0,0,0,.18); display:none; z-index:99999; width:min(520px,92vw);
      font:14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color:#0f172a;
    }
    .${NS}-m5-picker.${NS}-open{ display:block; }

    .${NS}-m5p-title{ font-weight:700; }
    .${NS}-m5p-chips{ display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
    .${NS}-m5p-chip{
      border:1px solid #c7cbd3; border-radius:999px; padding:4px 10px; cursor:pointer; background:#f8fafc;
    }
    .${NS}-m5p-chip:hover{ background:#eef2f8 }
    .${NS}-m5p-row{ display:flex; gap:8px; }
    .${NS}-m5p-input{ flex:1; padding:6px 8px; border:1px solid #cfd6e2; border-radius:6px; }
    .${NS}-m5p-add, .${NS}-m5p-cancel{
      border:1px solid #cfd6e2; background:#f6f8fb; border-radius:6px; padding:6px 10px; cursor:pointer;
    }
    .${NS}-m5p-add:hover, .${NS}-m5p-cancel:hover{ background:#eef2f8 }
    .${NS}-m5p-hint{ opacity:.7; font-size:12px; margin-top:8px }
    .${NS}-m5p-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:10px }
  `;

})();
