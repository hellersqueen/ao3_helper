/* modules/chapterWordCount.js — per-chapter word counts */
;(function(){
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const AO3H = W.AO3H || {};
  const NS   = (AO3H.env && AO3H.env.NS) || 'ao3h';

  const { onReady, observe, debounce, css, on } = (AO3H.util || {});
  const dlog = (...a)=>{ if (AO3H.env?.DEBUG) console.log('[AO3H][ChapterWordCount]', ...a); };

  let enabled = false;

  // --- helpers ---
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

  function insertBadge(afterEl, words, scope='chapter'){
    if (!afterEl) return;
    const next = afterEl.nextElementSibling;
    if (next && next.classList?.contains(`${NS}-wc-badge`)) return;

    const el = document.createElement('div');
    el.className = `${NS}-wc-badge`;
    el.textContent = `~ ${Number(words).toLocaleString()} words in this ${scope}`;
    css`.${NS}-wc-badge{ margin:.5rem 0; font-size:0.95rem; opacity:.85; }`;
    afterEl.insertAdjacentElement('afterend', el);
  }

  function injectPerChapterBadges(){
    let chapters = Array.from(document.querySelectorAll('#chapters .chapter'));
    if (!chapters.length) chapters = Array.from(document.querySelectorAll('#workskin .chapter'));
    if (!chapters.length) return false;

    chapters.forEach(ch => {
      if (ch.querySelector(`.${NS}-wc-badge`)) return;
      const words = countWordsFromChapterEl(ch);
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

  function run(){
    const did = injectPerChapterBadges();
    if (!did) injectSingleChapterBadge();
  }

  AO3H.register?.({
    id: 'ChapterWordCount',
    title: 'Chapter word count',
    defaultFlagKey: 'chapterWordCount',

    init: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;
      if (!enabled) return;
      onReady(() => {
        run();
        observe(document.body, debounce(run, 250));
      });
    },

    onFlagsUpdated: async ({ enabled: onFlag }) => {
      enabled = !!onFlag;
      if (!enabled) {
        document.querySelectorAll(`.${NS}-wc-badge`).forEach(el => el.remove());
      } else {
        run();
      }
    },
  });

})();
