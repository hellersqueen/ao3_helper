// ==UserScript==
// @name         AO3 Helper - Menu (Base Definitive)
// @namespace    ao3h
// @version      1.0.0
// @description  Panneau de réglages, toggles des modules, import/export JSON, sections extensibles.
// @match        https://archiveofourown.org/*
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

;(function(){
  'use strict';

  const AO3H = window.AO3H || {};
  const { env:{NS}, util:{ $, on, onReady, css, log }, flags:Flags, modules:Modules, bus:Bus } = AO3H;

  /* ============================== STYLES UI =============================== */
  css(`
    .${NS}-root {
      position: fixed; z-index: 99999; inset: auto 16px 16px auto;
      font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #222;
    }
    .${NS}-btn {
      background: #2f6; padding: .5em .8em; border-radius: 8px; border: none;
      box-shadow: 0 2px 6px rgba(0,0,0,.2); cursor: pointer;
    }
    .${NS}-panel {
      position: fixed; right: 16px; bottom: 16px; width: 360px; max-height: 70vh; overflow: auto;
      background: #fff; border: 1px solid #ccc; border-radius: 12px; box-shadow: 0 6px 30px rgba(0,0,0,.25);
      padding: 12px; display: none;
    }
    .${NS}-panel.${NS}-open { display: block; }
    .${NS}-hdr { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .${NS}-title { font-weight: 700; }
    .${NS}-close { border: none; background: transparent; font-size: 20px; cursor: pointer; }
    .${NS}-section { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #ddd; }
    .${NS}-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; }
    .${NS}-small { font-size: 12px; color: #666; }
    .${NS}-kbd { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .${NS}-toggle { inline-size: 46px; block-size: 26px; border-radius: 26px; background:#ccc; position:relative; cursor:pointer; }
    .${NS}-knob { position:absolute; inset: 3px auto 3px 3px; width:20px; height:20px; border-radius:50%; background:#fff; transition: transform .15s; }
    .${NS}-toggle.${NS}-on { background: #4caf50; }
    .${NS}-toggle.${NS}-on .${NS}-knob { transform: translateX(20px); }
    .${NS}-btnbar { display:flex; gap:8px; flex-wrap: wrap; }
    .${NS}-btn2 { background:#eee; border:1px solid #ccc; border-radius:6px; padding:.4em .6em; cursor:pointer; }
    .${NS}-area { width:100%; min-height: 120px; }
  `, 'menu-styles');

  /* =============================== STATE ================================== */
  let root, panel, openBtn;
  const customSections = []; // { id, title, render(el) }

  /* =========================== RENDER HELPERS ============================= */
  function toggleSwitch(on){
    const el = document.createElement('div');
    el.className = `${NS}-toggle` + (on ? ` ${NS}-on` : '');
    el.innerHTML = `<div class="${NS}-knob"></div>`;
    return el;
  }

  function row(labelLeft, rightEl){
    const r = document.createElement('div');
    r.className = `${NS}-row`;
    const span = document.createElement('span');
    span.textContent = labelLeft;
    r.append(span, rightEl);
    return r;
  }

  /* ============================ CORE SECTIONS ============================= */
  function renderAbout(el){
    const d = document.createElement('div');
    d.innerHTML = `
      <div class="${NS}-small">
        <b>AO3 Helper</b> — base menu.<br/>
        Appuyez sur <span class="${NS}-kbd">Ctrl+Alt+M</span> pour ouvrir/fermer.
      </div>`;
    el.append(d);
  }

  function renderGlobal(el){
    // Exemple: showMenuButton
    const key = 'ui:showMenuButton';
    const sw = toggleSwitch(!!Flags.get(key, true));
    on(sw, 'click', async ()=> {
      const next = !sw.classList.contains(`${NS}-on`);
      sw.classList.toggle(`${NS}-on`, next);
      await Flags.set(key, next);
      // bouton flottant
      openBtn?.classList.toggle(`${NS}-hidden`, !next);
    });
    el.append(row('Afficher le bouton flottant', sw));
  }

  function renderModules(el){
    // Toggler pour chaque module enregistré
    const mods = Modules.all();
    if (!mods.length){
      const p = document.createElement('div');
      p.className = `${NS}-small`;
      p.textContent = 'Aucun module enregistré pour le moment.';
      el.append(p);
      return;
    }
    for (const {name, meta, enabledKey} of mods){
      const sw = toggleSwitch(!!Flags.get(enabledKey, !!meta?.enabledByDefault));
      on(sw, 'click', async ()=>{
        const next = !sw.classList.contains(`${NS}-on`);
        sw.classList.toggle(`${NS}-on`, next);
        await Flags.set(enabledKey, next);
        // pas de reboot auto ici; le module lit cet état à l’initialisation
      });
      const label = meta?.title || name;
      el.append(row(label, sw));
    }
  }

  function renderImportExport(el){
    const bar = document.createElement('div'); bar.className = `${NS}-btnbar`;
    const ta = document.createElement('textarea'); ta.className = `${NS}-area`; ta.placeholder = 'Collez / copiez ici le JSON des réglages';
    const bExp = document.createElement('button'); bExp.className = `${NS}-btn2`; bExp.textContent = 'Exporter';
    const bImp = document.createElement('button'); bImp.className = `${NS}-btn2`; bImp.textContent = 'Importer';
    const bClr = document.createElement('button'); bClr.className = `${NS}-btn2`; bClr.textContent = 'Réinitialiser';

    on(bExp, 'click', ()=>{
      const data = {
        flags: AO3H.flags.getAll(),
        version: AO3H.env.VERSION,
        when: new Date().toISOString(),
      };
      ta.value = JSON.stringify(data, null, 2);
    });

    on(bImp, 'click', async ()=>{
      try{
        const data = JSON.parse(ta.value || '{}');
        if (data?.flags && typeof data.flags === 'object'){
          for (const [k,v] of Object.entries(data.flags)){
            await Flags.set(k, v);
          }
          rebuild(); // re-render UI
          alert('Réglages importés.');
        } else {
          alert('JSON invalide (pas de .flags)');
        }
      } catch(e){ alert('JSON invalide.'); }
    });

    on(bClr, 'click', async ()=>{
      if (!confirm('Réinitialiser tous les réglages ?')) return;
      // On réécrit les flags avec les defaults connus du core (déclenchera watchers)
      // NOTE: on ne connaît pas ici les defaults exacts — on force “vide”
      await AO3H.store.set('flags', {});       // GM
      AO3H.store.lsSet('flags', {});           // LS
      rebuild();
      alert('Réglages réinitialisés (vides). Rechargez la page pour appliquer.');
    });

    bar.append(bExp, bImp, bClr);
    el.append(bar, ta);
  }

  /* ============================== PANEL BUILD ============================== */
  function section(title){
    const s = document.createElement('div');
    s.className = `${NS}-section`;
    const h = document.createElement('div'); h.className = `${NS}-title`; h.textContent = title;
    s.append(h);
    return s;
  }

  function buildPanel(){
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = `${NS}-panel`;

    const hdr = document.createElement('div'); hdr.className = `${NS}-hdr`;
    const title = document.createElement('div'); title.className = `${NS}-title`; title.textContent = 'AO3 Helper';
    const close = document.createElement('button'); close.className = `${NS}-close`; close.textContent = '✕';
    on(close, 'click', ()=> panel.classList.remove(`${NS}-open`));
    hdr.append(title, close);

    const sAbout  = section('À propos');       renderAbout(sAbout);
    const sGlobal = section('Interface');      renderGlobal(sGlobal);
    const sMods   = section('Modules');        renderModules(sMods);
    const sIE     = section('Import / Export');renderImportExport(sIE);

    // Sections custom ajoutées par des modules
    const sCustomWrap = document.createElement('div');
    for (const sec of customSections){
      const s = section(sec.title);
      try{ sec.render(s); } catch(e){ log.err('custom section render', sec.id, e); }
      sCustomWrap.append(s);
    }

    panel.append(hdr, sAbout, sGlobal, sMods, sIE, sCustomWrap);
    document.body.append(panel);
    return panel;
  }

  function ensureButton(){
    if (root) return;
    root = document.createElement('div');
    root.className = `${NS}-root`;
    openBtn = document.createElement('button');
    openBtn.className = `${NS}-btn`;
    openBtn.textContent = 'AO3 Helper';
    root.append(openBtn);
    document.body.append(root);

    const showBtn = !!AO3H.flags.get('ui:showMenuButton', true);
    openBtn.classList.toggle(`${NS}-hidden`, !showBtn);

    on(openBtn, 'click', ()=> {
      buildPanel().classList.add(`${NS}-open`);
    });

    // Raccourci clavier
    on(document, 'keydown', (e)=>{
      if (e.ctrlKey && e.altKey && (e.key?.toLowerCase?.()==='m')){
        const p = buildPanel();
        p.classList.toggle(`${NS}-open`);
      }
    });
  }

  function rebuild(){
    // Re-génère tout le contenu du panel (sans le recréer à zéro)
    if (!panel) return buildPanel();
    panel.remove();
    panel = null;
    buildPanel();
  }

  /* =============================== API MENU =============================== */
  // Permet aux modules d’ajouter une section complète (titre + render(container))
  function addSection(id, title, renderFn){
    customSections.push({ id, title, render: renderFn });
    // si le panel existe déjà, on reconstruit
    if (panel) rebuild();
  }

  // Expose pour le core et les modules
  AO3H.menu = { addSection, rebuild };

  /* ================================ BOOT ================================== */
  onReady(()=>{
    ensureButton();
    buildPanel();

    // GM menu (Tampermonkey icône > Script commands…)
    try {
      GM_registerMenuCommand('AO3 Helper — Ouvrir', ()=> buildPanel().classList.add(`${NS}-open`));
      GM_registerMenuCommand('AO3 Helper — Import/Export rapide', ()=>{
        const p = buildPanel();
        p.classList.add(`${NS}-open`);
        // scroll jusqu’à la section IE
        p.querySelector(`.${NS}-section:nth-of-type(4)`)?.scrollIntoView({behavior:'smooth', block:'start'});
      });
    } catch {}

    // Quand le core lève des événements
    Bus.on('core:ready', ()=> log.info('Menu prêt.'));
  });

})();
