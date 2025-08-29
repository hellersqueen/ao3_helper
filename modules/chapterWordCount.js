/* modules/chapterWordCount.js — per-chapter word counts (safe & robust) */
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

  // Passes temporisées (0 boucle)
  let tries = 0;
  const MAX_TRIES = 3;
  const DELAY_MS  = 700;

  /* ---------- helpers ---------- */
  function countWordsFromText(text){
    if (!text) return 0;
    const s = text.replace(/\s+/g, ' ').trim();
    if (!s) return 0;
    let tokens = null;
    try { tokens = s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu); } catch {}
    if (!tokens) tokens = s.match(/\S+/g);
    return tokens ? tokens.length : 0;
  }

function wordsForChapter(ch){
  // 1) EXACTEMENT comme l'ancien : userstuff hors preface/summary/endnotes
  const all = Array.from(ch.querySelectorAll('.userstuff'));
  const main = all.filter(usd => !usd.closest('.preface, .summary, .endnotes'));
  const used = main.length ? main : all;

  // 2) EXACTEMENT comme l'ancien : innerText (pas textContent)
  const text = used.map(n => n.innerText || '').join('\n');

  // 3) EXACTEMENT comme l'ancien : regex Unicode, avec fallback
  let m = null;
  try { m = text.match(/[\p{L}\p{N}’'-]+/gu); } catch {}
  if (!m) m = text.match(/\S+/g);

  return m ? m.length : 0;
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
      return setTextIfChanged(next, content);
    }
    const el = document.createElement('div');
    el.className = `${NS}-wc-badge`;
    el.setAttribute('data-ao3h-mod', MOD);
    el.textContent = content;
    afterEl.insertAdjacentElement('afterend', el);
    return true;
  }

  function runOnce(){
    if (!enabled) return;
    if (!(Routes.isWork?.() || Routes.isChapter?.() || Routes.isWorkShow?.())) return;

    ensureStyles();

    // 1) Pages multi-chapitres
    let chapters = Array.from(document.querySelectorAll('#workskin .chapter'));
    if (!chapters.length) chapters = Array.from(document.querySelectorAll('#chapters .chapter'));

    if (chapters.length){
      for (const ch of chapters){
        const words  = wordsForChapter(ch);
        const header = ch.querySelector('h3.title, h2.heading, h3.heading, h2, h3') || ch;
        insertOrUpdateBadge(header, words);
      }
      return;
    }

    // 2) Page simple (une seule section)
    const workskin = document.getElementById('workskin') || document.querySelector('#workskin');
    if (workskin){
      const text = Array.from(workskin.querySelectorAll('.userstuff'))
        .filter(el => !el.closest('.preface') && !el.closest('.endnotes'))
        .map(el => el.textContent || '')
        .join('\n');
      const words = countWordsFromText(text);
      const anchor =
        workskin.querySelector('h2.title, h2.heading, h3.title, h3.heading') ||
        workskin.querySelector('.preface') || workskin;
      insertOrUpdateBadge(anchor, words);
    }
  }

  function scheduleRuns(){
    tries = 0;
    const once  = () => { tries++; guard(runOnce, `${MOD}:run:${tries}`); };
    const again = () => { if (!enabled || tries >= MAX_TRIES) return; setTimeout(()=>{ once(); again(); }, DELAY_MS); };
    if ('requestIdleCallback' in window) requestIdleCallback(()=>{ once(); again(); }, { timeout: 1500 });
    else setTimeout(()=>{ once(); again(); }, 0);
  }

  function start(){ scheduleRuns(); log.info?.(`[${MOD}] started (safe)`); }
  function stop(){
    document.querySelectorAll(`[data-ao3h-mod="${MOD}"], .${NS}-wc-badge`).forEach(el => el.remove());
    log.info?.(`[${MOD}] stopped`);
  }

  AO3H.modules.register(MOD, { title: 'Chapter word count', enabledByDefault: true }, async function init(){
    enabled = !!Flags.get(ENABLE_KEY, true);
    onReady(() => { if (enabled) start(); });
    Flags.watch(ENABLE_KEY, (val)=>{ enabled = !!val; enabled ? start() : stop(); });
    log.info?.(`[${MOD}] ready`);
  });

})();
