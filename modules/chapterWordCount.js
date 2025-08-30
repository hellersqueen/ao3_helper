/* modules/chapterWordCount.js — per-chapter word counts (targets `.userstuff.module`, with robust fallbacks) */
;(function(){
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = AO3H.env?.NS || 'ao3h';
  const { onReady, observe, debounce, css, log } = AO3H.util || {};
  const Routes  = AO3H.routes || {};
  const Flags   = AO3H.flags;

  const MOD = 'ChapterWordCount';
  const ENABLE_KEY = `mod:${MOD}:enabled`;

  let enabled = false;

  // retry a few times to catch late inserts / slow skins
  const MAX_TRIES = 3;
  const DELAY_MS  = 600;
  let tries = 0;

  /* ---------- selectors & helpers ---------- */

  // containers to exclude from counting
  const EXCLUDE_SCOPES = '.preface, .summary, .notes, .endnotes, .chapter.preface';

  // primary: AO3 prose lives in `.userstuff.module` inside the chapter
  function proseNodesForChapter(ch){
    // 1) the canonical prose nodes
    let main = Array.from(ch.querySelectorAll('.userstuff.module'));
    main = main.filter(el => !el.closest(EXCLUDE_SCOPES));
    if (main.length) return main;

    // 2) fallback: any .userstuff inside the chapter
    let all = Array.from(ch.querySelectorAll('.userstuff'));
    all = all.filter(el => !el.closest(EXCLUDE_SCOPES));
    if (all.length) return all;

    // 3) last resort: sibling area between this chapter and the next
    return userstuffsBetweenChapters(ch);
  }

  // walk forward siblings until next .chapter; collect .userstuff there
  function userstuffsBetweenChapters(ch){
    const out = [];
    for (let n = ch.nextElementSibling; n; n = n.nextElementSibling){
      if (n.classList?.contains('chapter')) break; // stop at next chapter
      if (n.matches?.('.userstuff')) out.push(n);
      out.push(...(n.querySelectorAll?.('.userstuff') || []));
    }
    const main = out.filter(el => !el.closest(EXCLUDE_SCOPES));
    return main.length ? main : out;
  }

  // whole-page fallback (single-chapter or nonstandard markup)
  function userstuffsWholeWorkskin(){
    const ws = document.getElementById('workskin') || document.querySelector('#workskin') || document;
    const all = Array.from(ws.querySelectorAll('.userstuff.module, .userstuff'));
    const main = all.filter(el => !el.closest(EXCLUDE_SCOPES));
    return main.length ? main : all;
  }

  function textFromNodes(nodes){
    return nodes.map(n => n.innerText || '').join('\n');
  }

  function countWordsFromText(text){
    if (!text) return 0;
    const s = text.replace(/\s+/g, ' ').trim();
    if (!s) return 0;
    try {
      const tokens = s.match(/[\p{L}\p{N}’'-]+/gu);
      if (tokens) return tokens.length;
    } catch {}
    const simple = s.match(/\S+/g);
    return simple ? simple.length : 0;
  }

  function wordsForChapter(ch){
    let nodes = proseNodesForChapter(ch);
    if (!nodes.length) nodes = userstuffsWholeWorkskin();
    return countWordsFromText(textFromNodes(nodes));
  }

  function ensureStyles(){
    css(`
      .${NS}-wc-badge{
        margin:.5rem 0;
        font-size:.95rem;
        opacity:.85;
      }
    `, 'chapter-wc-style');
  }

  function setTextIfChanged(el, text){
    if (!el) return false;
    if (el.textContent === text) return false;
    el.textContent = text;
    return true;
  }

  function insertOrUpdateBadge(afterEl, words, scope='chapter'){
    if (!afterEl) return false;
    const content = `~ ${Number(words).toLocaleString()} words in this ${scope}`;
    const next = afterEl.nextElementSibling;
    if (next && next.classList?.contains(`${NS}-wc-badge`)) {
      return setTextIfChanged(next, content);
    }
    const el = document.createElement('div');
    el.className = `${NS}-wc-badge`;
    el.setAttribute('data-ao3h-mod', MOD);
    el.textContent = content;
    afterEl.insertAdjacentElement('afterend', el);
    return true;
  }

  /* ---------- main passes ---------- */

  function injectPerChapterBadges(){
    let chapters = Array.from(document.querySelectorAll('#chapters .chapter'));
    if (!chapters.length) chapters = Array.from(document.querySelectorAll('#workskin .chapter'));
    if (!chapters.length) return false;

    chapters.forEach(ch => {
      const words = wordsForChapter(ch);
      const header =
        ch.querySelector('h3.title, h2.heading, h3.heading, h2, h3') || ch;
      insertOrUpdateBadge(header, words, 'chapter');
    });
    return true;
  }

  function injectSingleChapterBadge(){
    const ws = document.getElementById('workskin') || document.querySelector('#workskin');
    if (!ws) return;
    const ch = ws.querySelector('.chapter') || ws;
    const words = wordsForChapter(ch);
    const anchor =
      ws.querySelector('h2.title, h2.heading, h3.title, h3.heading') ||
      ch.querySelector?.('h2, h3') ||
      ws;
    insertOrUpdateBadge(anchor, words, 'chapter');
  }

  function onRightPage(){
    return !!(Routes.isWork?.() || Routes.isChapter?.() || Routes.isWorkShow?.());
  }

  function runOnce(){
    if (!enabled || !onRightPage()) return;
    ensureStyles();
    const did = injectPerChapterBadges();
    if (!did) injectSingleChapterBadge();
  }

  function scheduleRuns(){
    tries = 0;
    const doRun = () => {
      tries++;
      try { runOnce(); } catch(e){ log?.err?.(`[${MOD}] run ${tries} failed`, e); }
      if (tries < MAX_TRIES) setTimeout(doRun, DELAY_MS);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(doRun, { timeout: 1200 });
    else setTimeout(doRun, 0);
  }

  function removeBadges(){
    document.querySelectorAll(`.${NS}-wc-badge,[data-ao3h-mod="${MOD}"]`).forEach(el => el.remove());
  }

  /* ---------- registration ---------- */

  AO3H.modules.register(MOD, { title: 'Chapter word count', enabledByDefault: true }, async function init(){
    enabled = !!Flags.get(ENABLE_KEY, true);

    onReady(() => {
      if (enabled) scheduleRuns();
      // re-check when AO3 injects pagination or changes DOM
      observe(document.body, debounce(scheduleRuns, 250));
    });

    Flags.watch(ENABLE_KEY, (val) => {
      const was = enabled;
      enabled = !!val;
      if (enabled && !was) scheduleRuns();
      else if (!enabled && was) removeBadges();
      else if (enabled && was) scheduleRuns(); // refresh values
    });

    log?.info?.(`[${MOD}] ready`);
  });

})();
