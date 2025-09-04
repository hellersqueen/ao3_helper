/* == AO3H Module: MarkForLaterStatus ==================================== */
(function () {
  const { util, routes, store, menu } = AO3H;
  const { $, $$, css, observe, debounce } = util;

  AO3H.register('MarkForLaterStatus', {
    title: 'Marked for Later (status)',

    init() {
      const CFG_KEY  = 'MFLStatus:cfg';
      const DATA_KEY = 'MFLStatus:cache';

      const defaults = {
        showOnLists: true,
        showOnWork:  true,
        ttlMinutes:  1440,        // cache TTL (1 day)
        maxConcurrent: 2,         // parallel fetches
        // If your AO3 UI is localized, add localized patterns here
        laterTagPatterns: [
          /\bMarked\s*for\s*Later\b/i,           // English
          /\bÀ\s*lire\s*plus\s*tard\b/i,         // French (common phrasing)
          /\bZu\s*später\s*lesen\b/i,            // German (approx)
          /\bPara\s*leer\s*más\s*tarde\b/i       // Spanish (approx)
        ]
      };
      let cfg = Object.assign({}, defaults, store.lsGet(CFG_KEY, defaults));
      const saveCfg = () => store.lsSet(CFG_KEY, cfg);

      // cache: { [workId]: { status: 'later'|'bookmarked'|'none'|'unknown', t: epochMs } }
      let cache = store.lsGet(DATA_KEY, {});
      const saveCache = debounce(() => store.lsSet(DATA_KEY, cache), 300);

      css(`
        .ao3h-mfls-badge {
          display:inline-flex; align-items:center; gap:6px;
          padding:2px 6px; border-radius:8px; font:11px/1 system-ui,sans-serif;
          background:rgba(0,0,0,.08); margin-left:8px;
        }
        .ao3h-mfls-later { background:rgba(16,185,129,.18) }
        .ao3h-mfls-book  { background:rgba(59,130,246,.18) }
        .ao3h-mfls-none  { opacity:.65 }
        @media (prefers-color-scheme: dark){
          .ao3h-mfls-badge{ background:rgba(255,255,255,.08); }
          .ao3h-mfls-later { background:rgba(16,185,129,.25) }
          .ao3h-mfls-book  { background:rgba(59,130,246,.25) }
        }
        .ao3h-mfls-chip {
          position:sticky; top:8px; align-self:flex-start;
          display:inline-flex; align-items:center; gap:6px;
          padding:4px 8px; border-radius:10px; font:12px/1 system-ui,sans-serif;
          background:rgba(0,0,0,.65); color:#fff;
        }
        @media (prefers-color-scheme: light){
          .ao3h-mfls-chip{ background:rgba(255,255,255,.85); color:#111; }
        }
        .ao3h-mfls-spin { display:inline-block; width:10px; height:10px;
          border:2px solid currentColor; border-right-color:transparent; border-radius:50%;
          animation: ao3hspin .8s linear infinite; }
        @keyframes ao3hspin{ to{ transform: rotate(360deg) } }
      `, 'ao3h-markforlater-status');

      /* ----------------------- Helpers ----------------------- */
      const now = () => Date.now();
      const fresh = (t) => (now() - (t || 0)) < cfg.ttlMinutes * 60 * 1000;

      const workIdFromHref = (href) => (href || '').match(/\/works\/(\d+)/)?.[1] || null;
      const workIdFromBlurb = (li) => {
        const a = li.querySelector('h4 a[href*="/works/"]') || li.querySelector('a[href*="/works/"]');
        return a ? workIdFromHref(a.getAttribute('href')) : null;
      };

      const STATUS = { LATER: 'later', BOOK: 'bookmarked', NONE: 'none', UNKNOWN: 'unknown' };

      function detectStatusFromHTML(html) {
        // Do we have a bookmark at all?
        const hasEdit = />(?:Edit|Update)\s+Bookmark<|\/bookmarks\/\d+\/edit/i.test(html)
                      || /name="bookmark\[private\]"/i.test(html); // edit form presence
        if (!hasEdit) return STATUS.NONE;

        // Try to detect “Marked for Later” tag; AO3 renders tags in bookmark UI and in the bookmark listing.
        const isLater = cfg.laterTagPatterns.some((re) => re.test(html));
        return isLater ? STATUS.LATER : STATUS.BOOK;
      }

      // Small fetch queue with concurrency cap
      const q = [];
      let active = 0;
      function enqueue(job) { q.push(job); pump(); }
      function pump() {
        while (active < cfg.maxConcurrent && q.length) {
          active++;
          const job = q.shift();
          job().finally(() => { active--; pump(); });
        }
      }

      function fetchStatus(workId) {
        const c = cache[workId];
        if (c && fresh(c.t)) return Promise.resolve(c.status);

        return fetch(`/works/${workId}`, { credentials: 'same-origin' })
          .then(r => r.ok ? r.text() : '')
          .then(html => {
            const s = detectStatusFromHTML(html);
            cache[workId] = { status: s, t: now() };
            saveCache();
            return s;
          })
          .catch(() => {
            cache[workId] = { status: STATUS.UNKNOWN, t: now() };
            saveCache();
            return STATUS.UNKNOWN;
          });
      }

      function badgeForStatus(s) {
        const span = document.createElement('span');
        span.className = 'ao3h-mfls-badge';
        if (s === STATUS.LATER) {
          span.classList.add('ao3h-mfls-later');
          span.textContent = '⏳ Later';
          span.title = 'In your “Marked for Later” list';
        } else if (s === STATUS.BOOK) {
          span.classList.add('ao3h-mfls-book');
          span.textContent = '★ Bookmarked';
          span.title = 'Bookmarked (not “Marked for Later”)';
        } else if (s === STATUS.NONE) {
          span.classList.add('ao3h-mfls-none');
          span.textContent = '✩ Not bookmarked';
          span.title = 'No bookmark';
        } else {
          span.classList.add('ao3h-mfls-none');
          span.innerHTML = '<span class="ao3h-mfls-spin" aria-hidden="true"></span> Checking…';
          span.title = 'Checking…';
        }
        return span;
      }

      /* -------------------- List pages -------------------- */
      let io = null;
      function ensureBadgeOnBlurb(li) {
        if (!cfg.showOnLists || li._ao3hMfls) return;
        li._ao3hMfls = true;

        const where =
          li.querySelector('.header .heading, h4.heading, h4 a:first-child') ||
          li.querySelector('.header') || li;

        const wid = workIdFromBlurb(li);
        if (!wid) return;

        const badge = badgeForStatus(STATUS.UNKNOWN);
        where.appendChild(badge);

        if (!io) {
          io = new IntersectionObserver((entries) => {
            entries.forEach((en) => {
              if (!en.isIntersecting) return;
              io.unobserve(en.target);
              const w = workIdFromBlurb(en.target);
              if (!w) return;
              enqueue(() => fetchStatus(w).then((s) => {
                const old = en.target.querySelector('.ao3h-mfls-badge');
                if (old && old.parentNode) old.parentNode.replaceChild(badgeForStatus(s), old);
              }));
            });
          }, { rootMargin: '200px 0px' });
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
        chip.className = 'ao3h-mfls-chip';
        chip.textContent = 'Later: …';
        const meta = document.querySelector('.work.meta, dl.meta') || document.body;
        meta.appendChild(chip);
      }
      function paintChip(status) {
        if (!chip) return;
        if (status === STATUS.LATER)      chip.textContent = '⏳ Marked for Later';
        else if (status === STATUS.BOOK)  chip.textContent = '★ Bookmarked (not Later)';
        else if (status === STATUS.NONE)  chip.textContent = '✩ Not bookmarked';
        else                              chip.innerHTML  = '<span class="ao3h-mfls-spin"></span> Checking…';
      }
      function updateWorkChip() {
        if (!cfg.showOnWork) return;
        ensureWorkChip();
        const wid = location.pathname.match(/\/works\/(\d+)/)?.[1];
        if (!wid) return;
        const cached = cache[wid];
        if (cached && fresh(cached.t)) paintChip(cached.status);
        enqueue(() => fetchStatus(wid).then(paintChip));
      }
      function teardownWork() { if (chip) { try { chip.remove(); } catch{} chip = null; } }

      /* -------------------- Wire up -------------------- */
      function reflow() {
        if (routes.isWork() || routes.isChapter()) updateWorkChip(); else teardownWork();
        scanList();
      }

      reflow();
      const mo = observe(document.body, { childList:true, subtree:true }, debounce(reflow, 150));

      try {
        menu.addToggle?.('Later status on lists', cfg.showOnLists, (v)=>{ cfg.showOnLists = !!v; saveCfg(); scanList(); });
        menu.addToggle?.('Later status on work page', cfg.showOnWork, (v)=>{ cfg.showOnWork = !!v; saveCfg(); updateWorkChip(); });
        menu.addAction?.(`Cache TTL (min): ${cfg.ttlMinutes}`, () => {
          const v = prompt('Minutes to cache status?', String(cfg.ttlMinutes));
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) { cfg.ttlMinutes = n; saveCfg(); }
        });
        menu.addAction?.('Clear Later-status cache', () => { cache = {}; saveCache(); reflow(); });
        menu.addAction?.('Edit tag patterns…', () => {
          const v = prompt('Separate patterns by | (regex, case-insensitive).',
            cfg.laterTagPatterns.map(r => r.source).join('|'));
          if (v != null) {
            const parts = v.split('|').map(s => s.trim()).filter(Boolean);
            cfg.laterTagPatterns = parts.map(p => new RegExp(p, 'i'));
            saveCfg();
            // Clear cache so new detection applies
            cache = {}; saveCache(); reflow();
          }
        });
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
