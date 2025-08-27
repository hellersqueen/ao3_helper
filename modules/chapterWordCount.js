;(function(){
  'use strict';
  const { onReady, observe, debounce, css } = AO3H.util;
  const { getFlags } = AO3H.flags;
  const NS = AO3H.env.NS || 'ao3h';

  // --- helpers ---
  function collectMainUserstuffNodes(scopeEl){
    const all = Array.from(scopeEl.querySelectorAll('.userstuff'));
    return all.filter(usd => !usd.closest('.preface, .summary, .endnotes'));
  }
  const textFromNodes = (nodes)=> (nodes && nodes.length)
    ? nodes.map(n => n.innerText || '').join('\n')
    : '';
  const countWordsFromText = (text)=>{
    if (!text) return 0;
    const m = text.match(/[\p{L}\p{N}’'-]+/gu);
    return m ? m.length : 0;
  };
  const countWordsFromChapterEl = (el)=> countWordsFromText(textFromNodes(collectMainUserstuffNodes(el)));

  function insertBadge(afterEl, words, scope='chapter'){
    if (!afterEl) return;
    const next = afterEl.nextElementSibling;
    if (next && next.classList?.contains(`${NS}-wc-badge`)) return;

    const el = document.createElement('div');
    el.className = `${NS}-wc-badge`;
    el.textContent = `~ ${Number(words).toLocaleString()} words in this ${scope}`;
    afterEl.insertAdjacentElement('afterend', el);
  }

  function injectPerChapterBadges(){
    let chapters = Array.from(document.querySelectorAll('#chapters .chapter'));
    if (chapters.length === 0) chapters = Array.from(document.querySelectorAll('#workskin .chapter'));
    if (chapters.length === 0) return false;

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
    const anchor = workskin.querySelector('h2.title, h2.heading, h3.title, h3.heading')
      || chapter.querySelector('h2, h3')
      || workskin;
    insertBadge(anchor, words, 'chapter');
  }

  function run(){
    const didPerChapter = injectPerChapterBadges();
    if (!didPerChapter) injectSingleChapterBadge();
  }

  const MOD = { id: 'ChapterWordCount' };
  MOD.init = async (flags)=>{
    if (!flags.chapterWordCount) return;

    // Injecter le CSS UNE SEULE FOIS ici
    css`
.${NS}-wc-badge{ margin:.5rem 0; font-size:0.95rem; opacity:.85; }
    `;

    onReady(()=>{
      run();
      observe(document.body, debounce(run, 250));
      document.addEventListener(`${NS}:flags-updated`, async ()=>{
        const f = await getFlags();
        if (!f.chapterWordCount) {
          document.querySelectorAll(`.${NS}-wc-badge`).forEach(el=>el.remove());
        } else {
          run();
        }
      });
    });
  };

  AO3H.register(MOD);
})();
