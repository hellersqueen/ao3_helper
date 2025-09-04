/* == AO3H Module: ProgressBar ============================================= */
(function () {
  const { util, routes, store, flags, menu } = AO3H;
  const { $, $$, css, observe, debounce, log } = util;

  AO3H.register('ProgressBar', {
    title: 'Reading Progress',

    init() {
      const KV = 'ProgressBar:v1';
      const defaults = {
        showETA: true,
        wpm: 220,              // average words per minute for ETA
        barAtTop: true,        // false => bottom
        rememberChapterPercent: true
      };
      let cfg = Object.assign({}, defaults, store.lsGet(KV + ':cfg', defaults));
      let ui = null, raf = 0, lastScrollY = -1, detachObs = null;
      let state = { workId: null, chapterId: null, chapterIndex: 1, chapterTotal: 1, words: null };

      // per-work progress store:
      // progress[workId] = { chaptersDone: { [chapterNumber]: true }, lastPos: { [chapterId]: percent } }
      let progress = store.lsGet(KV + ':data', {});

      const saveCfg = () => store.lsSet(KV + ':cfg', cfg);
      const saveData = debounce(() => store.lsSet(KV + ':data', progress), 300);

      function parseWorkIds() {
        // /works/12345[ /chapters/67890 ]
        const mWork = location.pathname.match(/^\/works\/(\d+)/);
        const mChap = location.pathname.match(/^\/works\/\d+\/chapters\/(\d+)/);
        state.workId = mWork ? mWork[1] : null;
        state.chapterId = mChap ? mChap[1] : null;
      }

      function getChapterStats() {
        // Chapters: try common meta spot e.g. ".work.meta .chapters" contains "3/10" or "1/1"
        const node = document.querySelector('.work.meta .chapters, .work.meta dd.chapters, .meta .chapters, dd.chapters');
        let idx = 1, total = 1;
        if (node) {
          const m = node.textContent.trim().match(/(\d+)\s*\/\s*(\d+|\?)/);
          if (m) {
            idx = parseInt(m[1], 10) || 1;
            total = (m[2] === '?' ? 1 : parseInt(m[2], 10) || 1);
          }
        } else {
          // Fallback: try navigation "Chapter N" text
          const nav = document.querySelector('.chapter .title, .chapter .heading, .title.heading');
          const m2 = nav && nav.textContent.match(/chapter\s+(\d+)\s*(?:of\s+(\d+))?/i);
          if (m2) {
            idx = parseInt(m2[1], 10) || 1;
            total = parseInt(m2[2], 10) || 1;
          }
        }
        state.chapterIndex = idx;
        state.chapterTotal = Math.max(1, total);

        // Words: from meta ".work.meta .words"
        const w = document.querySelector('.work.meta .words, dd.words');
        state.words = w ? parseInt(w.textContent.replace(/[^0-9]/g,''), 10) || null : null;
      }

      function contentContainer() {
        // Prefer the chapter body; fall back to the whole document
        return document.querySelector('#workskin') || document.body;
      }

      function getScrollFrac() {
        const el = document.scrollingElement || document.documentElement;
        const max = el.scrollHeight - window.innerHeight;
        if (max <= 0) return 1;
        return Math.max(0, Math.min(1, window.scrollY / max));
      }

      function getFicFrac() {
        // Overall: current chapter index / total chapters
        return Math.max(0, Math.min(1, state.chapterIndex / state.chapterTotal));
      }

      function wordsLeftApprox(frac) {
        if (!state.words || !cfg.showETA) return null;
        const left = Math.max(0, 1 - frac) * state.words;
        const mins = left / Math.max(60, cfg.wpm); // basic guard
        return mins; // minutes float
      }

      function formatETA(mins) {
        if (mins == null) return '';
        if (mins < 0.75) return ' <1m';
        const m = Math.round(mins);
        if (m < 60) return ` ${m}m`;
        const h = Math.floor(m/60), mm = m % 60;
        return ` ${h}h${mm? (mm+'m') : ''}`;
      }

      function ensureUI() {
        if (ui) return;
        css(`
          .ao3h-pbar-wrap { position:fixed; left:0; right:0; z-index:99998; pointer-events:none; }
          .ao3h-pbar-wrap.top { top:0; } .ao3h-pbar-wrap.bot { bottom:0; }
          .ao3h-pbar { height:6px; background:transparent; }
          .ao3h-pbar .track { position:relative; height:100%; background:rgba(0,0,0,.12); }
          .ao3h-pbar .fic { position:absolute; left:0; top:0; bottom:0; opacity:.35; background:#3b82f6; }
          .ao3h-pbar .chapter { position:absolute; left:0; top:0; bottom:0; background:#10b981; }
          .ao3h-pbar-label {
            position:absolute; right:10px; top:-18px; font:12px/1 system-ui,sans-serif;
            color:#fff; background:rgba(0,0,0,.45); padding:2px 6px; border-radius:8px; pointer-events:auto;
          }
          @media (prefers-color-scheme: light) {
            .ao3h-pbar-label { color:#111; background:rgba(255,255,255,.6); }
          }
        `, 'ao3h-progress-bar');

        ui = document.createElement('div');
        ui.className = `ao3h-pbar-wrap ${cfg.barAtTop ? 'top':'bot'}`;
        ui.innerHTML = `
          <div class="ao3h-pbar">
            <div class="track">
              <div class="fic" style="width:0%"></div>
              <div class="chapter" style="width:0%"></div>
              <div class="ao3h-pbar-label" title="Click to toggle ETA"></div>
            </div>
          </div>
        `;
        document.body.appendChild(ui);

        // Toggle ETA on click
        ui.querySelector('.ao3h-pbar-label').addEventListener('click', (e)=>{
          e.preventDefault(); e.stopPropagation();
          cfg.showETA = !cfg.showETA; saveCfg(); tick(true);
        });
      }

      function destroyUI() {
        if (!ui) return;
        try { ui.remove(); } catch {}
        ui = null;
      }

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
          // smooth scroll to previous percentage
          const el = document.scrollingElement || document.documentElement;
          const max = el.scrollHeight - innerHeight;
          if (max > 0) window.scrollTo({ top: pct * max, behavior: 'instant' in window ? 'instant' : 'auto' });
        }
      }

      function persistPosition(frac) {
        if (!cfg.rememberChapterPercent || !state.chapterId || !state.workId) return;
        const entry = progress[state.workId] || (progress[state.workId] = { chaptersDone:{}, lastPos:{} });
        entry.lastPos[state.chapterId] = Math.max(0, Math.min(1, frac));
        saveData();
      }

      function tick(force) {
        if (!ui) return;
        const chFrac = getScrollFrac();
        const ficFrac = getFicFrac();

        // Update widths only if needed (avoid layout thrash)
        const ficEl = ui.querySelector('.fic');
        const chEl  = ui.querySelector('.chapter');
        const ficW  = `${Math.round(ficFrac*100)}%`;
        const chW   = `${Math.round(chFrac*100)}%`;
        if (force || ficEl.style.width !== ficW) ficEl.style.width = ficW;
        if (force || chEl.style.width  !== chW)  chEl.style.width  = chW;

        const label = ui.querySelector('.ao3h-pbar-label');
        const eta = formatETA(wordsLeftApprox(chFrac));
        label.textContent = `${Math.round(chFrac*100)}%${cfg.showETA ? eta : ''}`;

        markDoneIfAtBottom(chFrac);
        persistPosition(chFrac);
      }

      function onScroll() {
        if (raf) return; // coalesce to next frame
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (lastScrollY !== window.scrollY) {
            lastScrollY = window.scrollY;
            tick(false);
          }
        });
      }

      function bootIfEligible() {
        if (!routes.isWork() && !routes.isChapter()) return;
        parseWorkIds();
        getChapterStats();
        ensureUI();
        tick(true);
        maybeRestorePosition();
      }

      // Observe DOM changes (AO3 uses partial reloads sometimes)
      const mo = observe(() => {
        if (routes.isWork() || routes.isChapter()) {
          // Ensure bar exists and stats are current
          ensureUI();
          getChapterStats();
          tick(true);
        } else {
          destroyUI();
        }
      });

      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', debounce(() => tick(true), 150), { passive: true });

      // Optional: menu toggle & simple settings hooks
      try {
        menu.addToggle?.('Reading Progress', flags.get('mod:ProgressBar:enabled', true), (val) => {
          AO3H.modules.setEnabled('ProgressBar', !!val);
        });
        menu.addAction?.(cfg.barAtTop ? 'Move bar to bottom' : 'Move bar to top', () => {
          cfg.barAtTop = !cfg.barAtTop; saveCfg();
          if (ui) { ui.classList.toggle('top',  cfg.barAtTop); ui.classList.toggle('bot', !cfg.barAtTop); }
        });
        menu.addAction?.(cfg.showETA ? 'Hide ETA' : 'Show ETA', () => {
          cfg.showETA = !cfg.showETA; saveCfg(); tick(true);
        });
        menu.rebuild?.();
      } catch {}

      // Initial boot
      bootIfEligible();

      // disposer
      return () => {
        removeEventListener('scroll', onScroll, { passive: true });
        destroyUI();
        mo?.disconnect?.();
      };
    },

    onFlagsUpdated({ enabled }) {
      // Core will dispose/init on start/stop; nothing else required here.
      log.dbg?.('ProgressBar flag changed', enabled);
    }
  });
})();
