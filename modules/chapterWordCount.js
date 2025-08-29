/* modules/chapterWordCount.js — per-chapter word counts (robuste) */
;(function(){
  'use strict';

  const AO3H = window.AO3H || {};
  const NS   = AO3H.env?.NS || 'ao3h';

  const { onReady, css, log, guard } = AO3H.util;
  const Routes  = AO3H.routes;
  const Flags   = AO3H.flags;

  const MOD = 'ChapterWordCount';
  const ENABLE_KEY = `mod:${MOD}:enabled`;

  let enabled = false;
  let mo = null; // MutationObserver

  /* ---------------- helpers ---------------- */
  function collectMainUserstuffNodes(scopeEl){
    // Prend toutes les .userstuff mais exclut celles dans notes/summary/preface/endnotes
    const all = Array.from(scopeEl.querySelectorAll('.userstuff'));
    return all.filter(usd => !usd.closest('.preface, .summary, .endnotes, .notes'));
  }

  function countWordsFromText(text){
    if (!text) return 0;
    const s = text.replace(/\s+/g, ' ').trim();
    if (!s) return 0;

    // Regex “jolie” (Unicode) + fallback simple si non supporté
    let tokens = null;
    try {
      tokens = s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu);
    } catch { /* moteurs sans Unicode property escapes */ }
    if (!tokens) tokens = s.match(/\S+/g);

    return tokens ? tokens.length : 0;
  }

  function wordsForScope(scopeEl){
    const nodes = collectMainUserstuffNodes(scopeEl);
    const text  = nodes.map(n => n.textContent || n.innerText || '').join('\n');
    return countWordsFromText(text);
  }

  function ensureStyles(){
    css(`.${NS}-wc-badge{ margin:.5rem 0; font-size:.95rem; opacity:.85; }`, 'chapter-wc-style');
  }

  function insertBadge(afterEl, words){
    if (!afterEl) return;
    const content = `~ ${Number(words).toLocaleString()} words in this chapter`;
    const next = afterEl.nextElementSibling;
    if (next && next.classList?.contains(`${NS}-wc-badge`)) { next.textContent = content; return; }
    const el = document.createElement('div');
    el.className = `${NS}-wc-badge`;
    el.setAttribute('data-ao3h-mod', MOD);
    el.textContent = content;
    afterEl.insertAdjacentElement('afterend', el);
  }

  function updateBadges(){
    ensureStyles();

    // 1) Plusieurs chapitres
    let chapters = Array.from(document.querySelectorAll('#workskin .chapter'));
    if (!chapters.length) chapters = Array.from(document.querySelectorAll('#chapters .chapter'));

    if (chapters.length){
      for (const ch of chapters){
        const words  = wordsForScope(ch);
        const header = ch.querySelector('h3.title, h2.heading, h3.heading, h2, h3') || ch;
        insertBadge(header, words);
      }
      return;
    }

    // 2) Fallback: page simple sans .chapter
    const workskin = document.querySelector('#workskin');
    if (workskin){
      const words = wordsForScope(workskin);
      const anchor =
        workskin.querySelector('h2.title, h2.heading, h3.title, h3.heading') ||
        workskin.querySelector('.preface') || workskin;
      insertBadge(anchor, words);
    }
  }

  function start(){
    if (!enabled) return;
    if (!(Routes.isWork?.() || Routes.isChapter?.() || Routes.isWorkShow?.())) return;

    guard(updateBadges, `${MOD}:update`);

    // Observe les changements DOM (soft navigation, ajouts dynamiques…)
    try { mo?.disconnect(); } catch {}
    mo = new MutationObserver(() => { if (enabled) guard(updateBadges, `${MOD}:update`); });
    mo.observe(document.documentElement, { childList:true, subtree:true });
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
