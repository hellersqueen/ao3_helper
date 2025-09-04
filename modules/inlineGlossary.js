/* == AO3H Module: InlineGlossary ========================================= */
(function () {
  const { util, routes, store, flags, menu } = AO3H;
  const { $, $$, css, observe, debounce } = util;

  AO3H.register('InlineGlossary', {
    title: 'Inline Glossary/Footnotes',

    init() {
      const CFG_KEY = 'InlineGlossary:cfg';
      const defaults = {
        trigger: 'hover',     // 'hover' | 'click'
        delayIn: 120,         // ms (hover)
        delayOut: 160,
        maxWidth: 420,        // px
        pinOnClick: true,
        showPermalink: true
      };
      let cfg = Object.assign({}, defaults, store.lsGet(CFG_KEY, defaults));
      const saveCfg = () => store.lsSet(CFG_KEY, cfg);

      if (!(routes.isWork() || routes.isChapter())) return;

      /* ----------------------------- CSS -------------------------------- */
      css(`
        .ao3h-gloss-pop {
          position: fixed; z-index: 999999; max-width: ${cfg.maxWidth}px;
          background: var(--ao3h-pop-bg, rgba(28,28,28,.95)); color: #fff;
          border-radius: 10px; padding: .6rem .75rem; box-shadow: 0 10px 30px rgba(0,0,0,.35);
          font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }
        @media (prefers-color-scheme: light) {
          .ao3h-gloss-pop { background: rgba(255,255,255,.98); color: #111; }
        }
        .ao3h-gloss-pop .ao3h-title { font-weight: 600; margin-bottom: .25rem; }
        .ao3h-gloss-pop .ao3h-body { white-space: normal; }
        .ao3h-gloss-pop .ao3h-actions { display:flex; gap:.5rem; margin-top:.4rem; opacity:.85; }
        .ao3h-gloss-pop button {
          all: unset; cursor: pointer; padding: 2px 6px; border-radius: 6px;
          background: rgba(0,0,0,.15);
        }
        @media (prefers-color-scheme: light) { .ao3h-gloss-pop button { background: rgba(0,0,0,.06); } }
        .ao3h-gloss-pop .ao3h-arrow {
          position:absolute; width:10px; height:10px; transform: rotate(45deg);
          background: inherit; top: -5px; left: 12px; box-shadow:-2px -2px 10px rgba(0,0,0,.15);
        }
        .ao3h-gloss-pop.pinned { outline: 2px solid rgba(59,130,246,.5); }
        .ao3h-gloss-src {
          outline: 2px solid rgba(16,185,129,.5); outline-offset: 2px;
        }
      `, 'ao3h-inline-glossary');

      /* --------------------------- Helpers ------------------------------ */
      const workRoot = $('#workskin') || document.body;

      // Likely targets for endnotes/footnotes on AO3
      const NOTES_SELECTORS = [
        '#notes', '.end.notes', '.chapter .end.notes', '.notes.end', 'section.end.notes'
      ];

      const withinNotes = (el) =>
        !!el && NOTES_SELECTORS.some(sel => el.closest(sel));

      const resolveTarget = (href) => {
        if (!href || !href.startsWith('#')) return null;
        const id = href.slice(1);
        let target = document.getElementById(id);
        if (!target) target = document.querySelector(`[name="${CSS.escape(id)}"]`);
        return target;
      };

      const sanitizeClone = (node) => {
        // Clone and strip interactive controls; keep text & simple formatting
        const clone = node.cloneNode(true);
        // Remove nested anchors that jump around, but keep their text
        clone.querySelectorAll('a').forEach(a => {
          const span = document.createElement('span');
          span.textContent = a.textContent;
          a.replaceWith(span);
        });
        // Trim excessive spacing
        return clone;
      };

      function minutesFromText(text, wpm) {
        const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
        return words / Math.max(60, wpm);
      }

      /* --------------------------- Popovers ----------------------------- */
      let activePop = null;
      let hideTimer = null;

      function makePopoverFor(linkEl, targetEl) {
        const pop = document.createElement('div');
        pop.className = 'ao3h-gloss-pop';
        pop.role = 'tooltip';
        pop.tabIndex = -1;

        const titleText = targetEl.querySelector('h2,h3,strong,em')?.textContent?.trim() || 'Note';
        const bodyNode = sanitizeClone(targetEl);
        bodyNode.classList.add('ao3h-body');

        pop.innerHTML = `
          <div class="ao3h-arrow" aria-hidden="true"></div>
          <div class="ao3h-title">${titleText}</div>
        `;
        pop.appendChild(bodyNode);

        const actions = document.createElement('div');
        actions.className = 'ao3h-actions';
        if (cfg.showPermalink) {
          const a = document.createElement('a');
          a.href = `#${targetEl.id || ''}`;
          a.textContent = 'Go to note';
          a.style.textDecoration = 'underline';
          actions.appendChild(a);
        }
        const pin = document.createElement('button');
        pin.textContent = 'Pin';
        const close = document.createElement('button');
        close.textContent = '✕';
        actions.append(pin, close);
        pop.appendChild(actions);

        document.body.appendChild(pop);

        // Events
        close.addEventListener('click', () => destroyPopover(pop, linkEl));
        pin.addEventListener('click', () => {
          pop.classList.add('pinned');
          linkEl.classList.add('ao3h-gloss-src');
          // No auto-hide while pinned
          if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        });

        // ESC to close current
        const onKey = (e) => {
          if (e.key === 'Escape') destroyPopover(pop, linkEl);
        };
        pop._onKey = onKey;
        addEventListener('keydown', onKey);

        return pop;
      }

      function positionPopover(pop, linkEl) {
        const r = linkEl.getBoundingClientRect();
        const margin = 8;
        const desiredTop = r.bottom + margin;
        let x = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left));
        let y = desiredTop;

        // If it would go off bottom, flip above
        if (y + pop.offsetHeight + 8 > window.innerHeight) {
          y = Math.max(8, r.top - pop.offsetHeight - 10);
          pop.querySelector('.ao3h-arrow').style.top = 'auto';
          pop.querySelector('.ao3h-arrow').style.bottom = '-5px';
        } else {
          pop.querySelector('.ao3h-arrow').style.top = '-5px';
          pop.querySelector('.ao3h-arrow').style.bottom = 'auto';
        }

        pop.style.left = `${Math.round(x)}px`;
        pop.style.top  = `${Math.round(y)}px`;
      }

      function destroyPopover(pop, linkEl) {
        if (!pop) return;
        removeEventListener('keydown', pop._onKey || (()=>{}));
        try { pop.remove(); } catch {}
        if (linkEl) linkEl.classList.remove('ao3h-gloss-src');
        if (activePop === pop) activePop = null;
      }

      function showPopover(linkEl) {
        const href = linkEl.getAttribute('href') || '';
        const target = resolveTarget(href);
        if (!target || !withinNotes(target)) return;

        // Replace active pop if any
        if (activePop) destroyPopover(activePop, activePop._src);

        const pop = makePopoverFor(linkEl, target);
        pop._src = linkEl;
        activePop = pop;
        linkEl.classList.add('ao3h-gloss-src');

        // Defer position until mounted & sized
        requestAnimationFrame(() => positionPopover(pop, linkEl));
      }

      function scheduleHide(linkEl) {
        if (!activePop || activePop.classList.contains('pinned')) return;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => destroyPopover(activePop, linkEl), cfg.delayOut);
      }

      /* ----------------------- Wiring up triggers ------------------------ */
      const LINK_SELECTOR = [
        // superscripted footnote style
        '#workskin sup a[href^="#"]',
        // any in-work anchor that jumps to a note
        '#workskin a[href^="#"]'
      ].join(',');

      function eligibleLink(a) {
        if (!a || !a.getAttribute) return false;
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('#')) return false;
        const target = resolveTarget(href);
        return !!(target && withinNotes(target));
      }

      function bindLink(a) {
        if (a._ao3hGlossBound) return;
        if (!eligibleLink(a)) return;

        a._ao3hGlossBound = true;
        a.setAttribute('aria-haspopup', 'dialog');

        if (cfg.trigger === 'hover') {
          let inTimer = null;

          a.addEventListener('mouseenter', () => {
            clearTimeout(inTimer);
            inTimer = setTimeout(() => showPopover(a), cfg.delayIn);
          });
          a.addEventListener('mouseleave', () => {
            clearTimeout(inTimer);
            scheduleHide(a);
          });
          // Keep open while hovering popover
          a.addEventListener('focus', () => showPopover(a));
          a.addEventListener('blur', () => scheduleHide(a));
          document.addEventListener('mousemove', (e) => {
            if (!activePop || activePop.classList.contains('pinned')) return;
            if (!activePop.contains(e.target) && e.target !== a) {
              // If pointer left both link and pop, schedule hide
              scheduleHide(a);
            }
          });
        } else { // click trigger
          a.addEventListener('click', (e) => {
            // Don’t jump the page; we’re showing inline
            e.preventDefault();
            if (activePop && activePop._src === a && !activePop.classList.contains('pinned')) {
              destroyPopover(activePop, a);
            } else {
              showPopover(a);
              if (cfg.pinOnClick && activePop) activePop.classList.add('pinned');
            }
          });
        }
      }

      function scanLinks() {
        $$(LINK_SELECTOR, workRoot).forEach(bindLink);
      }

      // Initial scan + observe updates (for PJAX/dynamic content)
      scanLinks();
      const mo = observe(workRoot, { childList: true, subtree: true }, debounce(scanLinks, 100));

      /* ----------------------------- Menu -------------------------------- */
      try {
        menu.addToggle?.('Inline Glossary (hover)', cfg.trigger === 'hover', (v) => {
          cfg.trigger = v ? 'hover' : 'click'; saveCfg();
          // Rebind is lightweight: clear flags & rescan
          $$(LINK_SELECTOR, workRoot).forEach(a => a._ao3hGlossBound = false);
          scanLinks();
        });
        menu.addAction?.(`Max width: ${cfg.maxWidth}px`, async () => {
          const v = prompt('Max width (px)?', String(cfg.maxWidth));
          const n = parseInt(v, 10);
          if (isFinite(n) && n >= 220) { cfg.maxWidth = n; saveCfg(); }
        });
        menu.addToggle?.('Pin on click', cfg.pinOnClick, (v)=>{ cfg.pinOnClick = !!v; saveCfg(); });
        menu.addToggle?.('Show “Go to note” link', cfg.showPermalink, (v)=>{ cfg.showPermalink = !!v; saveCfg(); });
        menu.rebuild?.();
      } catch {}

      /* --------------------------- Dispose -------------------------------- */
      return () => {
        mo?.disconnect?.();
        if (activePop) destroyPopover(activePop, activePop._src);
        // best-effort: unmark bound links
        $$(LINK_SELECTOR, workRoot).forEach(a => { a._ao3hGlossBound = false; a.classList.remove('ao3h-gloss-src'); });
      };
    },

    onFlagsUpdated() { /* core handles start/stop */ }
  });
})();
