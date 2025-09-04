/* == AO3H Module: AutoScroll ============================================= */
(function () {
  const { util, routes, store, flags, menu, bus } = AO3H;
  const { $, css, observe, log } = util;

  AO3H.register('AutoScroll', {
    title: 'Auto Scroll',

    init() {
      const KV = 'AutoScroll:v1';
      const defaults = { enabledUI: false, pxPerSec: 120, autoNext: false };
      let state = Object.assign({}, defaults, store.lsGet(KV, defaults));

      let ui = null, raf = 0, lastTs = 0, frac = 0, interactingAt = 0;
      const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

      const save = () => store.lsSet(KV, state);
      const now = () => performance.now();
      const isInteracting = () => (now() - interactingAt) < 500;

      function attachGlobalInteractionWatchers() {
        const bump = () => { interactingAt = now(); };
        ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(ev =>
          addEventListener(ev, bump, { passive: true })
        );
      }

      function makeUI() {
        if (ui) return;
        css(`
          .ao3h-asc { position:fixed; right:12px; bottom:12px; z-index:999999;
            display:flex; gap:8px; align-items:center;
            background:rgba(20,20,20,.78); color:#fff; padding:8px 10px; border-radius:12px;
            font:12px/1.2 system-ui, sans-serif; box-shadow:0 8px 24px rgba(0,0,0,.25); }
          .ao3h-asc button { all:unset; cursor:pointer; padding:4px 8px; border-radius:8px;
            background:#10b981; color:#04140d; font-weight:600; }
          .ao3h-asc input[type="range"] { width:140px; }
          .ao3h-asc .muted { opacity:.7 }
        `, 'ao3h-autoscroll');

        ui = document.createElement('div');
        ui.className = 'ao3h-asc';
        ui.innerHTML = `
          <button data-asc="toggle">${state.enabledUI ? 'Pause' : 'Play'}</button>
          <label style="display:flex;align-items:center;gap:6px;">
            <span>Speed</span>
            <input data-asc="speed" type="range" min="30" max="600" step="10" value="${state.pxPerSec}">
            <span data-asc="speedVal">${state.pxPerSec}</span><span class="muted">px/s</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input data-asc="next" type="checkbox" ${state.autoNext ? 'checked' : ''}> Next➜
          </label>
          <span class="muted">(S toggle, ↑/↓ speed)</span>
        `;
        document.body.appendChild(ui);

        const btn = ui.querySelector('[data-asc="toggle"]');
        const speed = ui.querySelector('[data-asc="speed"]');
        const speedVal = ui.querySelector('[data-asc="speedVal"]');
        const next = ui.querySelector('[data-asc="next"]');

        btn.addEventListener('click', () => state.enabledUI ? stop() : start());
        speed.addEventListener('input', () => {
          state.pxPerSec = parseInt(speed.value, 10);
          speedVal.textContent = state.pxPerSec;
          save();
        });
        next.addEventListener('change', () => { state.autoNext = next.checked; save(); });

        // hotkeys (ignore typing)
        addEventListener('keydown', (e) => {
          const tag = (e.target && (e.target.tagName || '')).toLowerCase();
          if (['input','textarea'].includes(tag) || e.isComposing) return;
          const k = e.key.toLowerCase();
          if (k === 's') { e.preventDefault(); state.enabledUI ? stop() : start(); }
          else if (k === 'arrowup') { e.preventDefault(); speed.value = String(Math.min(600, +speed.value + 10)); speed.dispatchEvent(new Event('input')); }
          else if (k === 'arrowdown') { e.preventDefault(); speed.value = String(Math.max(30, +speed.value - 10)); speed.dispatchEvent(new Event('input')); }
          else if (['pageup','pagedown','home','end',' '].includes(k)) stop();
        });

        // expose controls
        ui._controls = { btn, speed, next };
      }

      function destroyUI() {
        if (!ui) return;
        try { ui.remove(); } catch {}
        ui = null;
      }

      function atBottom() {
        const max = document.documentElement.scrollHeight - innerHeight;
        return Math.ceil(scrollY) >= max;
      }

      function maybeAutoNext() {
        if (!state.autoNext) return;
        const sel = 'a[rel="next"], .chapter .navigation a[rel="next"]';
        let link = document.querySelector(sel);
        if (!link) link = Array.from(document.querySelectorAll('a')).find(a => /next chapter/i.test(a.textContent));
        if (link && link.href) setTimeout(() => location.assign(link.href), 1200);
      }

      function loop(ts) {
        if (!state.enabledUI) return;
        const dt = Math.min(64, ts - lastTs); // smooth on hiccups
        lastTs = ts;

        if (isInteracting() || window.getSelection()?.toString()) {
          raf = requestAnimationFrame(loop); return;
        }

        const px = state.pxPerSec * (dt / 1000) + frac;
        const whole = px | 0; frac = px - whole;

        if (!atBottom() && whole > 0) {
          scrollBy(0, whole);
        } else if (atBottom()) {
          stop();
          maybeAutoNext();
          return;
        }

        raf = requestAnimationFrame(loop);
      }

      function start() {
        if (prefersReduced) return;      // respect user setting
        if (!routes.isWork() && !routes.isChapter()) return; // only on reading
        makeUI();
        state.enabledUI = true;
        save();
        if (ui?._controls?.btn) ui._controls.btn.textContent = 'Pause';
        lastTs = now(); frac = 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }

      function stop() {
        state.enabledUI = false;
        save();
        cancelAnimationFrame(raf); raf = 0;
        if (ui?._controls?.btn) ui._controls.btn.textContent = 'Play';
      }

      // react to PJAX-ish nav/content changes (your observe helper)
      const mo = observe(() => {
        // if we navigated off a work page, stop & hide UI; if onto one, keep UI
        if (!routes.isWork() && !routes.isChapter()) {
          stop();
          // leave UI in place; or remove it entirely if you prefer:
          // destroyUI();
        }
      });

      attachGlobalInteractionWatchers();

      // Optional: hook into your menu if present
      try {
        menu.addToggle?.('Auto Scroll', flags.get('mod:AutoScroll:enabled', true), (val) => {
          AO3H.modules.setEnabled('AutoScroll', !!val);
        });
        menu.rebuild?.();
      } catch {}

      // If user previously left it running, restart on eligible pages
      if (state.enabledUI) start();

      // return disposer
      return () => {
        stop();
        destroyUI();
        mo?.disconnect?.();
      };
    },

    // Called by your core whenever the flag changes
    onFlagsUpdated({ enabled }) {
      // When globally disabled, ensure UI/loop are down; when enabled, we leave
      // starting up to init (or the user hitting Play).
      if (!enabled) {
        // If module is toggled off from menu/flag, hard stop the UI if present.
        try {
          // access last instance via window-scoped AO3H if needed
          // but since dispose is called by core on stop, we can no-op here.
        } catch {}
      }
    }
  });
})();
