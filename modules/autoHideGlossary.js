/* == AO3H Module: AutoHideNotes ========================================= */
(function () {
  const { util, routes, store, menu } = AO3H;
  const { $, $$, css, observe, debounce } = util;

  AO3H.register('AutoHideNotes', {
    title: 'Masquer notes longues',

    init() {
      const CFG_KEY  = 'AutoHideNotes:cfg';
      const DATA_KEY = 'AutoHideNotes:data'; // états par œuvre
      // Config par défaut
      const defaults = {
        enabledOnStart: true,   // masquer les notes de début
        enabledOnEnd:   true,   // masquer les notes de fin
        maxChars: 600,          // au-delà on replie (0 = ignorer)
        maxLines: 8,            // au-delà on replie (0 = ignorer)
        animate: true,
        rememberPerWork: true,  // mémoriser votre dernier choix par œuvre
        showHint: true          // petit texte “Notes masquées…”
      };
      let cfg = Object.assign({}, defaults, store.lsGet(CFG_KEY, defaults));
      const saveCfg = () => store.lsSet(CFG_KEY, cfg);

      // Mémoire: { [workId]: { start:'collapsed'|'expanded', end:'collapsed'|'expanded' } }
      let db = store.lsGet(DATA_KEY, {});
      const saveDb = debounce(() => store.lsSet(DATA_KEY, db), 300);

      /* ----------------------------- CSS -------------------------------- */
      css(`
        .ao3h-notes-wrap { position: relative; }
        .ao3h-notes-collapsed {
          max-height: 11.5em; /* ~8 lignes selon line-height par défaut */
          overflow: hidden;
          mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
        }
        .ao3h-notes-toggle {
          display:inline-flex; gap:6px; align-items:center;
          margin-top: .4rem; padding: 3px 8px; border-radius: 8px;
          font: 12px/1 system-ui,sans-serif; cursor: pointer; user-select: none;
          background: rgba(0,0,0,.08);
        }
        .ao3h-notes-hint { opacity:.7; font-size:11px; margin-left:8px; }
        @media (prefers-color-scheme: dark) {
          .ao3h-notes-toggle { background: rgba(255,255,255,.08); }
        }
        .ao3h-notes-anim { transition: max-height .22s ease; }
      `, 'ao3h-autohidenotes');

      /* --------------------------- Helpers ------------------------------ */
      function getIds() {
        const mW = location.pathname.match(/^\/works\/(\d+)/);
        const mC = location.pathname.match(/^\/works\/\d+\/chapters\/(\d+)/);
        return { workId: mW ? mW[1] : null, chapterId: mC ? mC[1] : null };
      }

      // Sélecteurs AO3 possibles pour les notes
      const SEL_START = [
        '#workskin .notes',           // section notes de début (générique)
        '#workskin .preface .notes'   // parfois dans preface
      ].join(',');

      const SEL_END = [
        '#workskin .end.notes',
        '#workskin section.end.notes'
      ].join(',');

      // Récupère le bloc “contenu” des notes (souvent .userstuff)
      function noteContentEl(section) {
        return section.querySelector('.userstuff') || section;
      }

      // Mesure si le contenu “dépasse” les seuils
      function isLong(section) {
        const content = noteContentEl(section);
        if (!content) return false;
        const text = content.innerText || content.textContent || '';
        const tooManyChars = cfg.maxChars > 0 && text.replace(/\s+/g,' ').trim().length > cfg.maxChars;

        let tooManyLines = false;
        if (cfg.maxLines > 0) {
          const cs = getComputedStyle(content);
          const lh = parseFloat(cs.lineHeight) || 18;
          const h  = content.scrollHeight;
          const lines = h / lh;
          tooManyLines = lines > cfg.maxLines;
        }
        return tooManyChars || tooManyLines;
      }

      function applyOne(section, key) {
        if (!section || section._ao3hNotesApplied) return;
        section._ao3hNotesApplied = true;

        const content = noteContentEl(section);
        if (!content) return;

        // Décider si on replie
        const ids   = getIds();
        const mem   = ids.workId && db[ids.workId] && db[ids.workId][key];
        const long  = isLong(section);
        const wantCollapse = (mem ? mem === 'collapsed' : true) && long;

        // Envelopper
        section.classList.add('ao3h-notes-wrap');
        if (cfg.animate) content.classList.add('ao3h-notes-anim');
        if (wantCollapse) content.classList.add('ao3h-notes-collapsed');

        // Bouton toggle
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'ao3h-notes-toggle';
        const label = () => content.classList.contains('ao3h-notes-collapsed') ? 'Afficher les notes' : 'Masquer les notes';
        toggle.textContent = label();

        // Petite indication
        const hint = document.createElement('span');
        hint.className = 'ao3h-notes-hint';
        if (cfg.showHint && long) hint.textContent = 'Notes longues masquées';
        toggle.appendChild(hint);

        section.appendChild(toggle);

        function setState(collapsed) {
          content.style.maxHeight = ''; // reset css inline si présent
          content.classList.toggle('ao3h-notes-collapsed', collapsed);
          toggle.firstChild.nodeValue = collapsed ? 'Afficher les notes' : 'Masquer les notes';
          if (cfg.rememberPerWork && ids.workId) {
            db[ids.workId] = db[ids.workId] || {};
            db[ids.workId][key] = collapsed ? 'collapsed' : 'expanded';
            saveDb();
          }
        }

        toggle.addEventListener('click', () => {
          setState(!content.classList.contains('ao3h-notes-collapsed'));
        });

        // Si pas long, on n’affiche pas de bouton
        if (!long) {
          try { toggle.remove(); } catch{}
        }
      }

      function scanAndApply() {
        if (!(routes.isWork() || routes.isChapter())) return;
        if (cfg.enabledOnStart) $$(SEL_START).forEach(sec => applyOne(sec, 'start'));
        if (cfg.enabledOnEnd)   $$(SEL_END).forEach(sec => applyOne(sec, 'end'));
      }

      // Lancer et observer
      scanAndApply();
      const mo = observe(document.body, { childList:true, subtree:true }, debounce(scanAndApply, 120));

      /* ------------------------------ Menu ------------------------------- */
      try {
        menu.addToggle?.('Masquer notes de début', cfg.enabledOnStart, (v)=>{ cfg.enabledOnStart = !!v; saveCfg(); scanAndApply(); });
        menu.addToggle?.('Masquer notes de fin',   cfg.enabledOnEnd,   (v)=>{ cfg.enabledOnEnd   = !!v; saveCfg(); scanAndApply(); });
        menu.addAction?.(`Seuil caractères (${cfg.maxChars})`, () => {
          const v = prompt('Nombre max de caractères avant repli (0 = désactivé)', String(cfg.maxChars));
          if (v == null) return;
          const n = parseInt(v,10);
          if (Number.isFinite(n) && n >= 0) { cfg.maxChars = n; saveCfg(); scanAndApply(); }
        });
        menu.addAction?.(`Seuil lignes (${cfg.maxLines})`, () => {
          const v = prompt('Nombre max de lignes visibles (0 = désactivé)', String(cfg.maxLines));
          if (v == null) return;
          const n = parseInt(v,10);
          if (Number.isFinite(n) && n >= 0) { cfg.maxLines = n; saveCfg(); scanAndApply(); }
        });
        menu.addToggle?.('Mémoriser par œuvre', cfg.rememberPerWork, (v)=>{ cfg.rememberPerWork = !!v; saveCfg(); });
        menu.addToggle?.('Animation', cfg.animate, (v)=>{ cfg.animate = !!v; saveCfg(); });
        menu.addToggle?.('Afficher l’indication', cfg.showHint, (v)=>{ cfg.showHint = !!v; saveCfg(); scanAndApply(); });
        menu.rebuild?.();
      } catch {}

      // Dispose
      return () => { mo?.disconnect?.(); };
    },

    onFlagsUpdated() { /* Core gère start/stop */ }
  });
})();
