/* == AO3H Module: JumpToPage ============================================= */
(function () {
  const { util, routes, menu } = AO3H;
  const { $, $$, css, observe, debounce } = util;

  AO3H.register('JumpToPage', {
    title: 'Jump To Page',

    init() {
      // Where we want it active (works search, tag result pages, bookmarks, etc.)
      const isListPage = () =>
        routes.isSearch() || routes.isTagWorks() || routes.isBookmarks() ||
        /\/works$/.test(location.pathname) || /\/pseuds\/[^/]+\/works$/.test(location.pathname);

      css(`
        .ao3h-jtp {
          display:inline-flex; align-items:center; gap:6px; margin:6px 8px;
          font:12px/1 system-ui,sans-serif; background:rgba(0,0,0,.06);
          padding:4px 8px; border-radius:8px;
        }
        .ao3h-jtp input[type="number"]{
          width:72px; padding:3px 6px; border-radius:6px; border:1px solid rgba(0,0,0,.2);
          background:#fff;
        }
        .ao3h-jtp button{ all:unset; cursor:pointer; padding:4px 8px; border-radius:6px;
          background:#e5e7eb; }
        .ao3h-jtp .muted{ opacity:.7; }
        @media (prefers-color-scheme: dark){
          .ao3h-jtp{ background:rgba(255,255,255,.06); }
          .ao3h-jtp input[type="number"]{ background:#111; color:#eee; border-color:rgba(255,255,255,.2); }
          .ao3h-jtp button{ background:#333; color:#eee; }
        }
      `, 'ao3h-jtp');

      function getCurrentPage() {
        const p = new URLSearchParams(location.search).get('page');
        const n = parseInt(p || '1', 10);
        return isFinite(n) && n > 0 ? n : 1;
      }

      function getMaxPageFromDOM() {
        // AO3 pagination shows page numbers as <a> 1 2 3 … N
        let max = 1;
        $$('.pagination a, .pagination .current').forEach(a => {
          const n = parseInt(a.textContent.replace(/\D+/g,''), 10);
          if (isFinite(n)) max = Math.max(max, n);
        });
        // Fallback: if there’s a “Next →” with no numbers, just assume lots
        const hasNext = !!$('.pagination a[rel="next"], .pagination a.next');
        if (max === 1 && hasNext) max = 999; // we’ll clamp user input later by checking existence
        return max;
      }

      function buildURLForPage(n) {
        const url = new URL(location.href);
        if (n <= 1) url.searchParams.delete('page');
        else url.searchParams.set('page', String(n));
        return url.toString();
      }

      function attachWidget(pagerEl) {
        if (!pagerEl || pagerEl._ao3hJtp) return;
        pagerEl._ao3hJtp = true;

        const wrapper = document.createElement('span');
        wrapper.className = 'ao3h-jtp';

        const current = getCurrentPage();
        const maxGuess = getMaxPageFromDOM();
        wrapper.innerHTML = `
          <span class="muted">Jump to</span>
          <input type="number" min="1" step="1" value="${current}" aria-label="Page number">
          <span class="muted">/ ${maxGuess}</span>
          <button type="button">Go</button>
          <span class="muted">(G to focus)</span>
        `;
        const input = wrapper.querySelector('input');
        const btn   = wrapper.querySelector('button');

        function go(target) {
          let n = parseInt(target, 10);
          if (!isFinite(n)) return;
          n = Math.max(1, n);
          // Optional: soft clamp to observed max; still allow if user insists
          const seenMax = getMaxPageFromDOM();
          if (seenMax && seenMax !== 999) n = Math.min(n, seenMax);
          location.assign(buildURLForPage(n));
        }

        btn.addEventListener('click', () => go(input.value));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); go(input.value); }
          else if (e.key === 'Escape') { input.blur(); }
        });

        // Shortcuts: G to focus, Shift+G → last observed page
        addEventListener('keydown', (e) => {
          if (e.isComposing) return;
          const tag = (e.target && (e.target.tagName || '')).toLowerCase();
          if (['input','textarea','select'].includes(tag)) return;
          const k = e.key.toLowerCase();
          if (k === 'g') {
            e.preventDefault();
            input.focus(); input.select();
          } else if (k === 'g' && e.shiftKey) {
            e.preventDefault();
            go(getMaxPageFromDOM());
          }
        });

        // Insert near the pager (top & bottom if both exist)
        pagerEl.appendChild(wrapper);
      }

      function ensureWidgets() {
        if (!isListPage()) return removeWidgets();
        $$('.pagination').forEach(attachWidget);
        // In some AO3 layouts, the top pager is inside #main .actions
        const actionsPager = $('#main .actions .pagination');
        if (actionsPager) attachWidget(actionsPager);
      }

      function removeWidgets() {
        $$('.ao3h-jtp').forEach(el => { try { el.remove(); } catch {} });
        $$('.pagination').forEach(el => { delete el._ao3hJtp; });
      }

      // Initial mount & react to PJAX/filters changes
      ensureWidgets();
      const mo = observe(document.body, { childList: true, subtree: true }, debounce(ensureWidgets, 150));

      // Optional menu hook
      try {
        menu.addAction?.('Jump to page…', () => {
          const v = prompt('Go to which page?', String(getCurrentPage()));
          if (!v) return;
          const n = parseInt(v, 10);
          if (isFinite(n) && n > 0) location.assign(buildURLForPage(n));
        });
        menu.rebuild?.();
      } catch {}

      // Dispose
      return () => { mo?.disconnect?.(); removeWidgets(); };
    },

    onFlagsUpdated() { /* managed by core */ }
  });
})();
