/* modules/chapterWordCount.js — per-chapter word counts (stable, anti-boucle) */
;(function(){
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = AO3H.env?.NS || 'ao3h';

  const { onReady, css, log, guard, debounce } = AO3H.util;
  const Routes  = AO3H.routes;
  const Flags   = AO3H.flags;

  const MOD = 'ChapterWordCount';
  const ENABLE_KEY = `mod:${MOD}:enabled`;

  let enabled = false;
  let mo = null;                 // MutationObserver
  let running = false;           // empêche la ré-entrée
  let scheduled = false;         // coalesce des mises à jour

  /* ---------------- helpers ---------------- */
  function countWordsFromText(text){
    if (!text) return 0;
    const s = text.replace(/\s+/g, ' ').trim();
    if (!s) return 0;
    let tokens = null;
    try { tokens = s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu); } catch {}
    if (!tokens) tokens = s.match(/\S+/g);
    return tokens ? tokens.length : 0;
  }

  function pickMainUserstuff(ch){
    // candidates: .userstuff du chapitre
    const all = Array.from(ch.querySelectorAll('.userstuff'));
    if (!all.length) return null;
    // filtre “notes/summary/preface/endnotes” si possible
    const filtered = all.filter(usd => !usd.closest('.preface, .summary, .endnotes, .notes'));
    const candidates = filtered.length ? filtered : all;
    // choisit la plus longue (contenu principal)
    let best=null, max=-1;
    for (const el of candidates){
      const len = (el.textContent || el.innerText || '').trim().length;
      if (len > max){ best = el; max = len; }
    }
    return best;
  }

  function wordsForChapter(ch){
    const main = pickMainUserstuff(ch);
    if (!main) return 0;
    return countWordsFromText(main.textContent || main.innerText || '');
  }

  function ensureStyles(){
    css(`.${NS}-wc-badge{ margin:.5rem 0; font-size:.95rem; opacity:.85; }`, 'chapter-wc-style');
  }

  function setTextIfChanged(el, text){
    if (!el) return false;
    if (el.textContent === text) return false;
    el.textContent = text;
    return true;
  }

  function insertOrUpdateBadge(afterEl, words){
    if (!afterEl) return false;
    const content = `~ ${Number(words).toLocaleString()} words in this chapter`;
    const next = afterEl.nextElementSibling;
    if (next && next.classList?.contains(`${NS}-wc-badge`)) {
      // n’écrit pas si identique → évite de déclencher des mutations inutiles
      return setTextIfChanged(next, content);
    }
    const el = document.createElement('div');
    el.className = `${NS}-wc-badge`;
    el.setAttribute('data-ao3h-mod', MOD);
    el.textContent = content;
    afterEl.insertAdjacentElement('afterend', el);
    return true; // nouvel élément → mutation unique
  }

  function getObserveRoot(){
    // Observe surtout le workskin pour limiter le bruit
    return document.getElementById('workskin') || document.documentElement;
  }

  function updateBadges(){
    if (!enabled) return;
    if (!(Routes.isWork?.() || Routes.isChapter?.() || Routes.isWorkShow?.())) return;

    if (running) return;      // anti-réentrance
    running = true;

    // Pause l’observer pendant nos changements pour éviter les boucles
    const root = getObserveRoot();
    try { mo?.disconnect(); } catch {}

    try {
      ensureStyles();

      // 1) Plusieurs chapitres
      let changed = false;
      let chapters = Array.from(document.querySelectorAll('#workskin .chapter'));
      if (!chapters.length) chapters = Array.from(document.querySelectorAll('#chapters .chapter'));

      if (chapters.length){
        for (const ch of chapters){
          const words  = wordsForChapter(ch);
          const header = ch.querySelector('h3.title, h2.heading, h3.heading, h2, h3') || ch;
          changed = insertOrUpdateBadge(header, words) || changed;
        }
      } else {
        // 2) Page simple sans .chapter : prendre la plus longue .userstuff globale
        const workskin = document.getElementById('workskin');
        if (workskin){
          const all = Array.from(workskin.querySelectorAll('.userstuff'));
          let best = null, max = -1;
          for (const el of all){
            if (el.closest('.preface, .summary, .endnotes, .notes')) continue;
            const len = (el.textContent || '').trim().length;
            if (len > max){ best = el; max = len; }
          }
          const main = best || all.sort((a,b)=>(b.textContent||'').length-(a.textContent||'').length)[0];
          if (main){
            const words = countWordsFromText(main.textContent || '');
            const anchor =
              workskin.querySelector('h2.title, h2.heading, h3.title, h3.heading') ||
              workskin.querySelector('.preface') || workskin;
            changed = insertOrUpdateBadge(anchor, words) || changed;
          }
        }
      }

      // Rien ne change → aucune nouvelle mutation déclenchée
      // Si quelque chose a changé, on aura une seule mutation (insertion/maj)
    } finally {
      // Rebranche l’observer, throttlé
      try {
        mo?.disconnect();
        mo = new MutationObserver(debounce(()=> {
          if (!enabled) return;
          if (scheduled) return;
          scheduled = true;
          // Regroupe via rAF pour laisser AO3 finir ses updates
          requestAnimationFrame(()=>{ scheduled = false; guard(updateBadges, `${MOD}:update`); });
        }, 300));
        mo.observe(root, { childList:true, subtree:true });
      } catch {}
      running = false;
    }
  }

  function start(){
    if (!enabled) return;
    guard(updateBadges, `${MOD}:initial`);
  }

  function stop(){
    try { mo?.disconnect(); } catch {}
    mo = null;
    document.querySelectorAll(`[data-ao3h-mod="${MOD}"], .${NS}-wc-badge`).forEach(el => el.remove());
  }

  AO3H.modules.register(MOD, { title: 'Chapter word count', enabledByDefault: true }, async function init(){
    enabled = !!Flags.get(ENABLE_KEY, true);
    onReady(() => { if (enabled) start(); });
    Flags.watch(ENABLE_KEY, (val)=>{ enabled = !!val; enabled ? start() : stop(); });
    log.info?.(`[${MOD}] ready`);
  });

})();
