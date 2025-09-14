/* modules/cleanLayout.js — smaller font everywhere + submenu fix + input fixes
   - Toggle ON ⇒ fic/search/meta/tags/pagination/headings text smaller immediately.
   - Toggle OFF ⇒ reverts immediately (no refresh).
   - Submenu width fix is ALWAYS active and menu-safe.
   - Input fixes keep search filters aligned and borders visible.
   - Strictly content-only: never changes #header primary navigation.
   - No per-module menu actions (toggles-only).
*/

;(function () {
  'use strict';

  // --- PRE-APPLY (reduce flash if last session had it ON) -------------------

(function preapply () {
  try {
    const NS        = 'ao3h';
    const ROOT_CLASS= `${NS}-layout-on`;
    // use the *CleanLayout* flags (new module name)
    const FLAG_CAN  = 'mod:CleanLayout:enabled';
    const FLAG_ALT  = 'mod:cleanlayout:enabled';

    const raw = localStorage.getItem(`${NS}:flags`);
    if (!raw) return;

    const flags = JSON.parse(raw);
    const val   = (flags && (flags[FLAG_CAN] ?? flags[FLAG_ALT]));

    // STRICT truth check: only add class for true / "true"
    const isOn  = (val === true || val === 'true');
    if (isOn) document.documentElement.classList.add(ROOT_CLASS);

    // Safety: if it's not on, make sure the class is NOT present on load
    // (covers any previous session leftovers or injected markup)
    if (!isOn) {
      // remove immediately
      document.documentElement.classList.remove(ROOT_CLASS);
      // and again right after stylesheets parse
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.classList.remove(ROOT_CLASS);
      });
    }
  } catch {}
})();


  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H;
  if (!AO3H || !AO3H.modules) return;

  const { util, bus } = AO3H;
  const { css } = (util || {});
  if (!css) return;

  const NS          = (AO3H.env && AO3H.env.NS) || 'ao3h';
  const ROOT_CLASS  = `${NS}-layout-on`;
  const FLAG_CAN    = 'mod:CleanLayout:enabled';
  const FLAG_ALT    = 'mod:cleanlayout:enabled';

  /* ============================ Always-on submenu fix ======================= */
  css(`
    #header .dropdown ul.menu.ao3h-submenu { 
      box-sizing:border-box; 
      width:100%!important; 
      min-width:100%!important; 
      padding:0; 
      margin:0; 
      list-style:none; 
    }
    #header .dropdown ul.menu.ao3h-submenu > li { 
      display:block!important; 
      width:100%!important; 
      margin:0; 
    }
    #header .dropdown ul.menu.ao3h-submenu > li > a {
      display:flex!important; 
      align-items:center; 
      justify-content:space-between;
      width:100%!important; 
      height:30px;
      box-sizing:border-box; 
      padding:0.8em 1em; 
      line-height:1.5;
      white-space:normal; 
      text-decoration:none;
    }
    #header .dropdown ul.menu.ao3h-submenu > li > a .ao3h-switch { 
      flex:0 0 auto; 
      margin-left:0.6em; 
    }
    #header .dropdown ul.menu.ao3h-submenu > li > a:hover { 
      background:rgba(0,0,0,0.06); 
    }
  `, 'ao3h-submenu-fill');

  /* ========================== Content-only sandbox ========================== */
  // Scope strictly to main content containers; NEVER header.
  const SAFE_SCOPE = `html.${ROOT_CLASS} :where(#main, #workskin, .work, .blurb, .userstuff, dl.work.meta.group)`;
  // Separate scope for action lists so we still avoid header:
  const SAFE_ACTIONS = `html.${ROOT_CLASS} :where(#main, #workskin) ul.actions`;

  /* ================== Smaller text rules (toggle with CleanLayout) ========= */
  css(`
    /* Fic body + notes */
    ${SAFE_SCOPE} .userstuff {
      font-size: 0.90em !important;
      line-height: 1.35 !important;
    }

    /* Work summaries inside blurbs */
    ${SAFE_SCOPE} blockquote.userstuff.summary {
      font-size: 0.90em !important;
      line-height: 1.35 !important;
    }

    /* Meta blocks (ratings, word count, etc.) */
    ${SAFE_SCOPE} dl.work.meta.group,
    ${SAFE_SCOPE} .blurb .header,
    ${SAFE_SCOPE} .blurb .stats {
      font-size: 0.90em !important;
      line-height: 1.35 !important;
    }

    /* Tags */
    ${SAFE_SCOPE} .tags li a.tag {
      font-size: 0.90em !important;
      line-height: 1.35 !important;
    }

    /* Pagination links */
    ${SAFE_SCOPE} .pagination {
      font-size: 0.90em !important;
      line-height: 1.35 !important;
    }

    /* Action lists in content only (NOT header nav) */
    ${SAFE_ACTIONS} {
      font-size: 0.90em !important;
      line-height: 1.35 !important;
    }

    /* Headings (e.g., chapter titles, blurb headings) */
    ${SAFE_SCOPE} h2,
    ${SAFE_SCOPE} h3 {
      font-size: 0.95em !important;
      line-height: 1.35 !important;
    }

    /* Search/filter form inside main content (not header bar) */
    ${SAFE_SCOPE} input,
    ${SAFE_SCOPE} select,
    ${SAFE_SCOPE} textarea {
      font-size: 0.90em !important;
      line-height: 1.35 !important;
    }
  `, 'cl-smaller-font');

  /* ============== Search filter input fixes (content-only, toggle-gated) ============== */
  // Target only inputs that live in the main content search/filter forms.
  css(`
    ${SAFE_SCOPE} dl.search dd input[type="text"],
    ${SAFE_SCOPE} dl.filters dd input[type="text"],
    ${SAFE_SCOPE} form[action*="/works"] input[type="text"],
    ${SAFE_SCOPE} form[action*="/works"] select,
    ${SAFE_SCOPE} form[action*="/works"] textarea {
      box-sizing: border-box !important;
      padding: 0.45em 0.6em !important;
      line-height: 1.35 !important;
      border: 1px solid #bbb !important;
      background-clip: padding-box !important;
      vertical-align: middle !important;
      display: inline-block !important;
      max-width: 100% !important;
      width: 100% !important;
      height: auto !important;
    }

    ${SAFE_SCOPE} dl.search dd input[type="text"]:focus,
    ${SAFE_SCOPE} dl.filters dd input[type="text"]:focus,
    ${SAFE_SCOPE} form[action*="/works"] input[type="text"]:focus,
    ${SAFE_SCOPE} form[action*="/works"] select:focus,
    ${SAFE_SCOPE} form[action*="/works"] textarea:focus {
      outline: 2px solid rgba(0,0,0,0.2) !important;
      outline-offset: 0 !important;
      border-color: #888 !important;
    }
  `, 'cl-form-fixes');

  /* ============================ Live state syncing ========================== */
  function readFlag () {
  try {
    // Prefer AO3H.flags if present
    if (AO3H.flags?.get) {
      const v1 = AO3H.flags.get(FLAG_CAN);
      if (v1 === true || v1 === 'true') return true;
      const v2 = AO3H.flags.get(FLAG_ALT);
      if (v2 === true || v2 === 'true') return true;
      return false;
    }
    // Fallback to localStorage mirror
    const raw = localStorage.getItem(`${NS}:flags`);
    if (!raw) return false;
    const flags = JSON.parse(raw);
    const val = flags && (flags[FLAG_CAN] ?? flags[FLAG_ALT]);
    return (val === true || val === 'true');
  } catch {
    return false;
  }
}


  function setRoot (on) {
    const list = document.documentElement.classList;
    if (on) list.add(ROOT_CLASS); else list.remove(ROOT_CLASS);
  }

  function syncNow () { setRoot(readFlag()); }

  // React to flag changes broadcast by core (covers menu flips)
  if (bus && typeof bus.on === 'function') {
    bus.on(`${NS}:flags-updated`, () => {
      syncNow();
      requestAnimationFrame(syncNow);
      setTimeout(syncNow, 60);
    });
  }

  // Belt-and-suspenders: watch direct clicks on our toggle anchor
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.(`a[data-flag="${FLAG_CAN}"]`);
    if (!a) return;
    requestAnimationFrame(() => {
      const checked = (a.getAttribute('aria-checked') === 'true');
      setRoot(checked);
    });
  }, true);

  /* ============================= Module lifecycle =========================== */
  AO3H.modules.register('CleanLayout', { title: 'Clean Layout', enabledByDefault: false }, function init () {
    function enable  () { setRoot(true); }
    function disable () { setRoot(false); }
    // Ensure DOM reflects current flag when the module loads
    syncNow();
    return { enable, disable };
  });

})();
