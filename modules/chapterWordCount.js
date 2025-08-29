/* modules/chapterWordCount.js — per-chapter word counts (compat AO3H core/menu) */
;(function(){
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = AO3H.env?.NS || 'ao3h';

  const { onReady, observe, debounce, css, log, guard } = AO3H.util;
  const Routes  = AO3H.routes;
  const Flags   = AO3H.flags;

  const MOD = 'ChapterWordCount';
  const ENABLE_KEY = `mod:${MOD}:enabled`;

  let enabled = false;
  let mo = null; // MutationObserver

  /* ---------------- helpers ---------------- */
  function collectMainUserstuffNodes(scopeEl){
    const all = Array.from(scopeEl.querySelectorAll('.userstuff'));
    return all.filter(usd => !usd.closest('.preface, .summary, .endnotes'));
  }
  function textFromNodes(nodes){
    return nodes.map(n => n.innerText || '').join('\n');
  }
  function countWordsFromText(text){
    if (!text) return 0;
    const m = text.match(/[\p{L}\p{N}’'-]+/gu);
    return m ? m.length : 0;
  }
  function countWordsFromChapterEl(chapterEl){
    const nodes = collectMainUserstuffNodes(chapterEl);
    return countWordsFromText(textFromNodes(nodes));
  }

  function ensureStyles(){
    // injecte une seule fois
    css(`
      .${NS}-wc-badge{
        margin:.5rem 0; font-size:0.95rem; opacity:.85;
      }
    `, 'chapter-wc-style');
  }

  function insertBadge(afterEl, words, scope='chapter'){
    if (!afterEl) return;
    // si badge déjà présent juste après, on le met à jour
    const next = afterEl.nextElementSibling;
    if (next && next.classList?.contains(`${NS}-wc-badge`)) {
      next.textContent = `~ ${Number(words).toLocaleString()} words in this ${scope}`;
      return;
    }
    const el = document.createElement('div');
    el.className = `${NS}-wc-badge`;
    el.textContent = `~ ${Number(words).toLocaleString()} words in this ${scope}`;
    afterEl.insertAdjacentElement('afterend', el);
  }

  function injectPerChapterBadges(){
    let chapters = Array.from(document.querySelectorAll('#chapters .chapter'));
    if (!chapters.length) chapters = Array.from(document.querySelectorAll('#workskin .chapter'));
    if (!chapters.length) return false;

    chapters.forEach(ch => {
      const words  = countWordsFromChapterEl(ch);
      const header = ch.querySelector('h3.title, h2.heading, h3.heading, h2, h3') || ch;
      insertBadge(header, words, 'chapter');
    });
    return true;
  }

  function injectSingleChapterBadge(){
    const workskin = document.querySelector('#workskin');
    if (!workskin) return;
    const chapter = workskin.querySelector('.chapter') || workskin;
    const words = countWordsFromChapterEl(chapter);
    const anchor =
      workskin.querySelector('h2.title, h2.heading, h3.title, h3.heading') ||
      chapter.querySelector('h2, h3') || workskin;
    insertBadge(anchor, words, 'chapter');
  }

  function runOnce(){
    ensureStyles();
    const did = injectPerChapterBadges();
    if (!did) injectSingleChapterBadge();
  }

  function start(){
    if (!enabled) return;
    // Agir uniquement sur les pages de works/chapters
    if (!(Routes.isWork?.() || Routes.isChapter?.() || Routes.isWorkShow?.())) return;

    guard(() => {
      // première passe
      runOnce();

      // (re)brancher l’observer pour les modifs dynamiques
      try { mo?.disconnect(); } catch {}
      mo = observe(document.documentElement, { childList:true, subtree:true }, debounce(()=>{
        if (!enabled) return;
        runOnce();
      }, 250));
    }, `${MOD}:start`);
  }

  function stop(){
    try { mo?.disconnect(); } catch {}
    mo = null;
    document.querySelectorAll(`.${NS}-wc-badge`).forEach(el => el.remove());
  }

  // Enregistrement module (compatible avec core/menu actuels)
  AO3H.modules.register(MOD, { title: 'Chapter word count', enabledByDefault: true }, async function init(){
    enabled = !!Flags.get(ENABLE_KEY, true);

    onReady(() => { if (enabled) start(); });

    // Toggle live depuis le menu
    Flags.watch(ENABLE_KEY, (val)=>{
      enabled = !!val;
      if (enabled) start();
      else stop();
    });

    log.info?.(`[${MOD}] ready`);
  });

})();
