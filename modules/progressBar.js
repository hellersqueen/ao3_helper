/* == AO3H Module: ProgressBar ============================================= */

(function () {
  'use strict';
  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H;
  if (!AO3H || !AO3H.modules) return;

  // ⬇️ include optional flags/bus/env if present
  const { util, routes, store, flags = {}, bus = {}, env = {} } = AO3H;
  const { css, observe, debounce, onReady } = util;

  AO3H.modules.register('ProgressBar', { title: 'Reading Progress', enabledByDefault: false }, function init () {
    const KV = 'ProgressBar:v15-left-compact-bounded-toplabel';
    const ENABLE_KEY = 'mod:ProgressBar:enabled'; // core toggle flag name

    const defaults = {
      rememberChapterPercent: true,
      showFicMarker: false,   // hidden by default
      height: '10vh',         // compact default
      collapsed: false        // start expanded
    };

    // persistent config + per-work progress map
    let cfg = Object.assign({}, defaults, store.lsGet(KV + ':cfg', defaults));
    let progress = store.lsGet(KV + ':data', {}); // { [workId]: { chaptersDone:{[n]:true}, lastPos:{[chapterId]: frac} } }

    const saveCfg  = () => store.lsSet(KV + ':cfg',  cfg);
    const saveData = debounce(() => store.lsSet(KV + ':data', progress), 200);

    // runtime state
    let ui = null, raf = 0, lastScrollY = -1, mo = null;
    let active = false;                 // NEW: whether UI is mounted
    let unwatch = null, offBus = null;  // optional watchers
    let poll = null;                    // fallback poller

    const onResize = debounce(() => { if (!active) return; measureBounds(); tick(true); }, 150);

    let state = { workId:null, chapterId:null, chapterIndex:1, chapterTotal:1 };

    // measured bounds (absolute page Y coordinates)
    let bounds = { start: null, end: null }; // top of chapter body, top of bottom actions

    /* ---------- helpers ---------- */

    function parseWorkIds() {
      const mWork = location.pathname.match(/^\/works\/(\d+)/);
      const mChap = location.pathname.match(/^\/works\/\d+\/chapters\/(\d+)/);
      state.workId    = mWork ? mWork[1] : null;
      state.chapterId = mChap ? mChap[1] : null;
    }

    function getChapterStats() {
      const node = document.querySelector('.work.meta .chapters, .work.meta dd.chapters, .meta .chapters, dd.chapters');
      let idx = 1, total = 1;
      if (node) {
        const m = node.textContent.trim().match(/(\d+)\s*\/\s*(\d+|\?)/);
        if (m) { idx = parseInt(m[1], 10) || 1; total = (m[2] === '?' ? 1 : parseInt(m[2], 10) || 1); }
      } else {
        const nav = document.querySelector('.chapter .title, .chapter .heading, .title.heading');
        const m2 = nav && nav.textContent.match(/chapter\s+(\d+)\s*(?:of\s+(\d+))?/i);
        if (m2) { idx = parseInt(m2[1], 10) || 1; total = parseInt(m2[2], 10) || 1; }
      }
      state.chapterIndex = idx;
      state.chapterTotal = Math.max(1, total);
    }

    const pageY = (el) => {
      if (!el || !el.getBoundingClientRect) return null;
      const r = el.getBoundingClientRect();
      const scrollY = (typeof window.scrollY === 'number')
        ? window.scrollY
        : (document.documentElement.scrollTop || 0);
      return scrollY + r.top;
    };

    // Prefer the CHAPTER BODY, not preface/notes summaries
    function findFirstContentEl() {
      // 1) Strict: #chapters .chapter .userstuff
      let el = document.querySelector('#chapters .chapter .userstuff');
      if (el) return el;

      // 2) Any .chapter .userstuff on page
      el = document.querySelector('.chapter .userstuff');
      if (el) return el;

      // 3) Fallback: first #chapters .userstuff that is NOT inside .preface
      const list = Array.from(document.querySelectorAll('#chapters .userstuff'));
      el = list.find(n => !n.closest('.preface'));
      if (el) return el;

      // 4) Last resort: visible .userstuff
      return document.querySelector('#workskin .userstuff') || document.querySelector('.userstuff');
    }

    // Pick last actions BELOW the content (so “end” makes sense)
    function findBottomActionsEl(afterY) {
      let actions = Array.from(document.querySelectorAll('#chapters .chapter ul.actions'));
      if (!actions.length) actions = Array.from(document.querySelectorAll('#chapters ul.actions'));
      if (!actions.length) actions = Array.from(document.querySelectorAll('ul.actions'));
      if (!actions.length) return null;

      // Keep only those below the content
      if (typeof afterY === 'number') {
        actions = actions.filter(el => {
          const y = pageY(el);
          return y != null && y > afterY + 10;
        });
      }
      if (!actions.length) return null;

      // Choose the lowest (largest Y)
      return actions.reduce((best, el) => {
        const y = pageY(el);
        const by = best ? pageY(best) : -Infinity;
        return (y != null && y > by) ? el : best;
      }, null);
    }

    function measureBounds() {
      const contentEl = findFirstContentEl();
      const startY = pageY(contentEl);

      const bottomActionsEl = findBottomActionsEl(startY);
      const endY = pageY(bottomActionsEl);

      const doc = document.scrollingElement || document.documentElement;
      const docStart = 0;
      const docEnd = (doc.scrollHeight || document.body.scrollHeight || 0);

      bounds.start = (startY != null) ? startY : docStart;
      bounds.end   = (endY   != null) ? endY   : docEnd;

      // Ensure sensible distance
      if (bounds.end - bounds.start < 200) {
        const chapters = document.getElementById('chapters');
        const cTop = pageY(chapters);
        const cBottom = cTop != null ? (cTop + (chapters?.offsetHeight || 0)) : docEnd;
        bounds.start = (startY != null) ? startY : (cTop ?? docStart);
        bounds.end   = Math.max(bounds.start + 200, cBottom - 50, docEnd - window.innerHeight);
      }
    }

    // Bounded chapter fraction. Snap to 1.0 when viewport bottom reaches end.
    function getBoundedScrollFrac() {
      if (bounds.start == null || bounds.end == null) measureBounds();

      const el = document.scrollingElement || document.documentElement;
      const scrollTop = el.scrollTop || window.scrollY || 0;
      const viewportBottom = scrollTop + window.innerHeight;

      // ✅ Snap to 100% when we've reached/passed the actions block
      if (viewportBottom >= (bounds.end - 2)) return 1;

      if (scrollTop <= bounds.start) return 0;

      const max = (bounds.end - bounds.start) - window.innerHeight;
      const cur = scrollTop - bounds.start;
      return Math.max(0, Math.min(1, cur / Math.max(1, max)));
    }

    function getFicFrac() { return Math.max(0, Math.min(1, state.chapterIndex / state.chapterTotal)); }

    /* ---------- UI ---------- */

    function injectCSS() {
      css(`
        /* Left-pinned, compact width/height; height via CSS var */
        .ao3h-thermo {
          position: fixed; top: 75px; left: 0; right: auto;
          width: 14px; padding-left: 8px; z-index: 99998; pointer-events: none;
          display: flex; align-items: flex-end; justify-content: center;
          height: var(--ao3h-thermo-h, 20vh);
          transform: translateY(-50%);
        }

        /* When collapsed, hide the tube but keep the label visible */
        .ao3h-thermo.collapsed .tube-wrap { display: none; }

        /* Tube wrapper fills container height */
        .ao3h-thermo .tube-wrap {
          position: relative; height: 100%; width: 8px;
          display:flex; align-items:flex-end; justify-content:center;
        }

        /* Glass tube (narrow) */
        .ao3h-thermo .tube {
          position: absolute; left: 50%; transform: translateX(-50%);
          top: 0; bottom: 0; width: 8px; border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255,255,255,.45), rgba(255,255,255,.15)) padding-box,
            linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.25)) border-box;
          border: 1px solid rgba(0,0,0,.25);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.25),
            inset 2px 0 6px rgba(255,255,255,.25),
            inset -2px 0 6px rgba(0,0,0,.08);
        }

        /* Fic (overall) background fill — slimmer */
        .ao3h-thermo .fic {
          position: absolute; left: 50%; transform: translateX(-50%);
          bottom: 0; width: 6px; height: 0%;
          border-radius: 999px;
          background: linear-gradient(180deg, #93c5fd, #60a5fa);
          opacity: .28;
          transition: height .12s ease-out;
        }

        /* Mercury (chapter fill) — slimmer */
        .ao3h-thermo .mercury {
          position: absolute; left: 50%; transform: translateX(-50%);
          bottom: 0; width: 6px; height: 0%;
          border-radius: 999px;
          background: linear-gradient(180deg, #34d399, #10b981);
          box-shadow:
            inset 0 2px 4px rgba(255,255,255,.3),
            inset 0 -2px 4px rgba(0,0,0,.15);
          transition: height .08s ease-out;
        }

        /* (Optional) Fic progress marker — omitted from DOM by default */
        .ao3h-thermo .fic-marker {
          position: absolute; left: 50%; transform: translateX(-50%);
          width: 12px; height: 2px; background: rgba(59,130,246,.45);
          border-radius: 1px; opacity: .7; bottom: 0;
        }

        /* Label ABOVE (so bar appears under the percentage) */
        .ao3h-thermo .label {
          position: absolute; bottom: 100%; left: 90%;
          transform: translate(-50%, -6px);  /* push inwards & up */
          font: 10px/1 system-ui, sans-serif;
          color: #fff; background: rgba(0,0,0,.55);
          padding: 2px 6px; border-radius: 8px; pointer-events: auto; white-space: nowrap;
          user-select: none; cursor: pointer;
        }

        /* Default = collapsed (dot is grey) */
        .ao3h-thermo .label::after {
          content: "";
          display: inline-block;
          width: 6px; height: 6px;
          margin-left: 4px;
          border-radius: 50%;
          background: #6b7280;            /* grey */
          box-shadow: 0 0 4px #6b7280;
        }

        /* When expanded (progress bar visible) */
        .ao3h-thermo:not(.collapsed) .label::after {
          background: #10b981;            /* green */
          box-shadow: 0 0 4px #10b981;
        }

        .ao3h-thermo.collapsed:after { content: none !important; }

        @media (prefers-color-scheme: light) {
          .ao3h-thermo .label { color:#111; background:rgba(255,255,255,.7); }
        }
      `, 'ao3h-thermo-css-left-compact-bounded-toplabel');
    }

    function ensureUI() {
      if (ui) return;
      injectCSS();

      const el = document.createElement('div');
      el.className = 'ao3h-thermo';
      el.innerHTML = `
        <div class="label" title="Click to hide/show the bar"></div>
        <div class="tube-wrap">
          <div class="tube"></div>
          <div class="fic" style="height:0%"></div>
          <div class="mercury" style="height:0%"></div>
          ${cfg.showFicMarker ? `<div class="fic-marker" style="transform: translateY(0)"></div>` : ``}
        </div>
      `;

      onReady(() => {
        const host = document.body || document.documentElement;
        if (host && el instanceof HTMLElement) {
          el.style.setProperty('--ao3h-thermo-h', String(cfg.height || defaults.height));
          host.appendChild(el);
          ui = el;

          // Apply persisted collapsed state
          if (cfg.collapsed) ui.classList.add('collapsed');

          const label = ui.querySelector('.label');
          label?.addEventListener('click', (e)=>{
            cfg.collapsed = !cfg.collapsed;
            saveCfg();
            ui.classList.toggle('collapsed', cfg.collapsed);
            tick(true);
            e.preventDefault(); e.stopPropagation();
          });
        }
      });
    }

    function destroyUI() { if (ui) { try { ui.remove(); } catch {} ui = null; }

    }

    /* Quick teardown that also stops listeners/observer */
    function teardown() {
      active = false;
      try { removeEventListener('scroll', onScroll, { passive: true }); } catch {}
      try { removeEventListener('resize', onResize); } catch {}
      try { mo && mo.disconnect && mo.disconnect(); } catch {}
      destroyUI();
    }

    /* ---------- state save/restore ---------- */

    function markDoneIfAtBottom(frac) {
      if (frac >= 0.98 && state.workId && state.chapterIndex) {
        const entry = progress[state.workId] || (progress[state.workId] = { chaptersDone:{}, lastPos:{} });
        entry.chaptersDone[state.chapterIndex] = true;
        saveData();
      }
    }

    function maybeRestorePosition() {
      if (!cfg.rememberChapterPercent || !state.chapterId || !state.workId) return;
      const entry = progress[state.workId];
      const pct = entry?.lastPos?.[state.chapterId];
      if (typeof pct === 'number' && pct > 0 && pct < 0.98) {
        const el = document.scrollingElement || document.documentElement;
        const max = el.scrollHeight - window.innerHeight;
        if (max > 0) el.scrollTop = pct * max;
      }
    }

    function persistPosition(frac) {
      if (!cfg.rememberChapterPercent || !state.chapterId || !state.workId) return;
      const entry = progress[state.workId] || (progress[state.workId] = { chaptersDone:{}, lastPos:{} });
      entry.lastPos[state.chapterId] = Math.max(0, Math.min(1, frac));
      saveData();
    }

    /* ---------- updates ---------- */

    function tick(force) {
      if (!ui) return;
      const chFrac  = getBoundedScrollFrac(); // 🚨 bounded to chapter content → bottom actions
      const ficFrac = getFicFrac();

      const ficEl   = ui.querySelector('.fic');
      const mercEl  = ui.querySelector('.mercury');
      const markEl  = ui.querySelector('.fic-marker'); // may be null
      const tubeEl  = ui.querySelector('.tube');
      const labelEl = ui.querySelector('.label');
      if (!ficEl || !mercEl || !tubeEl || !labelEl) return;

      const ficH = `${Math.round(ficFrac*100)}%`;
      const chH  = `${Math.round(chFrac*100)}%`;
      if (force || ficEl.style.height !== ficH) ficEl.style.height = ficH;
      if (force || mercEl.style.height !== chH) mercEl.style.height = chH;

      if (cfg.showFicMarker && markEl) {
        const tubeH = (tubeEl.getBoundingClientRect().height || 0);
        const fromBottom = Math.round(ficFrac * tubeH);
        markEl.style.transform = `translateY(-${fromBottom}px)`;
      }

      labelEl.textContent = `${Math.round(chFrac*100)}%`;

      markDoneIfAtBottom(chFrac);
      persistPosition(chFrac);
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = (document.scrollingElement || document.documentElement).scrollTop || window.scrollY || 0;
        if (lastScrollY !== y) { lastScrollY = y; tick(false); }
      });
    }

    function bootIfEligible() {
      if (!(routes.isWork() || routes.isChapter())) { teardown(); return; }
      parseWorkIds(); getChapterStats(); ensureUI(); measureBounds(); tick(true); maybeRestorePosition();
      active = true;
    }

    const onMutate = debounce(() => {
      if (!active) return;
      if (routes.isWork() || routes.isChapter()) { ensureUI(); getChapterStats(); measureBounds(); tick(true); }
      else { teardown(); }
    }, 150);

    // start observers/listeners only when active
    function startListeners() {
      mo = observe(onMutate);
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onResize);
    }

    // initial
    bootIfEligible();
    startListeners();

    /* === NEW: react instantly to the module toggle === */
    const readEnabled = () => {
      // Prefer AO3H.flags if available, else fallback to stored value (default true)
      try {
        if (flags && typeof flags.get === 'function') return !!flags.get(ENABLE_KEY);
      } catch {}
      return !!store.lsGet(ENABLE_KEY, true);
    };

    const handleFlagChange = () => {
      const enabled = readEnabled();
      if (!enabled && active) {
        teardown();
      } else if (enabled && !active) {
        bootIfEligible();
        startListeners();
      }
    };

    // Use flags.watch if the core provides it; else try a bus event; else poll
    if (flags && typeof flags.watch === 'function') {
      unwatch = flags.watch(ENABLE_KEY, handleFlagChange);
    } else if (bus && typeof bus.on === 'function') {
      const evt = (env && env.NS) ? `${env.NS}:flags-updated` : 'ao3h:flags-updated';
      const cb = () => handleFlagChange();
      bus.on(evt, cb);
      offBus = () => { try { bus.off && bus.off(evt, cb); } catch {} };
    } else {
      // Fallback: very light polling (400ms)
      poll = setInterval(handleFlagChange, 400);
    }

    // disposer
    return () => {
      try { unwatch && unwatch(); } catch {}
      try { offBus && offBus(); } catch {}
      try { poll && clearInterval(poll); } catch {}
      teardown();
    };
  });
})();
