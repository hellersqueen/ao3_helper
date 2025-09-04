/* == AO3H Module: BookmarkStatus ======================================== */
(function () {
  const { util, routes, store, menu } = AO3H;
  const { $, $$, css, observe, debounce } = util;

  AO3H.register('BookmarkStatus', {
    title: 'Bookmark Status in Blurbs',

    init() {
      const CFG_KEY = 'BookmarkStatus:cfg';
      const DATA_KEY = 'BookmarkStatus:cache';

      const defaults = {
        showOnLists: true,
        showOnWork:  true,
        ttlMinutes:  1440,   // cache time-to-live (1 day)
        maxConcurrent: 2,    // parallel fetches
        userRegex: null      // (optional) set your AO3 username to be extra strict in detection
      };
      let cfg = Object.assign({}, defaults, store.lsGet(CFG_KEY, defaults));
      const saveCfg = () => store.lsSet(CFG_KEY, cfg);

      // cache schema: { [workId]: { status: 'none'|'public'|'private'|'unknown', t: epochMs } }
      let cache = store.lsGet(DATA_KEY, {});
      const saveCache = debounce(() => store.lsSet(DATA_KEY, cache), 300);

      css(`
        .ao3h-bm-badge {
          display:inline-flex; align-items:center; gap:6px;
          padding:2px 6px; border-radius:8px; font:11px/1 system-ui,sans-serif;
          background:rgba(0,0,0,.08); margin-left:8px;
        }
        .ao3h-bm-none { opacity:.65 }
        .ao3h-bm-public { background:rgba(16,185,129,.18) }
        .ao3h-bm-private{ background:rgba(59,130,246,.18) }
        @media (prefers-color-scheme: dark){
          .ao3h-bm-badge{ background:rgba(255,255,255,.08); }
          .ao3h-bm-public { background:rgba(16,185,129,.25) }
          .ao3h-bm-private{ background:rgba(59,130,246,.25) }
        }
        .ao3h-bm-chip {
          position:sticky; top:8px; align-self:flex-start;
          display:inline-flex; align-items:center; gap:6px;
          padding:4px 8px; border-radius:10px; font:12px/1 system-ui,sans-serif;
          background:rgba(0,0,0,.65); color:#fff;
        }
        @media (prefers-color-scheme: light){
          .ao3h-bm-chip{ background:rgba(255,255,255,.85); color:#111; }
        }
        .ao3h-bm-spin { display:inline-block; width:10px; height:10px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation: ao3hspin .8s linear infinite; }
        @keyframes ao3hspin{ to{ transform: rotate(360deg) } }
      `, 'ao3h-bookmark-status');

      /* ---------------------- Helpers ---------------------- */
      const now = () => Date.now();
      const isFresh = (t) => (now() - (t || 0)) < cfg.ttlMinutes * 60 * 1000;

      const parseWorkIdFromBlurb = (li) => {
        const a = li.querySelector('h4 a[href*="/works/"]');
        const m = a && a.getAttribute('href')?.match(/\/works\/(\d+)/);
        return m ? m[1] : null;
      };

      const STATUS = {
        NONE: 'none',
        PUBLIC: 'public',
        PRIVATE: 'private',
        UNKNOWN: 'unknown'
      };

      // Heuristics on fetched work page HTML
      function detectStatusFromHTML(html) {
        // If you want to be stricter, set cfg.userRegex to your AO3 username
        const userPart = cfg.userRegex ? `[^<>{}]*?${cfg.userRegex}` : '[\\s\\S]*?';

        // Edit bookmark present → you have a bookmark (public or private)
        const hasEdit = />(?:Edit|Update)\s+Bookmark<|\/bookmarks\/\d+\/edit/i.test(html);

        // Private bookmark hints:
        // AO3 shows “(Private)” near your bookmark, or the edit form has private checkbox checked.
        const hasPrivateBadge = /\bPrivate\b/i.test(html) && /\/bookmarks\/\d+/.test(html);
        const privateCheckboxChecked = /name="bookmark\[private\]"\s+[^>]*checked/i.test(html);

        if (hasEdit) {
          if (hasPrivateBadge || privateCheckboxChecked) return STATUS.PRIVATE;
          return STATUS.PUBLIC;
        }
        // Explicit “Bookmark” action without edit implies no existing bookmark
        const hasCreate = />\s*Bookmark\s*</i.test(html);
        if (hasCreate) return STATUS.NONE;

        return STATUS.UNKNOWN;
      }

      // Request queue with concurrency cap
      const queue = [];
      let active = 0;

      function enqueue(job) {
        queue.push(job);
        pump();
      }
      function pump() {
        while (active < cfg.maxConcurrent && queue.length) {
          const j = queue.shift();
          active++;
          j().finally(() => { active--; pump(); });
        }
      }

      function fetchWorkStatus(workId) {
        // cached?
        const c = cache[workId];
        if (c && isFresh(c.t)) return Promise.resolve(c.status);

        const url = `/works/${workId}`;
        return fetch(url, { credentials: 'same-origin' })
          .then(r => r.ok ? r.text() : '')
          .then(html => {
            const status = detectStatusFromHTML(html);
            cache[workId] = { status, t: now() };
            saveCache();
            return status;
          })
          .catch(() => {
            cache[workId] = { status: STATUS.UNKNOWN, t: now() };
            saveCache();
            return STATUS.UNKNOWN;
          });
      }

      function makeBadge(status) {
        const span = document.createElement('span');
        span.className = 'ao3h-bm-badge';
        if (status === STATUS.PUBLIC) {
          span.classList.add('ao3h-bm-public');
          span.textContent = '★ Bookmarked';
          span.title = 'You bookmarked this (public)';
        } else if (status === STATUS.PRIVATE) {
          span.classList.add('ao3h-bm-private');
          span.textContent = '🔒 Bookmarked';
          span.title = 'You bookmarked this (private)';
        } else if (status === STATUS.NONE) {
          span.classList.add('ao3h-bm-none');
          span.textContent = '✩ Not bookmarked';
          span.title = 'You have not bookmarked this';
        } else {
          span.classList.add('ao3h-bm-none');
          span.innerHTML = '<span class="ao3h-bm-spin" aria-hidden="true"></span> Checking…';
          span.title = 'Checking bookmark status…';
        }
        return span;
      }

      /* -------------------- List pages -------------------- */
      let io = null;
      function ensureBadgeOnBlurb(li) {
        if (!cfg.showOnLists) return;
        if (li._ao3hBmApplied) return;
        li._ao3hBmApplied = true;

        const where =
          li.querySelector('.header .heading, h4.heading, h4 a:first-child') ||
          li.querySelector('.header') || li;

        const workId = parseWorkIdFromBlurb(li);
        if (!workId) return;

        const badge = makeBadge(STATUS.UNKNOWN);
        where.appendChild(badge);

        // Lazy-check when in view
        if (!io) {
          io = new IntersectionObserver((entries) => {
            entries.forEach((en) => {
              if (!en.isIntersecting) return;
              const li = en.target;
              io.unobserve(li);
              const wid = parseWorkIdFromBlurb(li);
              if (!wid) return;

              enqueue(() =>
                fetchWorkStatus(wid).then((st) => {
                  // Replace badge
                  const old = li.querySelector('.ao3h-bm-badge');
                  if (old && old.parentNode) old.parentNode.replaceChild(makeBadge(st), old);
                })
              );
            });
          }, { rootMargin: '200px 0px' }); // prefetch a bit ahead
        }
        io.observe(li);
      }

      function scanList() {
        if (!(routes.isSearch() || routes.isTagWorks() || routes.isBookmarks() || /\/works$/.test(location.pathname))) return;
        $$('.blurb.work, li.work.blurb.group, .work.blurb.group').forEach(ensureBadgeOnBlurb);
      }

      /* -------------------- Work page chip -------------------- */
      let chip = null;
      function ensureWorkChip() {
        if (!cfg.showOnWork || chip) return;
        chip = document.createElement('span');
        chip.className = 'ao3h-bm-chip';
        chip.textContent = 'Bookmark: …';
        const meta = document.querySelector('.work.meta, dl.meta') || document.body;
        meta.appendChild(chip);
      }
      function updateWorkChip() {
        if (!cfg.showOnWork) return;
        ensureWorkChip();
        const m = location.pathname.match(/\/works\/(\d+)/);
        const wid = m && m[1];
        if (!wid) return;
        const cached = cache[wid];
        if (cached && isFresh(cached.t)) {
          // immediate paint
          paintChip(cached.status);
        }
        enqueue(() => fetchWorkStatus(wid).then(paintChip));
      }
      function paintChip(status) {
        if (!chip) return;
        if (status === STATUS.PUBLIC)      { chip.textContent = '★ Bookmarked (public)'; }
        else if (status === STATUS.PRIVATE){ chip.textContent = '🔒 Bookmarked (private)'; }
        else if (status === STATUS.NONE)   { chip.textContent = '✩ Not bookmarked'; }
        else                               { chip.innerHTML = '<span class="ao3h-bm-spin"></span> Checking…'; }
      }
      function teardownWork() { if (chip) { try { chip.remove(); } catch{} chip = null; } }

      /* -------------------- Wire up -------------------- */
      function reflow() {
        if (routes.isWork() || routes.isChapter()) { updateWorkChip(); }
        if (routes.isSearch() || routes.isTagWorks() || routes.isBookmarks() || /\/works$/.test(location.pathname)) { scanList(); }
      }

      reflow();
      const mo = observe(document.body, { childList:true, subtree:true }, debounce(reflow, 150));

      try {
        menu.addToggle?.('Bookmark status on lists', cfg.showOnLists, (v)=>{ cfg.showOnLists = !!v; saveCfg(); scanList(); });
        menu.addToggle?.('Bookmark status on work page', cfg.showOnWork, (v)=>{ cfg.showOnWork = !!v; saveCfg(); updateWorkChip(); });
        menu.addAction?.(`Cache TTL (min): ${cfg.ttlMinutes}`, () => {
          const v = prompt('Minutes to cache bookmark status?', String(cfg.ttlMinutes));
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) { cfg.ttlMinutes = n; saveCfg(); }
        });
        menu.addAction?.('Clear bookmark cache', () => { cache = {}; saveCache(); reflow(); });
        menu.rebuild?.();
      } catch {}

      // Dispose
      return () => {
        mo?.disconnect?.();
        if (io) { try { io.disconnect(); } catch{} io = null; }
        teardownWork();
      };
    },

    onFlagsUpdated() { /* lifecycle handled by core */ }
  });
})();
