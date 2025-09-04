/* == AO3H Module: ReadingTime ============================================ */
(function () {
  const { util, routes, store, flags, menu } = AO3H;
  const { $, $$, css, observe, debounce } = util;

  AO3H.register('ReadingTime', {
    title: 'Reading Time',

    init() {
      const CFG_KEY = 'ReadingTime:cfg';
      const DATA_KEY = 'ReadingTime:data';
      const defaults = { wpm: 220, showOnLists: true, showOnWork: true, roundTo: 1 }; // minutes
      let cfg = Object.assign({}, defaults, store.lsGet(CFG_KEY, defaults));
      const saveCfg = () => store.lsSet(CFG_KEY, cfg);

      // simple cache for per-work chapter word estimates if you want to get fancy later
      let db = store.lsGet(DATA_KEY, {}); // { [workId]: { perChapterAvg: number } }
      const saveDb = debounce(() => store.lsSet(DATA_KEY, db), 400);

      /* ----------------------------- STYLES ------------------------------ */
      css(`
        .ao3h-rt-chip {
          position: sticky; top: 8px; align-self: flex-start;
          display:inline-flex; gap:6px; align-items:center;
          font:12px/1 system-ui,sans-serif;
          background: rgba(0,0,0,.65); color:#fff; padding:4px 8px; border-radius:10px;
        }
        @media (prefers-color-scheme: light) {
          .ao3h-rt-chip { background: rgba(255,255,255,.8); color:#111; }
        }
        .ao3h-rt-badge {
          display:inline-block; margin-left:6px; padding:1px 6px; border-radius:8px;
          font:11px/1 system-ui,sans-serif; background:rgba(0,0,0,.12);
        }
        .blurb .ao3h-rt-badge { margin-left: 8px; }
      `, 'ao3h-reading-time');

      /* ----------------------- HELPERS / SELECTORS ---------------------- */
      function parseIntSafe(txt) {
        const n = parseInt(String(txt||'').replace(/[^0-9]/g,''), 10);
        return isFinite(n) ? n : null;
      }
      function getWorkAndChapterIds() {
        const mw = location.pathname.match(/^\/works\/(\d+)/);
        const mc = location.pathname.match(/^\/works\/\d+\/chapters\/(\d+)/);
        return { workId: mw ? mw[1] : null, chapterId: mc ? mc[1] : null };
      }
      function getMetaWordsNode(root=document) {
        return root.querySelector('.work.meta .words, dd.words, .meta .words');
      }
      function getWordCount(root=document) {
        const n = getMetaWordsNode(root);
        return n ? parseIntSafe(n.textContent) : null; // AO3 shows total words
      }
      function getChapterPosition() {
        // Try “3/10” pattern
        const n = document.querySelector('.work.meta .chapters, dd.chapters, .meta .chapters');
        if (n) {
          const m = n.textContent.trim().match(/(\d+)\s*\/\s*(\d+|\?)/);
          if (m) return { idx: parseIntSafe(m[1]) || 1, total: m[2]==='?' ? 1 : (parseIntSafe(m[2]) || 1) };
        }
        return { idx: 1, total: 1 };
      }
      function scrollFrac() {
        const el = document.scrollingElement || document.documentElement;
        const max = el.scrollHeight - innerHeight;
        if (max <= 0) return 1;
        return Math.max(0, Math.min(1, scrollY / max));
      }
      // Approx words in the visible chapter if AO3 only gives total:
      function estimateChapterWords(totalWords, idx, total) {
        if (!totalWords || total <= 1) return totalWords;
        // Simple average when we don’t know per-chapter: total/totalChapters
        return Math.max(1, Math.round(totalWords / total));
      }
      function minsFromWords(words, wpm=cfg.wpm) {
        if (!words) return null;
        const mins = words / Math.max(60, wpm);
        return mins;
      }
      function fmtMins(mins) {
        if (mins == null) return '';
        const r = cfg.roundTo > 0 ? Math.max(cfg.roundTo, cfg.roundTo*Math.round(mins/cfg.roundTo)) : Math.round(mins);
        if (r < 1) return '<1m';
        if (r < 60) return `${r}m`;
        const h = Math.floor(r/60), m = r%60;
        return m ? `${h}h${m}m` : `${h}h`;
      }

      /* --------------------- WORK PAGE (live chip) ---------------------- */
      let chip = null, raf = 0, lastY = -1;
      function ensureWorkChip() {
        if (chip || !cfg.showOnWork) {
          // re-attach if moved
        } else {
          chip = document.createElement('div');
          chip.className = 'ao3h-rt-chip';
          chip.title = 'Reading time estimate (click to set WPM)';
          chip.addEventListener('click', () => {
            const v = prompt('Words per minute?', String(cfg.wpm));
            if (!v) return;
            const n = parseInt(v, 10);
            if (isFinite(n) && n > 30 && n < 2000) { cfg.wpm = n; saveCfg(); updateWorkChip(true); updateListBadges(); }
          });
        }
        // Place it near meta area, gracefully fallback to body
        const meta = document.querySelector('.work.meta, dl.meta');
        if (meta && !chip.isConnected) {
          meta.appendChild(chip);
        } else if (!chip.isConnected) {
          document.body.appendChild(chip);
        }
      }

      function updateWorkChip(force=false) {
        if (!cfg.showOnWork) return;
        ensureWorkChip();
        const totalWords = getWordCount();
        const { idx, total } = getChapterPosition();
        const chWords = estimateChapterWords(totalWords, idx, total);

        // Remaining minutes = chapterWords * (1 - scroll%)
        const frac = scrollFrac();
        const remainWords = chWords ? Math.max(0, Math.round(chWords * (1 - frac))) : null;
        const remainMins = minsFromWords(remainWords, cfg.wpm);

        // Also show whole-fic mins (optional small detail)
        const totalMins = minsFromWords(totalWords, cfg.wpm);

        if (chip) {
          const leftTxt = fmtMins(remainMins);
          const totalTxt = fmtMins(totalMins);
          chip.textContent = `~${leftTxt} left`;
          if (totalTxt) chip.textContent += ` · ${totalTxt} total`;
        }
      }

      function onScroll() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (lastY !== scrollY) {
            lastY = scrollY;
            updateWorkChip(false);
          }
        });
      }

      function bootWork() {
        if (!(routes.isWork() || routes.isChapter())) return;
        ensureWorkChip();
        updateWorkChip(true);
        addEventListener('scroll', onScroll, { passive: true });
      }

      function teardownWork() {
        removeEventListener('scroll', onScroll, { passive: true });
        if (chip) try { chip.remove(); } catch {}
        chip = null; raf = 0; lastY = -1;
      }

      /* --------------------- LIST PAGES (badges) ------------------------ */
      function badgeForBlurb(li) {
        if (!cfg.showOnLists) return;
        if (li.querySelector('.ao3h-rt-badge')) return;
        const wordsNode = li.querySelector('.stats .words, .required-tags .words, dd.words');
        const words = wordsNode ? parseIntSafe(wordsNode.textContent) : null;
        if (!words) return;

        const mins = minsFromWords(words, cfg.wpm);
        const txt = fmtMins(mins);
        const where = li.querySelector('.header .heading, h4.heading, h4 a:first-child') || li.querySelector('.header') || li;
        const span = document.createElement('span');
        span.className = 'ao3h-rt-badge';
        span.title = `Reading time at ${cfg.wpm} wpm`;
        span.textContent = `~${txt}`;
        where.appendChild(span);
      }

      function scanList() {
        if (!cfg.showOnLists) return;
        $$('.blurb.work, li.work.blurb.group, .work.blurb.group').forEach(badgeForBlurb);
      }

      function updateListBadges() {
        if (!cfg.showOnLists) return;
        $$('.ao3h-rt-badge').forEach(el => {
          const li = el.closest('.blurb.work, li.work.blurb.group, .work.blurb.group');
          if (!li) return;
          const wordsNode = li.querySelector('.stats .words, .required-tags .words, dd.words');
          const words = wordsNode ? parseIntSafe(wordsNode.textContent) : null;
          const mins = minsFromWords(words, cfg.wpm);
          el.textContent = `~${fmtMins(mins)}`;
          el.title = `Reading time at ${cfg.wpm} wpm`;
        });
      }

      function bootLists() {
        if (routes.isSearch() || routes.isTagWorks() || routes.isBookmarks()) {
          scanList();
        }
      }

      /* ------------------------ OBSERVERS & MENU ------------------------ */
      const mo = observe(() => {
        if (routes.isWork() || routes.isChapter()) {
          ensureWorkChip();
          updateWorkChip(true);
        } else {
          teardownWork();
        }
        if (routes.isSearch() || routes.isTagWorks() || routes.isBookmarks()) {
          scanList();
        }
      });

      try {
        menu.addToggle?.('Reading Time (work pages)', cfg.showOnWork, (v) => { cfg.showOnWork = !!v; saveCfg(); if (v) bootWork(); else teardownWork(); });
        menu.addToggle?.('Reading Time (lists)', cfg.showOnLists, (v) => { cfg.showOnLists = !!v; saveCfg(); scanList(); });
        menu.addAction?.(`Set WPM (now ${cfg.wpm})`, () => {
          const v = prompt('Words per minute?', String(cfg.wpm));
          if (!v) return;
          const n = parseInt(v, 10);
          if (isFinite(n) && n > 30 && n < 2000) { cfg.wpm = n; saveCfg(); updateWorkChip(true); updateListBadges(); }
        });
        menu.rebuild?.();
      } catch {}

      // initial boot
      bootWork();
      bootLists();

      // disposer
      return () => {
        teardownWork();
        mo?.disconnect?.();
        saveDb();
      };
    },

    onFlagsUpdated() { /* Core manages start/stop via dispose/init */ }
  });
})();
