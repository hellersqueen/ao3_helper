/* ──────────────────────────────────────────────────────────────────────
   AO3 – Check Kudos + Metadata Cache (WORK PAGE ONLY)
   NOTE: keep this block ABOVE your Kudos Page IIFE. Do not edit your page code.
────────────────────────────────────────────────────────────────────── */
;(function () {
  'use strict';
  // === Global, reusable username getter (guarded to avoid recursion) ===
  function getSignedInUsername() {
    try {
      const helper = window.__ao3hGetUser;
      if (typeof helper === 'function' && helper !== getSignedInUsername) {
        const u = helper();
        if (u) return u;
      }
    } catch {}

    const href =
      document.querySelector('li.dropdown > a[href^="/users/"]')?.getAttribute('href') ||
      document.querySelector('#greeting .user a[href^="/users/"]')?.getAttribute('href') ||
      document.querySelector('#header a[href^="/users/"]')?.getAttribute('href') || '';
    const m = href.match(/^\/users\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // If no helper exists yet, export this one for other parts of your script
  if (typeof window.__ao3hGetUser !== 'function') {
    window.__ao3hGetUser = getSignedInUsername;
  }

  function makeWorkPageScanner() {
    'use strict';
    // Only run on work pages; otherwise return a no-op disposer for AO3H.
    if (!/^\/works\/\d+/.test(location.pathname)) return () => {};
    const workId = location.pathname.split('/')[2];

    /* ---------- small utils ---------- */
    const todayLocal = () => new Date().toLocaleDateString('en-CA');
    function asText(html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}


    function userPresentInKudos(kudosContainer, usernameRaw) {
      if (!kudosContainer || !usernameRaw) return false;
      const want = String(usernameRaw).toLowerCase();
      const anchors = kudosContainer.querySelectorAll('a[href^="/users/"]');
      for (const a of anchors) {
        const m = (a.getAttribute('href') || '').match(/^\/users\/([^/?#]+)/i);
        if (!m) continue;
        if (decodeURIComponent(m[1]).toLowerCase() === want) return true;
      }
      return false;
    }

    /* ---------- compact cache (same schema the page uses) ---------- */
    const CACHE_KEY = 'kudos_fic_cache';
    const CACHE_INDEX_KEY = 'kudos_fic_cache_index';
    const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } };
    const readIndex = () => { try { return JSON.parse(localStorage.getItem(CACHE_INDEX_KEY) || '{}'); } catch { return {}; } };
    function writeCacheUnsafe(cache, index) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
    }
    function pruneLRU(index, cache, n = 80) {
      const items = Object.entries(index).sort((a, b) => a[1] - b[1]); // oldest first
      for (const [id] of items.slice(0, n)) { delete cache[id]; delete index[id]; }
    }
    function compactTags(t) {
      if (!t || typeof t !== 'object') return null;
      const cap = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : [];
      return {
        rating:        cap(t.rating, 2),
        warnings:      cap(t.warnings, 6),
        categories:    cap(t.categories, 6),
        relationships: cap(t.relationships, 12),
        characters:    cap(t.characters, 12),
        freeforms:     cap(t.freeforms, 20),
      };
    }
    function makeCompactEntry(e, id) {
      const authorPlain = asText(e.authorText ?? e.author ?? e.authorHTML ?? '') || 'orphan_account';
      return {
        title: asText(e.title) || `Fic #${id}`,
        authorText: authorPlain,
        authorHTML: e.authorHTML ?? null,
        summaryHTML: e.summaryHTML ?? null,
        summary: asText(e.summary ?? e.summaryHTML ?? '').slice(0, 350) || 'No summary.',
        fandom: e.fandom || 'unavailable',
        tags: compactTags(e.tags),
        locked: !!e.locked,
        v: 6
      };
    }
    function setCacheSafe(id, entryRaw) {
      id = String(id);
      const cache = readCache();
      const index = readIndex();
      cache[id] = makeCompactEntry(entryRaw || {}, id);
      index[id] = Date.now();
      try { writeCacheUnsafe(cache, index); return; }
      catch {}
      pruneLRU(index, cache, 100);
      try { writeCacheUnsafe(cache, index); return; }
      catch { pruneLRU(index, cache, 160); writeCacheUnsafe(cache, index); }
    }

    /* ---------- DOM extractors ---------- */
    function extractAuthorsHTML(root) {
      if (!root) return { authorText: 'orphan_account', authorHTML: null };
      const nodes = root.querySelectorAll('a[rel="author"], a[rel=author], h3.byline a[href^="/users/"], a[href^="/users/"].login');
      if (!nodes.length) return { authorText: 'orphan_account', authorHTML: null };
      const html = Array.from(nodes).map(n => n.outerHTML).join(', ');
      const text = Array.from(nodes).map(n => (n.textContent || '').trim()).filter(Boolean).join(', ') || 'orphan_account';
      return { authorText: text, authorHTML: html };
    }
    function extractMetaTags(root) {
      if (!root) return { rating: [], warnings: [], categories: [], relationships: [], characters: [], freeforms: [] };
      const texts = (nodes) => Array.from(nodes).map(n => (n.textContent || '').trim()).filter(Boolean);
      const pick = (sel) => texts(root.querySelectorAll(sel));
      const out = { rating: [], warnings: [], categories: [], relationships: [], characters: [], freeforms: [] };
      out.rating        = pick('dd.rating.tags a.tag, dd.rating a.tag');
      out.warnings      = pick('dd.warnings.tags a.tag, dd.warnings a.tag, dd.warning.tags a.tag, dd.warning a.tag');
      out.categories    = pick('dd.categories.tags a.tag, dd.categories a.tag, dd.category.tags a.tag, dd.category a.tag');
      out.relationships = pick('dd.relationships.tags a.tag, dd.relationships a.tag, dd.relationship.tags a.tag, dd.relationship a.tag');
      out.characters    = pick('dd.characters.tags a.tag, dd.characters a.tag, dd.character.tags a.tag, dd.character a.tag');
      out.freeforms     = pick('dd.freeforms.tags a.tag, dd.freeforms a.tag, dd.freeform.tags a.tag, dd.freeform a.tag');
      const ul = root.querySelector('ul.tags'); // AO3H UL fallback
      if (ul) {
        const take = (cls) => texts(ul.querySelectorAll(`li.${cls} a.tag, li.${cls} .ao3h-tag-txt, li.${cls} a[href^="/tags/"]`));
        if (!out.rating.length)        out.rating        = take('rating');
        if (!out.warnings.length)      out.warnings      = take('warnings');
        if (!out.categories.length)    out.categories    = take('categories');
        if (!out.relationships.length) out.relationships = take('relationships');
        if (!out.characters.length)    out.characters    = take('characters');
        if (!out.freeforms.length)     out.freeforms     = take('freeforms');
      }
      return out;
    }

    /* ---------- capture metadata from THIS page ---------- */
    function captureMetadataIntoCache() {
      try {
        const headerTitle =
          document.querySelector('h2.title.heading') ||
          document.querySelector('h2.heading.title') ||
          document.querySelector('h2.title');
        if (!headerTitle) return; // not ready

        const title = (headerTitle.textContent || '').trim() || `Fic #${workId}`;
        const { authorText, authorHTML } = extractAuthorsHTML(document);

        const summaryHTML =
          document.querySelector('.summary .userstuff')?.innerHTML ??
          document.querySelector('blockquote.userstuff.summary')?.innerHTML ?? '';
        const summary = asText(summaryHTML) || 'No summary.';

        const meta = document.querySelector('dl.work.meta, dl.meta');
        const rawFandom =
          meta?.querySelector('dd.fandom.tags li a.tag')?.textContent?.trim() ||
          meta?.querySelector('dd.fandom a.tag')?.textContent?.trim() ||
          'unavailable';

        const tags = extractMetaTags(document);

        setCacheSafe(workId, { title, authorText, authorHTML, tags, summaryHTML, summary, fandom: rawFandom, locked: false });
        console.log('💾 [Kudos] Cached metadata for work', workId);
      } catch (e) {
        console.warn('⚠️ [Kudos] Could not cache metadata for work', workId, e);
      }
    }

    /* ---------- weekly gate (AUTO check only) ---------- */
    const AUTO_LAST_CHECK_DAY = 'kudos_auto_last_check_day';
    function kudosAutoCheckDue() {
      const last = localStorage.getItem(AUTO_LAST_CHECK_DAY) || '';
      if (!last) return true;
      const then = new Date(last);
      if (Number.isNaN(then.getTime())) return true;
      const now = new Date(todayLocal());
      const diffDays = Math.floor((now - then) / (24 * 60 * 60 * 1000));
      return diffDays >= 7;
    }
    function markKudosAutoCheckedToday() {
      localStorage.setItem(AUTO_LAST_CHECK_DAY, todayLocal());
    }

    /* ---------- kudos checker logic ---------- */
    const username = getSignedInUsername();
    if (!username) {
      console.warn('[Kudos] Not signed in; kudos check disabled, metadata still cached.');
      captureMetadataIntoCache();
      return () => {};
    }

    let cancelled = false;

    // Keep references for cleanup (so disabling the module removes UI & listeners)
    const __ui = { li: null, checkbox: null, btnNow: null, kudosBtn: null };

    function onNowClick(e) {
      if (e) e.preventDefault();
      cancelled = false;
      console.log('⏩ [Kudos] Forcing kudos check now…');
      expandAndCheck('Kudos (manual)');
    }
    function onCheckboxChange() {
      const on = __ui.checkbox.checked;
      localStorage.setItem('kudos_check_enabled', on);
      cancelled = !on;
      if (on) {
        console.log('▶️ [Kudos] Checking enabled.');
        expandAndCheck('Kudos (manual-toggle)');
      } else {
        console.log('⛔ [Kudos] Checking disabled.');
      }
    }

   function onKudosBtnClick() {
  setTimeout(() => {
    if (!cancelled) {
      console.log('⏳ [Kudos] Re-checking shortly after clicking Kudos…');
      // expandAndCheck -> checkAndSaveKudosOnce() will add to list AND cache only if your name is found
      expandAndCheck('Kudos (post-click)');
    }
  }, 2500);
}


    function addWorkToLocalList(id) {
      const LIST_KEY = 'kudos_history_list';
      const set = new Set(JSON.parse(localStorage.getItem(LIST_KEY) || '[]'));
      const before = set.size;
      set.add(String(id));
      if (set.size !== before) {
        localStorage.setItem(LIST_KEY, JSON.stringify(Array.from(set)));
        return true;
      }
      return false;
    }

    function checkAndSaveKudosOnce() {
      const kudosContainer = document.getElementById('kudos');
      if (!kudosContainer) return false;
      const found = userPresentInKudos(kudosContainer, username);
      if (found) {
        const added = addWorkToLocalList(workId);
        if (added) {
          console.log(`✅ [Kudos] Work ${workId} added to your kudosed list.`);
          // capture exactly when it becomes kudosed
          captureMetadataIntoCache();
        } else {
          console.log(`ℹ️ [Kudos] Work ${workId} already recorded.`);
        }
        return true;
      }
      return false;
    }

    function expandAndCheck(label = 'Kudos') {
      if (cancelled) { console.log('⏹ [Kudos] Search stopped.'); return; }
      if (checkAndSaveKudosOnce()) return; // live DOM check
      if (cancelled) return;

      const moreLink = document.getElementById('kudos_more_link');
      if (moreLink) {
        console.log(`🔎 [${label}] Loading “more kudos”…`);
        moreLink.click();
        setTimeout(() => expandAndCheck(label), 1800);
      } else {
        console.log('✖️ [Kudos] All users loaded; your name was not found.');
      }
    }

    // ── Add UI to the work’s action bar
    const topActionBar = document.querySelector('ul.work.navigation.actions');
    if (topActionBar) {
      if (!document.getElementById('enable-kudos-check') && !document.getElementById('kudos-check-now')) {
        const li = document.createElement('li');
        li.style.cssText = 'margin:0.643em 0; padding-left:0.25em; display:inline;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'enable-kudos-check';
        const savedSetting = localStorage.getItem('kudos_check_enabled');
        checkbox.checked = savedSetting !== 'false'; // default ON

        const label = document.createElement('label');
        label.htmlFor = 'enable-kudos-check';
        label.textContent = ' Check kudos';
        label.style.marginLeft = '0.4em';

        const btnNow = document.createElement('button');
        btnNow.type = 'button';
        btnNow.id = 'kudos-check-now';
        btnNow.textContent = 'Check now';
        btnNow.title = 'Force a kudos scan now';
        btnNow.style.cssText = 'margin-left:0.6em; padding:2px 6px; font-size:12px;';

        btnNow.addEventListener('click', onNowClick);
        checkbox.addEventListener('change', onCheckboxChange);

        __ui.li = li; __ui.checkbox = checkbox; __ui.btnNow = btnNow;

        li.appendChild(checkbox);
        li.appendChild(label);
        li.appendChild(btnNow);
        topActionBar.insertBefore(li, topActionBar.firstChild);

        // Autorun (weekly-gated). Manual & post-click are NOT gated.
        if (checkbox.checked) {
          cancelled = false;
          if (kudosAutoCheckDue()) {
            console.log('▶️ [Kudos] Auto-check due now (weekly gate).');
            markKudosAutoCheckedToday();
            expandAndCheck('Kudos (auto)');
          } else {
            console.log('⏱ [Kudos] Skipping auto-check (checked within a week).');
          }
        } else {
          cancelled = true;
        }
      }
    } else {
      console.warn('⚠️ [Kudos] Primary action bar not found; UI not added.');
    }

    // Cache on open **only** if already kudosed (or the page already shows your name)
const LIST_KEY = 'kudos_history_list';
const alreadyKudosed = (JSON.parse(localStorage.getItem(LIST_KEY) || '[]') || [])
  .includes(String(workId));

if (alreadyKudosed || userPresentInKudos(document.getElementById('kudos'), username)) {
  captureMetadataIntoCache();
}
    const kudosBtn = document.getElementById('kudo_submit');
    if (kudosBtn) {
      kudosBtn.addEventListener('click', onKudosBtnClick);
      __ui.kudosBtn = kudosBtn;
    }

    // Disposer (called by AO3H toggle)
    return () => {
      try { cancelled = true; } catch {}
      try {
        if (__ui.btnNow) __ui.btnNow.removeEventListener('click', onNowClick);
        if (__ui.checkbox) __ui.checkbox.removeEventListener('change', onCheckboxChange);
        if (__ui.kudosBtn) __ui.kudosBtn.removeEventListener('click', onKudosBtnClick);
      } catch {}
      try { if (__ui.li && __ui.li.parentNode) __ui.li.parentNode.removeChild(__ui.li); } catch {}
      __ui.li = __ui.checkbox = __ui.btnNow = __ui.kudosBtn = null;
    };
  }

  /* ────────────────────────────────────────────────────────────────────
     AO3H MODULE WIRE-UP (puts “Check kudos” toggle in AO3 Helper menu)
     NOTE: No nav link is registered here; header link handled below.
  ──────────────────────────────────────────────────────────────────── */
  (function wireCheckForKudosModule() {
    const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    function tryRegister() {
      if (!W.AO3H || !W.AO3H.modules) return false;

      // prevent double registration
      if (W.AO3H.modules.all && W.AO3H.modules.all().some(m => m.key === 'CheckForKudos')) {
        return true;
      }

      W.AO3H.modules.register(
        'CheckForKudos',
        { title: 'Check kudos', enabledByDefault: true },
        () => makeWorkPageScanner() // returns disposer
      );
      return true;
    }

    if (tryRegister()) return;
    const t = setInterval(() => { if (tryRegister()) clearInterval(t); }, 200);
  })();

})();


/* =======================================================================
   ALWAYS-ON KUDOS NAV LINK (header nav only; no AO3H menu entry)
   ======================================================================= */
(function kudosNavLink() {
  'use strict';

  // Local shim; never depends on a global getSignedInUsername symbol
  function getUserSafe() {
    try {
      if (typeof window.__ao3hGetUser === 'function') {
        const u = window.__ao3hGetUser();
        if (u) return u;
      }
    } catch {}
    // DOM fallback
    const href =
      document.querySelector('li.dropdown > a[href^="/users/"]')?.getAttribute('href') ||
      document.querySelector('#greeting .user a[href^="/users/"]')?.getAttribute('href') ||
      document.querySelector('#header a[href^="/users/"]')?.getAttribute('href') || '';
    const m = href.match(/^\/users\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Optional: expose for other modules if none provided yet
  if (typeof window.__ao3hGetUser !== 'function') window.__ao3hGetUser = getUserSafe;

  function injectKudosNavCSS() {
    if (document.getElementById('ao3h-kudos-nav-css')) return;
    const s = document.createElement('style');
    s.id = 'ao3h-kudos-nav-css';
    s.textContent = `
      li.ao3h-kudos-link{margin:0!important}
      ul.primary.navigation.actions>li.ao3h-kudos-link>a,
      ul.primary.navigation>li.ao3h-kudos-link>a,
      .primary.navigation>li.ao3h-kudos-link>a,
      #header .navigation ul>li.ao3h-kudos-link>a{
        display:inline-block;text-decoration:none;border-radius:10px;
        padding:.55em .9em;transition:background .2s ease,transform .12s ease,box-shadow .18s ease;
      }
      ul.primary.navigation.actions>li.ao3h-kudos-link>a:hover,
      ul.primary.navigation>li.ao3h-kudos-link>a:hover,
      .primary.navigation>li.ao3h-kudos-link>a:hover,
      #header .navigation ul>li.ao3h-kudos-link>a:hover,
      ul.primary.navigation.actions>li.ao3h-kudos-link>a:focus-visible,
      ul.primary.navigation>li.ao3h-kudos-link>a:focus-visible,
      .primary.navigation>li.ao3h-kudos-link>a:focus-visible,
      #header .navigation ul>li.ao3h-kudos-link>a:focus-visible{
        background:rgba(255,255,255,.18);transform:translateY(-1px);outline:none;
        box-shadow:0 6px 18px rgba(2,6,23,.10);
      }
      @media (prefers-color-scheme: dark){
        ul.primary.navigation.actions>li.ao3h-kudos-link>a:hover,
        ul.primary.navigation>li.ao3h-kudos-link>a:hover,
        .primary.navigation>li.ao3h-kudos-link>a:hover,
        #header .navigation ul>li.ao3h-kudos-link>a:hover,
        ul.primary.navigation.actions>li.ao3h-kudos-link>a:focus-visible,
        ul.primary.navigation>li.ao3h-kudos-link>a:focus-visible,
        .primary.navigation>li.ao3h-kudos-link>a:focus-visible,
        #header .navigation ul>li.ao3h-kudos-link>a:focus-visible{
          background:rgba(255,255,255,.08)
        }
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

 function findPrimaryNavs() {
  const selectors = [
    '#header ul.primary.navigation',
    '#header nav ul.primary.navigation',
    '#header ul.primary',
    '#header nav ul',
    'header#header ul.primary.navigation',
    'ul.primary.navigation'
  ];
  const set = new Set();
  for (const s of selectors) {
    document.querySelectorAll(s).forEach(el => {
      if (!el || el.tagName.toUpperCase() !== 'UL') return;
      // Exclude AO3 Helper’s dropdown/menu
      if (el.closest('#ao3h-helper, #ao3h-menu, .ao3h-menu, .ao3h')) return;
      set.add(el);
    });
  }
  return Array.from(set);
}


  function findPlacementAfter(nav) {
    const q = (sel) => nav.querySelector(`:scope > li > a${sel}`);
    const history = q('[href*="/readings"]');
    if (history) return history.parentElement;
    const bookmarks = q('[href*="/bookmarks"]');
    if (bookmarks) return bookmarks.parentElement;
    return null;
  }

  function findSearchBlock(nav) {
    return nav.querySelector(':scope > li.search, :scope > li.search-works-link');
  }

  function buildKudosLi(username) {
    const li = document.createElement('li');
    li.className = 'ao3h-kudos-link';
    const a = document.createElement('a');
    a.href = `/users/${encodeURIComponent(username)}/kudos-history`;
    a.title = 'Kudos History';
    a.textContent = 'Kudos History';
    if (/\/users\/[^/]+\/kudos-history(?:\/?|$)/.test(location.pathname)) a.setAttribute('aria-current','page');
    li.appendChild(a);
    return li;
  }

  function ensureKudosInNav(nav, username) {
    if (!nav) return false;
    if (nav.querySelector(':scope>li.ao3h-kudos-link')) return true;
    if (nav.querySelector(':scope > li > a[href*="/kudos-history"]')) return true;
    const li = buildKudosLi(username);
    const after = findPlacementAfter(nav);
    const before = findSearchBlock(nav);
    if (after && after.parentElement === nav) after.insertAdjacentElement('afterend', li);
    else if (before && before.parentElement === nav) nav.insertBefore(li, before);
    else nav.appendChild(li);
    return true;
  }

  function ensureKudosNavLink() {
    const username = getUserSafe();
    if (!username) return false;
    injectKudosNavCSS();
    const navs = findPrimaryNavs();
    if (!navs.length) return false;
    let ok = false;
    for (const nav of navs) ok = ensureKudosInNav(nav, username) || ok;
    return ok;
  }

  function start() {
    let tries = 0;
    const maxTries = 20;
    const timer = setInterval(() => {
      tries++;
      if (ensureKudosNavLink() || tries >= maxTries) clearInterval(timer);
    }, 200);

    const root = document.getElementById('header') || document.body || document.documentElement;
    if (root) {
      const mo = new MutationObserver(() => {
        const navs = findPrimaryNavs();
        if (navs.length && !navs.every(n => n.querySelector(':scope>li.ao3h-kudos-link'))) {
          ensureKudosNavLink();
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      window.__ao3hKudosNavObserver = mo;
    }

    window.addEventListener('popstate', ensureKudosNavLink, { passive: true });
    window.addEventListener('hashchange', ensureKudosNavLink, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

    /* ── Weekly cache refresh gate ── */
  const CACHE_REFRESH_INTERVAL_DAYS = 7;
  const KUDOS_LAST_CACHE_REFRESH_DAY = 'kudos_last_cache_refresh_day';
  const MS_PER_DAY = 24 * 60 * 60 * 1000; // CHANGED: constant for clarity

  function cacheRefreshDue() {
    const last = localStorage.getItem(KUDOS_LAST_CACHE_REFRESH_DAY) || '';
    if (!last) return true;
    const then = new Date(last);
    if (Number.isNaN(then.getTime())) return true; // CHANGED: handle bad/legacy value
    const now  = new Date(todayLocal());
    const diffDays = Math.floor((now - then) / MS_PER_DAY); // CHANGED: use constant
    return diffDays >= CACHE_REFRESH_INTERVAL_DAYS;
  }

  function markCacheRefreshedToday() {
    localStorage.setItem(KUDOS_LAST_CACHE_REFRESH_DAY, todayLocal());
  }

  /* ─────────── Compact, quota-safe cache (LRU + compaction) ─────────── */
  const CACHE_KEY = 'kudos_fic_cache';
  const CACHE_INDEX_KEY = 'kudos_fic_cache_index'; // id -> lastUpdated ms (for LRU)

  function readCache()  { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
  function readIndex()  { try { return JSON.parse(localStorage.getItem(CACHE_INDEX_KEY) || '{}'); } catch { return {}; } }
  function writeCacheUnsafe(cache, index) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  }

  // Keep tags compact in cache
  function compactTags(t) {
    if (!t || typeof t !== 'object') return null;
    const cap = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : [];
    return {
      rating:        cap(t.rating, 2),
      warnings:      cap(t.warnings, 6),
      categories:    cap(t.categories, 6),
      relationships: cap(t.relationships, 12),
      characters:    cap(t.characters, 12),
      freeforms:     cap(t.freeforms, 20),
    };
  }

  function makeCompactEntry(e, id) {
    const authorPlain =
      asText(e.authorText ?? e.author ?? e.authorHTML ?? '') || 'orphan_account';

    return {
      title: asText(e.title) || `Fic #${id}`,
      authorText: authorPlain,
      authorHTML: e.authorHTML ?? null,
      summaryHTML: e.summaryHTML ?? null,
      summary: asText(e.summary ?? e.summaryHTML ?? '').slice(0, 350) || 'No summary.',
      fandom: e.fandom || 'unavailable',
      tags: compactTags(e.tags),
      locked: !!e.locked,
      v: 6 // schema includes tags + summaryHTML
    };
  }

  function pruneLRU(index, cache, n = 50) {
    const items = Object.entries(index).sort((a,b) => a[1] - b[1]); // oldest first
    const toDrop = items.slice(0, n);
    for (const [id] of toDrop) { delete cache[id]; delete index[id]; }
    return toDrop.length;
  }

  function setCacheSafe(workId, entryRaw) {
    const id = String(workId);
    const cache = readCache();
    const index = readIndex();
    const entry = makeCompactEntry(entryRaw || {}, id); // normalize
    cache[id] = entry;
    index[id] = Date.now();

    try { writeCacheUnsafe(cache, index); return cache; }
    catch { pruneLRU(index, cache, 60); }
    try { writeCacheUnsafe(cache, index); return cache; }
    catch { pruneLRU(index, cache, 120); writeCacheUnsafe(cache, index); return cache; }
  }

  // Repair old authorText issues
  function migrateCachedAuthorsIfNeeded() {
    const cache = readCache();
    const index = readIndex();
    let fixed = 0;

    for (const [id, entry] of Object.entries(cache)) {
      if (!entry || typeof entry !== 'object') continue;

      const needsFix =
        (entry.v ?? 0) < 3 ||
        (String(entry.authorText || '').trim().toLowerCase() === 'orphan_account' && entry.authorHTML);

      if (needsFix) {
        const repairedText = asText(entry.authorText || entry.authorHTML || '') || 'orphan_account';
        cache[id] = { ...entry, authorText: repairedText, v: 3 };
        index[id] = Date.now();
        fixed++;
      }
    }

    if (fixed) {
      try { writeCacheUnsafe(cache, index); }
      catch { pruneLRU(index, cache, 60); writeCacheUnsafe(cache, index); }
      console.log(`🔧 [Kudos] Repaired ${fixed} cached author entr${fixed===1?'y':'ies'}.`);
    }
  }

  // Purge truly broken pre-v3 entries
  function purgeBadAuthorEntriesOnce() {
    const FLAG = 'kudos_purged_bad_authors_v1';
    if (localStorage.getItem(FLAG) === '1') return;

    const cache = readCache();
    const index = readIndex();
    let purged = 0;

    for (const [id, e] of Object.entries(cache)) {
      const v = (e && e.v) || 0;
      const a = String((e && e.authorText) || '').trim().toLowerCase();
      if (v < 3 && a === 'orphan_account' && !e.authorHTML) {
        delete cache[id]; delete index[id]; purged++;
      }
    }

    try { writeCacheUnsafe(cache, index); } catch {}
    localStorage.setItem(FLAG, '1');
    if (purged) console.log(`🧹 [Kudos] Purged ${purged} bad author entr${purged===1?'y':'ies'}.`);
  }

  function extractAuthorsHTML(root) {
    const nodes = root.querySelectorAll(
      'a[rel="author"], a[rel=author], h3.byline a[href^="/users/"], a[href^="/users/"].login'
    );
    if (!nodes || nodes.length === 0) return { authorText: 'orphan_account', authorHTML: null };
    const html = Array.from(nodes).map(n => n.outerHTML).join(', ');
    const text = Array.from(nodes).map(n => n.textContent.trim()).filter(Boolean).join(', ') || 'orphan_account';
    return { authorText: text, authorHTML: html };
  }

  // Extract full tag set for caching
  function extractMetaTags(root) {
    const texts = (nodes) => Array.from(nodes).map(n => (n.textContent || '').trim()).filter(Boolean);
    const pick  = (sel)   => texts(root.querySelectorAll(sel));

    const out = {
      rating:        [],
      warnings:      [],
      categories:    [],
      relationships: [],
      characters:    [],
      freeforms:     [],
    };

    // AO3 default <dl>
    out.rating        = pick('dd.rating.tags a.tag, dd.rating a.tag');
    out.warnings      = pick('dd.warnings.tags a.tag, dd.warnings a.tag, dd.warning.tags a.tag, dd.warning a.tag');
    out.categories    = pick('dd.categories.tags a.tag, dd.categories a.tag, dd.category.tags a.tag, dd.category a.tag');
    out.relationships = pick('dd.relationships.tags a.tag, dd.relationships a.tag, dd.relationship.tags a.tag, dd.relationship a.tag');
    out.characters    = pick('dd.characters.tags a.tag, dd.characters a.tag, dd.character.tags a.tag, dd.character a.tag');
    out.freeforms     = pick('dd.freeforms.tags a.tag, dd.freeforms a.tag, dd.freeform.tags a.tag, dd.freeform a.tag');

    // AO3 Helper <ul class="tags …"> fallback
    const ul = root.querySelector('ul.tags');
    if (ul) {
      const takeUL = (cls) => texts(ul.querySelectorAll(
        `li.${cls} a.tag, li.${cls} .ao3h-tag-txt, li.${cls} a[href^="/tags/"]`
      ));
      if (!(out.rating?.length))        out.rating        = takeUL('rating');
      if (!(out.warnings?.length))      out.warnings      = takeUL('warnings');
      if (!(out.categories?.length))    out.categories    = takeUL('categories');
      if (!(out.relationships?.length)) out.relationships = takeUL('relationships');
      if (!(out.characters?.length))    out.characters    = takeUL('characters');
      if (!(out.freeforms?.length))     out.freeforms     = takeUL('freeforms');
    }

    return out;
  }

   /* ─────────── Staleness rules (weekly-gated) ─────────── */
  function isStaleEntry(entry) {
    if (!entry || typeof entry !== 'object') return true;
    if ((entry.v ?? 0) < 6) return true;

    const authorTextLc = String(entry.authorText || entry.author || '').trim().toLowerCase();
    if (authorTextLc === 'orphan_account' && !entry.locked) return true;

    if (!entry.summaryHTML) return true;
    if (!entry.tags) return true;

    const title   = String(entry.title || '').trim();
    const summary = String(entry.summary || '').trim().toLowerCase();
    const badTitle = !title || /^fic #\d+/i.test(title) || /deleted|locked/i.test(title);
    const noAuthor = !authorTextLc || authorTextLc === 'orphan_account';
    const emptySum = !summary || /no summary|unavailable/.test(summary);
    const signals = (badTitle?1:0) + (noAuthor?1:0) + (emptySum?1:0);
    return signals >= 2;
  }
  function isStaleNow(entry) {
    if (!cacheRefreshDue()) return false;
    return isStaleEntry(entry);
  }

  /* ─────────── Manual + weekly export ─────────── */
  window.exportKudosNow = function(filename) {
    const LIST_KEY = 'kudos_history_list';
    const list = localStorage.getItem(LIST_KEY) || '[]';
    const name = (filename && String(filename).trim()) || `ao3_kudos_${todayLocal()}.json`;
    saveViaLink(name, new Blob([list], { type: 'application/json' }));
    console.log('✅ [KudosExport] Manual export:', name);
  };

  function exportKudosListIfDue() {
    const LIST_KEY = 'kudos_history_list';
    const LAST_MS  = 'kudos_last_export_ms';
    const LAST_DAY = 'kudos_last_export_day';
    const ONE_WEEK = 7 * MS_PER_DAY; // CHANGED: reuse day constant

    /* noop read to ensure key exists (kept for compatibility) */
    localStorage.getItem(LIST_KEY) || '[]';

    const lastMs  = Number(localStorage.getItem(LAST_MS) || 0);
    const lastDay = localStorage.getItem(LAST_DAY) || '';
    const now = Date.now();
    const today = todayLocal();

    if (lastDay === today) return;
    if ((now - lastMs) <= ONE_WEEK) return;

    const filename = `ao3_kudos_${today}.json`;
    window.exportKudosNow(filename);
    localStorage.setItem(LAST_MS, String(now));
    localStorage.setItem(LAST_DAY, today);
    console.log('✅ [KudosExport] Auto-exported:', filename);
  }

/* =======================================================================
   KUDOS LOADING OVERLAY (mount ASAP on /kudos-history)
   ======================================================================= */
(function kudosLoadingOverlay(){
  'use strict';
  if (!/\/users\/[^/]+\/kudos-history(?:\/?|$)/.test(location.pathname)) return;

  // CSS (idempotent)
  if (!document.getElementById('ao3h-wait-css')) {
    const s = document.createElement('style');
    s.id = 'ao3h-wait-css';
    s.textContent = `
      #ao3h-wait{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;
        background:color-mix(in srgb, #000 35%, transparent);backdrop-filter:saturate(1.2) blur(2px)}
      #ao3h-wait .card{min-width:260px;max-width:420px;padding:16px 18px;border-radius:12px;
        background:#fff;border:1px solid rgba(0,0,0,.12);box-shadow:0 10px 28px rgba(0,0,0,.18);
        color:#111;text-align:center;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
      @media (prefers-color-scheme:dark){
        #ao3h-wait .card{background:#151518;border-color:#26262b;color:#f3f3f3}
      }
      #ao3h-wait .spin{width:20px;height:20px;border-radius:50%;
        border:3px solid rgba(0,0,0,.15);border-top-color:#8f0a0a; margin:6px auto 10px; animation:awspin 1s linear infinite}
      @keyframes awspin{to{transform:rotate(360deg)}}
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // Overlay (idempotent)
  if (!document.getElementById('ao3h-wait')) {
    const d = document.createElement('div');
    d.id = 'ao3h-wait';
    d.innerHTML = `
      <div class="card" role="status" aria-live="polite">
        <div class="spin" aria-hidden="true"></div>
        <div><strong>AO3 Helper</strong></div>
        <div>Loading your Kudos History…</div>
      </div>
    `;
    (document.body || document.documentElement).appendChild(d);

    // Safety: after 20s, let user dismiss if the site hangs
    setTimeout(() => {
      const el = document.getElementById('ao3h-wait');
      if (el) {
        el.title = 'Click to dismiss';
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => el.remove(), { once: true });
      }
    }, 20000);
  }
})();

  /* ─────────── Route: Kudos page only ─────────── */
  (function kudosPageMain() {
  'use strict';
  const isKudosPage = /\/users\/[^/]+\/kudos-history(?:\/?|$)/.test(window.location.pathname);
  if (!isKudosPage) return;

  // RENDER-ONLY switches (which tag groups appear in the red inline line)
  const RENDER_TAGS = {
    rating:        false,
    warnings:      false,
    categories:    false,
    relationships: true,
    characters:    false,
    freeforms:     true,
  };
  function visibleInlineTags(tags) {
    if (!tags) return [];
    const parts = [];
    if (RENDER_TAGS.rating)        parts.push(...(tags.rating || []));
    if (RENDER_TAGS.warnings)      parts.push(...(tags.warnings || []));
    if (RENDER_TAGS.categories)    parts.push(...(tags.categories || []));
    if (RENDER_TAGS.relationships) parts.push(...(tags.relationships || []));
    if (RENDER_TAGS.characters)    parts.push(...(tags.characters || []));
    if (RENDER_TAGS.freeforms)     parts.push(...(tags.freeforms || []));
    return parts.slice(0, 20);
  }

  /* ── Inject Kudos page CSS (variables + layout) — idempotent ── */
  (function injectKudosCSS(){
    if (document.getElementById('kudos-page-css')) return;
    const s = document.createElement('style');
    s.id = 'kudos-page-css';
    s.textContent = `
      :root {
        --bg: #faf9f8; --panel: #ffffff; --ink: #1f1f1f; --ink-2: #4b4b4b; --ink-3: #6e6e6e;
        --line: #e7e4e0; --brand: #8f0a0a; --brand-2: #7a0000; --brand-3: #b21c1c; --rose: #f7e4e4;
        --focus: 2px solid color-mix(in srgb, var(--brand), #ffffff 35%);
        --radius-sm: 8px; --radius-md: 12px;
        --shadow-1: 0 1px 3px rgba(0,0,0,.10); --shadow-2: 0 6px 18px rgba(0,0,0,.12);
        --elev: cubic-bezier(.2,.8,.2,1);
        /* Typography controls (editable) */
        --fs-base: 16px; --fs-h2: 28px; --fs-title: 16px; --fs-byline: 14px;
        --fs-inline-tags: 13px; --fs-summary: 14px; --fs-meta: 12.5px;
        --fs-rail-title: 11px; --fs-pill: 14px; --fs-button: 14px; --fs-status: 13px;
        --h2-weight: 800; --h2-style: normal; --h2-align: left;
        --title-weight: 800; --title-style: normal; --title-align: left;
        --byline-weight: 400; --byline-style: italic; --byline-align: left;
        --tags-weight: 500; --tags-style: normal; --tags-align: left;
        --summary-weight: 400; --summary-style: normal; --summary-align: left;
        --meta-weight: 400; --meta-style: normal; --meta-align: left;
        --railtitle-weight: 700; --railtitle-style: normal; --railtitle-align: left;
        --pill-weight: 600; --pill-style: normal; --pill-align: center;
        --btn-weight: 700; --btn-style: normal; --btn-align: center;
        --status-weight: 400; --status-style: normal; --status-align: left;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0f0f11; --panel: #151518; --ink: #f3f3f3; --ink-2: #c8c8c8; --ink-3: #a2a2a2; --line: #26262b;
          --brand: #ff5a5a; --brand-2: #ff4040; --brand-3: #ff6f6f; --rose: rgba(255,90,90,.16);
        }
        img { opacity: .95 }
      }

      #kudos-app .ao3h-root { display: none !important; }
      body { background: var(--bg); color: var(--ink);
        font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; }
      #kudos-app { font-size: var(--fs-base); }

      /* Headings / byline */
      #kudos-app h2.heading { font-size: var(--fs-h2)!important; font-weight: var(--h2-weight); font-style: var(--h2-style); text-align: var(--h2-align); }
      #kudos-app h4.heading, #kudos-app a.title { font-size: var(--fs-title)!important; font-weight: var(--title-weight); font-style: var(--title-style); text-align: var(--title-align); }
      #kudos-app .byline { font-size: var(--fs-byline)!important; font-weight: var(--byline-weight); font-style: var(--byline-style); text-align: var(--byline-align); }
      #kudos-app .byline a { color: var(--ink-2); text-decoration: none; }
      #kudos-app .byline a:hover { color: var(--brand); text-decoration: underline; }

      /* Inline tags (red line under title) */
      #kudos-app .inline-tags {
        font-size: var(--fs-inline-tags)!important; font-weight: var(--tags-weight); font-style: var(--tags-style); text-align: var(--tags-align);
        color: var(--brand); line-height: 1.45; margin-top: 6px; opacity: .95; padding: 10px 10px 20px 10px; word-break: break-word;
      }
      #kudos-app .inline-tags a.tag, #kudos-app .inline-tags .ao3h-tag-txt, #kudos-app .inline-tags .tag {
        text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px;
      }

      #kudos-app blockquote.userstuff.summary { font-size: var(--fs-summary)!important; font-weight: var(--summary-weight); font-style: var(--summary-style); text-align: var(--summary-align); }
      #kudos-app p.meta, #kudos-app p.meta-fandom { font-size: var(--fs-meta)!important; font-weight: var(--meta-weight); font-style: var(--meta-style); text-align: var(--meta-align); }

      #kudos-app .rail-title { font-size: var(--fs-rail-title)!important; font-weight: var(--railtitle-weight); font-style: var(--railtitle-style); text-align: var(--railtitle-align); }
      #kudos-app .fandom-pill { font-size: var(--fs-pill)!important; font-weight: var(--pill-weight); font-style: var(--pill-style); text-align: var(--pill-align); }
      #kudos-app .kbtn { font-size: var(--fs-button)!important; font-weight: var(--btn-weight); font-style: var(--btn-style); text-align: var(--btn-align); }
      #kudos-app #kudos-statusbar, #kudos-app .kudos-count { font-size: var(--fs-status)!important; font-weight: var(--status-weight); font-style: var(--status-style); text-align: var(--status-align); }

      /* Layout */
      #kudos-app {
        min-height: 100vh; display: grid;
        grid-template-columns: clamp(200px, 20vw, 260px) minmax(0, clamp(600px, 60vw, 880px)) clamp(200px, 20vw, 260px);
        gap: 18px; padding: 28px 18px; align-items: start; box-sizing: border-box;
      }
      @media (max-width: 1500px) { #kudos-app { grid-template-columns: 1fr minmax(0, clamp(600px, 65vw, 880px)); } #kudos-right { display:none; } }
      @media (max-width: 980px) { #kudos-app { grid-template-columns: minmax(0, 1fr); padding: 18px 12px; } #kudos-left { order: 2; } }

      /* Left rail */
      #kudos-left { position: static; display: grid; gap: 12px; align-self: start; }
      #kudos-left > .rail-card { position: sticky; margin-top: 94px; margin-left: 50px; width:150px; }
      .rail-card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-1); padding: 14px; }
      .rail-title { margin: 0 0 10px; font-weight: 700; color: var(--ink); letter-spacing: .2px; }
      #fandom-rail { display: grid; gap: 8px; }
      .fandom-pill { display: inline-flex; align-items: center; justify-content: center; padding: 8px 10px; border-radius: var(--radius-sm);
        border: 1px solid color-mix(in srgb, var(--brand) 55%, var(--line)); background: var(--panel); color: var(--brand); font-weight: 600; cursor: pointer;
        transition: background .18s var(--elev), color .18s var(--elev), border-color .18s var(--elev), transform .06s ease, box-shadow .18s var(--elev); }
      .fandom-pill:hover { background: var(--rose); transform: translateY(-1px); box-shadow: var(--shadow-1); }
      .fandom-pill[aria-pressed="true"] { background: var(--brand); color:#fff; border-color: var(--brand-2); }

      /* Right-floating Unavailable pill */
      .floating-unavailable { position: sticky; bottom: 16px; left: 1400px; font-size: 10px; z-index: 99999; }
      .floating-unavailable.fandom-pill[aria-pressed="true"] { background: var(--brand) !important; color: #fff !important; border-color: var(--brand-2) !important; }

      /* Center column */
      #kudos-center { display: grid; gap: 16px; }
      .page-head { display: flex; align-items: center; height: 15px; justify-content: space-between; gap: 12px; }
      .title-wrap { display: flex; align-items: center; gap: 10px; }
      h2.heading { all: unset; font-size: clamp(20px, 3vw, 28px); color: var(--brand); font-weight: 800; letter-spacing: .2px; }

      /* Toolbar buttons */
      .kudos-toolbar { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .kbtn { --b: var(--brand); appearance: none; padding: 8px 12px; border-radius: var(--radius-sm);
        border: 1px solid var(--b); background: var(--b); color: #fff; font-weight: 700; margin-top: 50px; cursor: pointer;
        transition: background .18s var(--elev), box-shadow .18s var(--elev), transform .06s ease, color .18s var(--elev), border-color .18s var(--elev); }
      .kbtn:hover { box-shadow: var(--shadow-1); transform: translateY(-1px); }
      .kbtn:active { transform: translateY(0); box-shadow: none; }
      .kbtn:focus-visible { outline: var(--focus); outline-offset: 2px; }
      .kbtn.ghost { background: transparent; color: var(--brand); }
      .kbtn.ghost:hover { background: var(--rose); }

      /* Status bar */
      #kudos-statusbar { display: inline-flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--line);
        padding: 6px 10px; border-radius: var(--radius-sm); box-shadow: var(--shadow-1); }
      .kudos-spinner { width: 14px; height: 14px; border-radius: 50%;
        border: 2.5px solid color-mix(in srgb, var(--ink-3) 40%, #fff); border-top-color: var(--brand); animation: kspin 1s linear infinite; flex: 0 0 auto; }
      @keyframes kspin { to { transform: rotate(360deg); } }
      .kudos-count { color: var(--ink-2); letter-spacing: .2px; }

      /* List panel + blurbs */
      .ao3-box { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-1); padding: 16px; margin-top: 25px; width: 1050px; }
      .ao3-box img, .ao3-box video, .ao3-box iframe { max-width: 100%; height: auto; }
      .ao3-box blockquote, .ao3-box .userstuff, .ao3-box p { overflow-wrap: anywhere; word-break: break-word; }
      .ao3-box pre, .ao3-box code { white-space: pre-wrap; word-break: break-word; }

      #kudos-right { position: static; display: grid; gap: 12px; }
      #kudos-right > * { position: sticky; top: 16px; }

      .work.blurb.group { border: 1px solid var(--line); border-radius: var(--radius-md); padding: 14px; margin: 10px 10px 30px 10px; background: var(--panel);
        box-shadow: var(--shadow-1); transition: box-shadow .18s var(--elev), transform .08s ease; }
      .work.blurb.group:hover { box-shadow: var(--shadow-2); transform: translateY(-1px); }
      h4.heading { all: unset; display: block; color: var(--brand); font-weight: 800; font-size: 16px; line-height: 1.2; margin-bottom: 2px; }
      a.title { color: var(--brand); text-decoration: none; }
      a.title:hover { text-decoration: underline; }

      .badge.lock { display: inline-block; margin-left: .5em; font-size: 11px; padding: 2px 6px; border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--brand) 50%, var(--line));
        color: color-mix(in srgb, var(--brand) 85%, #fff);
        background: color-mix(in srgb, var(--brand) 12%, var(--panel));
      }

      .stack { display: grid; gap: 10px; }
      .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .spacer { flex: 1 1 auto; }
    `;
    (document.head || document.documentElement).appendChild(s);
  })();

  /* ── Build Kudos shell in body (no document.write/close) ── */
  (function renderKudosShell() {
    const savedList = JSON.parse(localStorage.getItem('kudos_history_list') || '[]');
    document.title = 'Kudos';
    document.body.innerHTML = '';

    const app = document.createElement('div');
    app.id = 'kudos-app';
    app.innerHTML = `
      <aside id="kudos-left">
        <div class="rail-card">
          <h3 class="rail-title">Filter by Fandom</h3>
          <div id="fandom-rail" aria-label="Fandom Filters"></div>
        </div>
      </aside>

      <main id="kudos-center" role="main">
        <div class="page-head">
          <div class="title-wrap">
            <h2 class="heading">Kudos</h2>
            <div id="kudos-statusbar">
              <div class="kudos-spinner"></div>
              <span class="kudos-count">fics count : 0 / 0</span>
            </div>
          </div>
          <div class="kudos-toolbar" id="kudos-toolbar"></div>
        </div>

        <section class="ao3-box">
          <div id="kudos-list">
            ${ savedList.length === 0 ? '<p>No fics saved.</p>' : '<p>Loading works...</p>' }
          </div>
        </section>
      </main>

      <aside id="kudos-right"></aside>
    `;
    document.body.appendChild(app);

    // Floating “Unavailable” pill
    const pill = document.createElement('button');
    pill.id = 'filter-unavailable';
    pill.type = 'button';
    pill.className = 'fandom-pill floating-unavailable';
    pill.title = 'Hide unavailable fics';
    pill.setAttribute('aria-pressed','false');
    pill.textContent = 'Unavailable';
    document.body.appendChild(pill);
  })();

    /* ── Inline-tags wrapper + observer ── */
  (function initInlineTagsWrapper(){
    function wrapInlineTagsIn(root) {
      root.querySelectorAll('.inline-tags').forEach(node => {
        if (node.dataset.tagsWrapped === '1') return;
        if (node.querySelector('.tag, a')) { node.dataset.tagsWrapped = '1'; return; }
        const raw = (node.textContent || '').trim();
        if (!raw) { node.dataset.tagsWrapped = '1'; return; }
        const parts = raw.split(/\s*,\s*/);
        const frag = document.createDocumentFragment();
        parts.forEach((t, i) => {
          const span = document.createElement('span');
          span.className = 'tag';
          span.textContent = t;
          frag.appendChild(span);
          if (i < parts.length - 1) frag.appendChild(document.createTextNode(', '));
        });
        node.replaceChildren(frag);
        node.dataset.tagsWrapped = '1';
      });
    }

    const mount = document.getElementById('kudos-app') || document;
    wrapInlineTagsIn(mount);

    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type !== 'childList' || !m.addedNodes.length) continue;
        m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches('.inline-tags')) {
            wrapInlineTagsIn(n.parentNode || n);
          } else {
            wrapInlineTagsIn(n);
          }
        });
      }
    });
    obs.observe(document.getElementById('kudos-list') || mount, { childList: true, subtree: true });
    window.wrapInlineTagsNow = () => wrapInlineTagsIn(mount);
  })();

  /* ─────────── Typography Panel ─────────── */
  (function typographyModule(){
    const storeKey = 'kudos_typography_vars';
    const VIS_FLAG = 'kudos_typo_panel_visible';
    const root = document.querySelector('#kudos-app') || document.documentElement;
    let panel = null;

    const VARS = [
      ['Base text size','--fs-base',8,22,1,'16'],
      ['Kudos title size','--fs-h2',8,42,1,'28'],
      ['Fic title size','--fs-title',8,24,1,'16'],
      ['Author size','--fs-byline',8,20,1,'14'],
      ['Tags line size','--fs-inline-tags',8,20,1,'13'],
      ['Summary size','--fs-summary',8,22,1,'14'],
      ['Details size','--fs-meta',8,18,0.5,'12.5'],
      ['Sidebar title size','--fs-rail-title',8,22,1,'11'],
      ['Fandom pills size','--fs-pill',8,18,1,'14'],
      ['Export/Import buttons size','--fs-button',8,18,1,'14'],
      ['Counters size','--fs-status',8,18,1,'13'],
    ];
    const TOGGLES = [
      ['Kudos title: bold','--h2-weight',['800','400']],
      ['Kudos title: italic','--h2-style',['italic','normal']],
      ['Fic title: bold','--title-weight',['800','400']],
      ['Fic title: italic','--title-style',['italic','normal']],
      ['Author: italic','--byline-style',['italic','normal']],
      ['Sidebar title: bold','--railtitle-weight',['700','400']],
      ['Sidebar title: italic','--railtitle-style',['italic','normal']],
      ['Fandom pills: bold','--pill-weight',['700','400']],
      ['Fandom pills: italic','--pill-style',['italic','normal']],
    ];
    const SELECTS = [
      ['Kudos title align','--h2-align',['left','center','right']],
      ['Fic title align','--title-align',['left','center','right']],
      ['Summary align','--summary-align',['left','center','right','justify']],
      ['Details align','--meta-align',['left','center','right']],
      ['Sidebar title align','--railtitle-align',['left','center','right']],
      ['Fandom pills align','--pill-align',['left','center','right']], // aligns the group
    ];

    function loadSaved(){ try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { return {}; } }
    function saveAll(map){ localStorage.setItem(storeKey, JSON.stringify(map)); }

    function applyVar(name, value){
      const s = String(value);
      const isNumeric = /^[\d.]+$/.test(s);
      const needsPx = name.startsWith('--fs-');
      const val = (needsPx && isNumeric) ? `${s}px` : s;
      root.style.setProperty(name, val);

      if (name === '--pill-align') {
        const rail = document.getElementById('fandom-rail');
        if (rail) {
          rail.style.display = rail.style.display || 'grid';
          rail.style.width = rail.style.width || '100%';
          const map = { left: 'flex-start', center: 'center', right: 'flex-end' };
          rail.style.justifyContent = map[s] || 'flex-start';
          rail.style.justifyItems = '';
        }
      }
    }

    (function applySavedStyles(){
      const saved = loadSaved();
      let mutated = false;
      for (const [k, v] of Object.entries(saved)) {
        let val = String(v);
        if (!k.startsWith('--fs-') && /\bpx$/i.test(val)) {
          val = val.replace(/\bpx$/i, ''); saved[k] = val; mutated = true;
        }
        applyVar(k, val);
      }
      if (mutated) saveAll(saved);
    })();

    function createPanel(){
      const saved = loadSaved();
      const wrap = document.createElement('div');
      wrap.id = 'typo-panel';
      wrap.innerHTML = `
        <style>
          #typo-panel{
            position: fixed; z-index: 999999; right: 12px; bottom: 12px;
            background: var(--panel); border:1px solid var(--line);
            border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
            padding: 10px 12px; width: 300px; font: 13px/1.4 system-ui, sans-serif; color: var(--ink);
          }
            input, textarea {
    box-shadow: none;
}

          #typo-panel h3{ margin:0 0 8px; font-size:14px; font-weight:800; color:var(--brand); }
          #typo-panel .row{ display:grid; grid-template-columns: 1fr auto; gap:6px; align-items:center; margin:6px 0; }
          #typo-panel label{ font-size:10px; color:var(--ink-2); }
          #typo-panel input[type="range"]{ width: 90px;}
          #typo-panel .small{ display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;}
          #typo-panel button{ font-size: 10px !important; padding:6px 8px; border-radius:8px; border:1px solid var(--line); background: var(--panel); cursor:pointer; }
          #typo-panel .bar{ display:flex; gap:6px; justify-content:space-between; margin-top:8px;}
        </style>
        <h3>Typography</h3>
        <div id="typo-controls"></div>
        <div class="bar">
          <button id="typo-reset" title="Reset to defaults">Reset</button>
          <button id="typo-close" title="Hide panel">Close</button>
        </div>
      `;

      const ctrlWrap = wrap.querySelector('#typo-controls');

      VARS.forEach(([label, cssVar, min, max, step, def])=>{
        const row = document.createElement('div'); row.className='row';
        const val = (saved[cssVar] ?? def);
        row.innerHTML = `<label>${label}</label>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-var="${cssVar}">
        `;
        ctrlWrap.appendChild(row);
        applyVar(cssVar, val);
      });

      const small = document.createElement('div'); small.className='small';
      TOGGLES.forEach(([label, cssVar, [on, off]])=>{
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = label;
        btn.addEventListener('click', ()=>{
          const computed = getComputedStyle(root).getPropertyValue(cssVar).trim();
          const cur = (saved[cssVar] !== undefined) ? String(saved[cssVar]) : (computed || off);
          const next = (cur === String(on) ? String(off) : String(on));
          saved[cssVar] = next; applyVar(cssVar, next); saveAll(saved);
        });
        if (saved[cssVar] !== undefined) applyVar(cssVar, saved[cssVar]);
        small.appendChild(btn);
      });
      ctrlWrap.appendChild(small);

      SELECTS.forEach(([label, cssVar, options])=>{
        const row = document.createElement('div'); row.className='row';
        const sel = document.createElement('select'); sel.dataset.var=cssVar;
        options.forEach(o=>{ const opt=document.createElement('option'); opt.value=o; opt.textContent=o; sel.appendChild(opt); });
        const init = (saved[cssVar] ?? options[0]);
        sel.value = init; applyVar(cssVar, init);
        sel.addEventListener('change', ()=>{ saved[cssVar]=sel.value; applyVar(cssVar, sel.value); saveAll(saved); });
        row.innerHTML = `<label>${label}</label>`; row.appendChild(sel); ctrlWrap.appendChild(row);
      });

      wrap.querySelectorAll('input[type="range"][data-var]').forEach(inp=>{
        const cssVar = inp.dataset.var; const v = inp.value;
        if (saved[cssVar] === undefined) saved[cssVar] = v;
        applyVar(cssVar, v);
        inp.addEventListener('input', ()=>{ saved[cssVar]=inp.value; applyVar(cssVar, inp.value); saveAll(saved); });
      });

      wrap.querySelector('#typo-reset').addEventListener('click', ()=>{
        const prev = loadSaved();                                // CHANGED: capture current saved vars
        localStorage.removeItem(storeKey);
        Object.keys(prev).forEach(k => root.style.removeProperty(k)); // CHANGED: actually clear those vars
        wrap.remove(); panel = null; openPanel();
      });
      wrap.querySelector('#typo-close').addEventListener('click', closePanel);

      return wrap;
    }

    function openPanel(){ if (!panel) { panel = createPanel(); document.body.appendChild(panel); localStorage.setItem(VIS_FLAG, '1'); } }
function closePanel(){ if (panel) { panel.remove(); panel = null; localStorage.setItem(VIS_FLAG, '0'); } }
function togglePanel(){ if (panel) closePanel(); else openPanel(); }

window.kudosTypography = { open: openPanel, close: closePanel, toggle: togglePanel };

// Bottom-left gear (single)
(function addTypographyToggleButton(){
  if (document.getElementById('typo-toggle-btn')) return;
  if (!document.getElementById('kudos-typo-button-css')) {
    const s = document.createElement('style');
    s.id = 'kudos-typo-button-css';
    s.textContent = `
      #typo-toggle-btn{
        position:fixed; bottom:14px; left:14px;
        background:transparent; border:none; opacity:.25;
        padding:4px; line-height:0; color:var(--ink-3);
        cursor:pointer; z-index:999999;
      }
      #typo-toggle-btn:hover{ opacity:.85; color:var(--ink-2); }
      #typo-toggle-btn:focus-visible{
        outline:2px solid color-mix(in srgb, var(--brand), #fff 35%);
        outline-offset:2px;
      }
      #typo-toggle-btn svg{ width:18px; height:18px; display:block; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }
  const btn = document.createElement('button');
  btn.id = 'typo-toggle-btn';
  btn.type = 'button';
  btn.title = 'Typography (Ctrl+Shift+T • Alt-click “Kudos”)';
  btn.setAttribute('aria-label', 'Toggle typography panel');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm8.24 2.46-.9-.52.08-1.05a1 1 0 0 0-.6-.98l-1-.38-.38-1a1 1 0 0 0-.98-.6l-1.05.08-.52-.9a1 1 0 0 0-1.72 0l-.52.9-1.05-.08a1 1 0 0 0-.98.6l-.38 1-1 .38a1 1 0 0 0-.6.98l.08 1.05-.9.52a1 1 0 0 0 0 1.72l.9.52-.08 1.05a1 1 0 0 0 .6.98l1 .38.38 1a1 1 0 0 0 .98.6l1.05-.08.52.9a1 1 0 0 0 1.72 0l.52-.9 1.05.08a1 1 0 0 0 .98-.6l.38-1 1-.38a1 1 0 0 0 .6-.98l-.08-1.05.9-.52a1 1 0 0 0 0-1.72Z"/>
    </svg>
  `;
  btn.addEventListener('click', () => window.kudosTypography?.toggle());
  document.body.appendChild(btn);
})();

// Shortcuts
document.addEventListener('keydown', (e) => {
  const key = e.key?.toLowerCase();
  if (e.ctrlKey && e.shiftKey && key === 't') { e.preventDefault(); window.kudosTypography?.toggle(); }
});

(function bindTitleAltClick() {
  const tryBind = () => {
    const titleEl = document.querySelector('#kudos-center h2.heading');
    if (!titleEl) return false;
    if (!titleEl.__typoAltClickBound) {
      titleEl.addEventListener('click', (e) => { if (e.altKey) { e.preventDefault(); window.kudosTypography?.toggle(); } });
      titleEl.__typoAltClickBound = true;
    }
    return true;
  };
  if (!tryBind()) {
    const obs = new MutationObserver(() => { if (tryBind()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }
})();

// Restore last visibility + hash hook
if (localStorage.getItem(VIS_FLAG) !== '0') openPanel();
if (location.hash === '#typo') window.kudosTypography?.open();
})();

// === Shared helpers for the Kudos page (define if missing) ===
(function () {
  if (!window.todayLocal) {
    window.todayLocal = function () {
      return new Date().toLocaleDateString('en-CA');
    };
  }

  if (!window.asText) {
    window.asText = function (html) {
      return String(html || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
  }

  if (!window.saveViaLink) {
    window.saveViaLink = function (filename, blob) {
      const a = document.createElement('a');
      a.download = filename;
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    };
  }

  if (!window.waitForBody) {
    window.waitForBody = function (fn) {
      if (document.body) {
        try { fn(); } catch (e) { console.error(e); }
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          try { fn(); } catch (e) { console.error(e); }
        }, { once: true });
      }
    };
  }
})();


/* ─────────── Page Script ─────────── */
waitForBody(exportKudosListIfDue);

setTimeout(() => {
  const container = document.getElementById('kudos-list');
  if (!container) return;

  /* Toolbar (Export/Import) */
  let toolbar = document.getElementById('kudos-toolbar');
  if (toolbar && !toolbar.dataset.ready) {
    toolbar.dataset.ready = '1';

    const btnExport = document.createElement('button');
    btnExport.type = 'button';
    btnExport.className = 'kbtn';
    btnExport.textContent = 'Export';
    btnExport.title = 'Export list (JSON)';
    btnExport.addEventListener('click', () => window.exportKudosNow());

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,text/*';
    fileInput.style.display = 'none';
    fileInput.id = 'kudos-import-file';

    const btnImport = document.createElement('button');
    btnImport.type = 'button';
    btnImport.className = 'kbtn';
    btnImport.textContent = 'Import';
    btnImport.title = 'Import a list/backup';
    btnImport.addEventListener('click', () => fileInput.click());

    toolbar.appendChild(btnExport);
    toolbar.appendChild(btnImport);
    toolbar.appendChild(fileInput);

    // Robust import + merge
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      const LIST_KEY  = 'kudos_history_list';

      try {
        const text = await file.text();
        let parsed, ids = [], incomingCache = null;

        try { parsed = JSON.parse(text); } catch {}

        function pullIdsFromValue(v) {
          if (!v) return [];
          if (Array.isArray(v)) return v;
          if (typeof v === 'object') return Object.keys(v);
          return [];
        }

        if (parsed !== undefined) {
          if (Array.isArray(parsed)) {
            ids = parsed;
          } else if (parsed && typeof parsed === 'object') {
            const listCandidate =
              parsed.kudos_history_list ?? parsed.list ?? parsed.ids ?? parsed.works ?? parsed.work_ids ?? null;
            if (listCandidate) ids = pullIdsFromValue(listCandidate);
            incomingCache = parsed.kudos_fic_cache ?? parsed.cache ?? null;
            if (incomingCache && typeof incomingCache !== 'object') incomingCache = null;
          }
        }
        if (!ids.length) {
          const matches = text.match(/\b\d{1,12}\b/g);
          if (matches && matches.length) ids = matches;
        }
        ids = Array.from(new Set(ids.map(String).filter(x => /^\d+$/.test(x))));
        if (!ids.length) { alert('❌ Invalid file: no IDs detected.'); return; }

        const currentList = new Set(JSON.parse(localStorage.getItem(LIST_KEY) || '[]'));
        const beforeSize = currentList.size;
        for (const id of ids) currentList.add(id);
        const added = currentList.size - beforeSize;
        localStorage.setItem(LIST_KEY, JSON.stringify(Array.from(currentList)));

        if (incomingCache && typeof incomingCache === 'object') {
          const cache = readCache();
          const index = readIndex();
          let changed = false;
          for (const [id, val] of Object.entries(incomingCache)) {
            cache[id] = makeCompactEntry(val, id);
            index[id] = Date.now();
            changed = true;
          }
          if (changed) {
            try { writeCacheUnsafe(cache, index); }
            catch { pruneLRU(index, cache, 100); writeCacheUnsafe(cache, index); }
          }
        }

        alert(`✅ Import complete: detected ${ids.length} IDs, added ${added}. Reloading…`);
        location.reload();
      } catch (e) {
        console.error(e);
        alert('❌ Import failed: unreadable file.');
      } finally {
        fileInput.value = '';
      }
    });

    // Hidden shortcuts for Typography toggle (guarded to avoid double-binding)
    if (!window.__kudosTypoHotkey2Bound) {
      window.__kudosTypoHotkey2Bound = true;
      document.addEventListener('keydown', (e) => {
        const key = e.key?.toLowerCase();
        if (e.ctrlKey && e.shiftKey && key === 't') {
          e.preventDefault();
          window.kudosTypography?.toggle();
        }
      });
    }

    const titleEl = document.querySelector('#kudos-center h2.heading');
    if (titleEl) {
      titleEl.addEventListener('click', (e) => { if (e.altKey) { e.preventDefault(); window.kudosTypography?.toggle(); } });
    }
    if (location.hash === '#typo') window.kudosTypography?.open();
  }

  /* Status bar (spinner + counter) */
  const spinner = document.querySelector('.kudos-spinner');
  const countDisplay = document.querySelector('.kudos-count');
  function updateKudosCounter() {
    const allBlurbs = document.querySelectorAll('.work.blurb.group');
    const visibleBlurbs = [...allBlurbs].filter(b => b.style.display !== 'none');
    if (countDisplay) countDisplay.textContent = `fics count : ${visibleBlurbs.length} / ${allBlurbs.length}`;
  }

  /* Data load/render */
  const ficCache = readCache();
  migrateCachedAuthorsIfNeeded();
  purgeBadAuthorEntriesOnce();
  const allFandoms = new Set();
  const DELAY_MS = 850;
  const MAX_RETRIES = 3;

  function splitFreshStale(ids, cache) {
    const fresh = [], stale = [];
    for (const id of ids) {
      const c = cache[id];
      if (c && !isStaleNow(c)) fresh.push(id);
      else stale.push(id);
    }
    return { fresh, stale };
  }

  function normalizeFandomKey(f) {
    const s = String(f || '').trim().toLowerCase();
    if (s === 'autre' || s === 'indisponible' || s === 'unavailable') return 'unavailable';
    return s || 'unavailable';
  }
  function labelForFandom(key) {
    return String(key).toLowerCase() === 'unavailable' ? 'unavailable' : key;
  }

  let selectedFandom = null;

  function applyFilter(){
    const selected = selectedFandom;
    document.querySelectorAll('.work.blurb.group').forEach(el => {
      const f = normalizeFandomKey(el.getAttribute('data-fandom'));
      el.style.display = (!selected || f === selected) ? 'block' : 'none';
    });
    updateKudosCounter();
  }

  function ensureUnavailableButton(){
    const btnUn = document.getElementById('filter-unavailable');
    if (!btnUn || btnUn.dataset.wired) return;

    btnUn.dataset.wired = '1';
    if (selectedFandom === 'unavailable') btnUn.setAttribute('aria-pressed','true');

    btnUn.addEventListener('click', () => {
      const rail = document.getElementById('fandom-rail');

      if (selectedFandom === 'unavailable') {
        selectedFandom = null;
        btnUn.setAttribute('aria-pressed','false');
      } else {
        selectedFandom = 'unavailable';
        btnUn.setAttribute('aria-pressed','true');
        if (rail) rail.querySelectorAll('.fandom-pill[aria-pressed="true"]').forEach(p => p.setAttribute('aria-pressed','false'));
      }
      applyFilter();
    });
  }
  ensureUnavailableButton();

  function buildFandomRail(){
    const rail = document.getElementById('fandom-rail');
    if (!rail || rail.dataset.ready) return;
    rail.dataset.ready = '1';

    const railKeys = Array.from(new Set(Array.from(allFandoms).map(normalizeFandomKey)))
      .filter(k => k !== 'unavailable')
      .sort((a,b) => a.localeCompare(b));

    railKeys.forEach(fKey => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fandom-pill';
      btn.textContent = labelForFandom(fKey);
      btn.setAttribute('aria-pressed','false');
      btn.addEventListener('click', () => {
        const right = document.getElementById('filter-unavailable');

        if (selectedFandom === fKey) {
          selectedFandom = null;
          btn.setAttribute('aria-pressed','false');
        } else {
          selectedFandom = fKey;
          rail.querySelectorAll('.fandom-pill[aria-pressed="true"]').forEach(p => p.setAttribute('aria-pressed','false'));
          btn.setAttribute('aria-pressed','true');
          if (right) right.setAttribute('aria-pressed','false');
        }
        applyFilter();
      });
      rail.appendChild(btn);
    });

    ensureUnavailableButton();
    applyFilter();
  }

  function safeFallback(workId, opts = {}) {
    return {
      title: opts.locked ? `Locked Work #${workId}` : `Deleted or Locked Work #${workId}`,
      authorText: 'orphan_account',
      authorHTML: null,
      summary: opts.locked
        ? 'Registered-users-only or temporarily unavailable. Open once to cache details safely.'
        : 'This work is unavailable or temporarily unreachable.',
      fandom: 'unavailable',
      locked: !!opts.locked
    };
  }

  function displayFicFromCache(workId, data) {
    const d = {
      title: data?.title || `Deleted or Locked Work #${workId}`,
      authorText: data?.authorText || 'orphan_account',
      authorHTML: data?.authorHTML || null,
      summaryHTML: data?.summaryHTML || null,
      summary: data?.summary || 'No summary.',
      fandom: data?.fandom || 'unavailable',
      tags: data?.tags || null,
      locked: !!data?.locked
    };

    const fKey = normalizeFandomKey(d.fandom);
    const fLabel = labelForFandom(fKey);

    const blurb = document.createElement('div');
    blurb.className = 'work blurb group';
    blurb.setAttribute('data-fandom', fKey);

    const authorHTML = d.authorHTML || d.authorText;

    blurb.innerHTML = `
<h4 class="heading">
  <a href="/works/${workId}" class="title" target="_blank" rel="noopener">${d.title}</a>
  <span class="byline"> by ${authorHTML}</span>
  ${d.locked ? '<span class="badge lock">🔒 Registered users only</span>' : ''}
</h4>
<div class="inline-tags"></div>
<blockquote class="userstuff summary"></blockquote>
<p class="meta meta-fandom">Fandom: ${fLabel}</p>
`;

    const inline = blurb.querySelector('.inline-tags');
    if (inline) {
      const parts = visibleInlineTags(d.tags);
      if (parts.length) inline.textContent = parts.join(', ');
      else inline.remove();
    }

    const sumEl = blurb.querySelector('blockquote.userstuff.summary');
    if (sumEl) {
      if (d.summaryHTML) sumEl.innerHTML = d.summaryHTML;
      else sumEl.textContent = d.summary || 'No summary.';
    }

    container.appendChild(blurb);

    if (fKey !== 'unavailable') allFandoms.add(fKey);
    applyFilter();
  }

  window.addEventListener('storage', (e) => {
    if (e.key !== CACHE_KEY) return;
    try {
      const latest = JSON.parse(e.newValue || '{}');
      document.querySelectorAll('.work.blurb.group').forEach(blurb => {
        const href = blurb.querySelector('a.title')?.getAttribute('href') || '';
        const m = href.match(/\/works\/(\d+)/);
        if (!m) return;
        const id = m[1];
        const data = latest[id];
        if (data && !isStaleNow(data)) {
          const authorHTML = data.authorHTML || data.authorText || 'orphan_account';
          const fKey = normalizeFandomKey(data.fandom || 'unavailable');
          blurb.setAttribute('data-fandom', fKey);

          const titleEl = blurb.querySelector('a.title');
          if (titleEl) titleEl.textContent = data.title || `Fic #${id}`;

          const byline = blurb.querySelector('.byline');
          if (byline) byline.innerHTML = ` by ${authorHTML}`;

          const sum = blurb.querySelector('blockquote.userstuff.summary');
          if (sum) {
            if (data.summaryHTML) sum.innerHTML = data.summaryHTML;
            else sum.textContent = data.summary || 'No summary.';
          }

          const inline = blurb.querySelector('div.inline-tags') || (function(){
            const dDiv = document.createElement('div');
            dDiv.className = 'inline-tags';
            const h4 = blurb.querySelector('h4.heading');
            if (h4 && h4.nextSibling) blurb.insertBefore(dDiv, h4.nextSibling);
            else if (h4) h4.after(dDiv);
            else blurb.prepend(dDiv);
            return dDiv;
          })();

          const parts = visibleInlineTags(data.tags);
          inline.textContent = parts.length ? parts.join(', ') : '';

          const fandomLine = blurb.querySelector('p.meta-fandom') || blurb.querySelector('p.meta');
          if (fandomLine) fandomLine.textContent = `Fandom: ${labelForFandom(fKey)}`;

          if (fKey !== 'unavailable') allFandoms.add(fKey);
          applyFilter();
        }
      });
    } catch {}
  });

function isLoginWall(doc) {
  const txt = (doc.body?.textContent || '').toLowerCase();
  return (
    doc.querySelector('form[action="/users/login"]') ||
    txt.includes('only available to registered users') ||
    txt.includes('utilisateurs enregistrés') ||
    txt.includes('please log in') ||
    txt.includes('veuillez vous connecter')
  );
}
function isErrorOrThrottle(doc) {
  const txt = (doc.body?.textContent || '').toLowerCase();
  return (
    txt.includes("we're sorry, but something went wrong") ||
    txt.includes('retry later') ||
    txt.includes('internal server error') ||
    txt.includes('bad gateway') ||
    txt.includes('service unavailable') ||
    txt.includes('erreur') ||
    txt.includes('problème est survenu')
  );
}

/* ---- Fandom canon helpers ---- */
function canonicalizeFandomLabel(str) {
  const cleaned = String(str || '')
    .replace(/\s*\(TV\)\s*$/i, '')   // strip "(TV)" suffix
    .replace(/\s+/g, ' ')            // collapse spaces
    .trim();

  const groups = [
    { pattern: /maze runner/i, label: 'The Maze Runner' },
    { pattern: /teen wolf/i, label: 'Teen Wolf' },
    { pattern: /harry potter/i, label: 'Harry Potter' },
    { pattern: /avengers|marvel/i, label: 'Marvel' },
    { pattern: /merlin/i, label: 'Merlin' },
    { pattern: /star wars/i, label: 'Star Wars' },
    { pattern: /supernatural/i, label: 'Supernatural' },
    { pattern: /percy jackson|heroes of olympus/i, label: 'Percy Jackson' },
    { pattern: /raven cycle/i, label: 'Raven Cycle' },
    { pattern: /narnia/i, label: 'The Chronicles of Narnia' },
    { pattern: /hamilton/i, label: 'Hamilton' },
    { pattern: /(?:^|\W)it(\W|$)/i, label: 'IT' },
  ];
  for (const g of groups) if (g.pattern.test(cleaned)) return g.label;
  return cleaned || 'unavailable';
}

function parseWorkHTML(html, workId) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  if (isLoginWall(doc) || isErrorOrThrottle(doc)) {
    return { __retry__: true };
  }

  const title =
    (doc.querySelector('h2.title.heading')?.textContent ||
     doc.querySelector('h2.heading.title')?.textContent ||
     doc.querySelector('h2.title')?.textContent ||
     doc.querySelector('h2.work.title')?.textContent ||
     '').trim();

  const { authorText, authorHTML } = extractAuthorsHTML(doc);

  const summaryHTML =
    doc.querySelector('.summary .userstuff')?.innerHTML ??
    doc.querySelector('blockquote.userstuff.summary')?.innerHTML ?? '';
  const summary = asText(summaryHTML) || 'No summary.';

  const meta = doc.querySelector('dl.work.meta, dl.meta');
  const rawFandom =
    meta?.querySelector('dd.fandom.tags li a.tag')?.textContent?.trim() ||
    meta?.querySelector('dd.fandom a.tag')?.textContent?.trim() ||
    'unavailable';

  // Canonicalize here (handles "(TV)" and maps to known labels).
  const fandom = canonicalizeFandomLabel(rawFandom);

  const tags = extractMetaTags(doc);

  if ((!title || title === '') && authorText === 'orphan_account' && normalizeFandomKey(fandom) === 'unavailable') {
    return { __retry__: true };
  }

  return {
    title: title || `Fic #${workId}`,
    authorText,
    authorHTML,
    summaryHTML,
    summary: summary || 'No summary.',
    fandom,
    tags,
    locked: false
  };
}

function fetchOneWork(workId, attempt = 1) {
  return fetch(`/works/${workId}?view_adult=true`, {
    credentials: 'same-origin',
    referrerPolicy: 'same-origin',
    mode: 'same-origin',
    headers: { 'Accept': 'text/html', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  })
  .then(html => {
    const parsed = parseWorkHTML(html, workId);
    if (parsed && parsed.__retry__ && attempt < MAX_RETRIES) {
      const backoff = 900 * attempt + Math.random() * 700;
      return new Promise(r => setTimeout(r, backoff)).then(() => fetchOneWork(workId, attempt + 1));
    }
    return parsed && !parsed.__retry__ ? parsed : null;
  });
}

function finishAndWireFilter() {
  const sp = document.querySelector('.kudos-spinner');
  if (sp) sp.style.display = 'none';
  buildFandomRail();
  if (cacheRefreshDue()) markCacheRefreshedToday();
}

function fetchWorkSequentially(list, idx = 0) {
  if (idx >= list.length) return finishAndWireFilter();
  const workId = list[idx];

  const cached = ficCache[workId];

  // --- Cache migration: fix old entries that still have "Teen Wolf (TV)", etc.
  if (cached) {
    const canon = canonicalizeFandomLabel(cached.fandom);
    if (canon && canon !== cached.fandom) {
      cached.fandom = canon;
      setCacheSafe(workId, cached); // persist the migrated label
    }
  }

  if (cached && !isStaleNow(cached)) {
    displayFicFromCache(workId, cached);
    setTimeout(() => fetchWorkSequentially(list, idx + 1), 0);
    return;
  }

  fetchOneWork(workId)
    .then(data => {
      const finalData = (data && typeof data === 'object') ? data : safeFallback(workId, { locked: false });

      // Ensure new fetches are also canonical (belt & suspenders).
      finalData.fandom = canonicalizeFandomLabel(finalData.fandom);

      setCacheSafe(workId, finalData);
      displayFicFromCache(workId, finalData);
    })
    .catch(() => {
      const data = safeFallback(workId, { locked: false });
      data.fandom = canonicalizeFandomLabel(data.fandom);
      setCacheSafe(workId, data);
      displayFicFromCache(workId, data);
    })
    .finally(() => {
      setTimeout(() => fetchWorkSequentially(list, idx + 1), DELAY_MS + Math.random() * 450);
    });
}

container.innerHTML = '';
const savedListNow = JSON.parse(localStorage.getItem('kudos_history_list') || '[]');
const arrayList = Array.isArray(savedListNow) ? savedListNow : [];
const { fresh, stale } = splitFreshStale(arrayList, ficCache);

if (fresh.length) {
  if (spinner) spinner.style.display = stale.length ? '' : 'none';
  for (const id of fresh) {
    const c = ficCache[id];
    if (c) {
      // also canonicalize fresh-on-load just in case
      const canon = canonicalizeFandomLabel(c.fandom);
      if (canon !== c.fandom) {
        c.fandom = canon;
        setCacheSafe(id, c);
      }
      displayFicFromCache(id, c);
    }
  }
}

if (stale.length) {
  fetchWorkSequentially(stale, 0);
} else {
  if (cacheRefreshDue()) markCacheRefreshedToday();
  finishAndWireFilter();
}

}, 120);
})();

