'use strict';

(function () {
  const VERSION = '20260614-aeris-controls-stable';
  const AIR_KEYS = ['flights', 'private', 'jets', 'military'];
  const STORAGE_KEY = 'osiris.aeris.controls';
  const CONTROL_DEFS = [
    ['aircraft', 'Aircraft', 'Flights, private, jets, military'],
    ['trails', 'Trails', 'AERIS trail and track overlays'],
    ['shipping', 'Shipping', 'Maritime lines and sea lanes'],
    ['weather', 'Weather', 'Weather and hazards'],
    ['airspace', 'Airspace', 'Air lattice overlays'],
    ['satellites', 'Satellites', 'Space objects'],
    ['labels', 'Labels', 'Aircraft and map labels']
  ];

  let menuOpen = false;
  let local = readLocal();
  let labelLayerIds = null;

  function active() { return document.body.classList.contains('osiris-aeris-mode'); }
  function map() { return window.__osirisRealMap || null; }
  function hasModel() { return typeof model !== 'undefined' && !!model.activeLayers; }
  function layerOn(key) { return hasModel() && model.activeLayers[key] !== false; }
  function anyOn(keys) { return keys.some(layerOn); }
  function aircraftOn() { return anyOn(AIR_KEYS); }
  function labelsOn() { return local.labels !== false; }
  function trailsOn() { return local.trails !== false; }

  function readLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { labels: saved.labels !== false, trails: saved.trails !== false };
    } catch {
      return { labels: true, trails: true };
    }
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(local)); } catch {}
  }

  function injectStyles() {
    if (document.getElementById('aerisControlsFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'aerisControlsFixStyles';
    style.textContent = `
      .aeris-layer-fix{position:fixed;inset:0;z-index:529;display:none;pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#eafcff;}
      body.osiris-aeris-mode .aeris-layer-fix{display:block;}
      .aeris-layer-fix-button{position:absolute;left:calc(max(14px,env(safe-area-inset-left)) + 66px);bottom:calc(max(14px,env(safe-area-inset-bottom)) + 82px);height:52px;min-width:76px;border:1px solid rgba(122,247,255,.34);border-radius:18px;background:rgba(3,9,18,.74);color:#eafcff;box-shadow:0 12px 34px rgba(0,0,0,.44),inset 0 0 18px rgba(122,247,255,.06);font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;display:grid;place-items:center;pointer-events:auto;touch-action:manipulation;cursor:pointer;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}
      .aeris-layer-fix-button.active{background:rgba(122,247,255,.16);border-color:rgba(122,247,255,.78);text-shadow:0 0 12px rgba(122,247,255,.72);}
      .aeris-layer-fix-menu{position:absolute;left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 146px);width:min(252px,calc(100vw - 28px));padding:10px;border:1px solid rgba(122,247,255,.18);border-radius:18px;background:linear-gradient(180deg,rgba(3,9,18,.80),rgba(3,7,15,.58));box-shadow:0 18px 52px rgba(0,0,0,.48),inset 0 0 26px rgba(122,247,255,.035);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);display:none;pointer-events:auto;}
      .aeris-layer-fix-menu.open{display:block;}
      .aeris-layer-fix-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:1px 2px 8px;color:rgba(234,252,255,.74);font-size:10px;font-weight:850;letter-spacing:.16em;text-transform:uppercase;}
      .aeris-layer-fix-head button{border:0;background:transparent;color:rgba(234,252,255,.66);font:900 15px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer;}
      .aeris-layer-fix-row{width:100%;display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;border:1px solid rgba(122,247,255,.10);border-radius:13px;background:rgba(0,0,0,.16);color:rgba(234,252,255,.78);padding:8px 9px;margin-top:6px;text-align:left;cursor:pointer;touch-action:manipulation;}
      .aeris-layer-fix-row.active{border-color:rgba(122,247,255,.34);background:rgba(122,247,255,.09);color:#fff;}
      .aeris-layer-fix-row:active,.aeris-layer-fix-button:active{transform:scale(.96);}
      .aeris-layer-fix-row .dot{width:8px;height:8px;border-radius:99px;background:rgba(234,252,255,.28);box-shadow:0 0 10px rgba(122,247,255,0);}
      .aeris-layer-fix-row.active .dot{background:#7af7ff;box-shadow:0 0 12px rgba(122,247,255,.75);}
      .aeris-layer-fix-copy{display:grid;gap:2px;min-width:0;}
      .aeris-layer-fix-copy strong{font-size:11px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .aeris-layer-fix-copy small{font-size:9px;color:rgba(234,252,255,.48);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .aeris-layer-fix-state{font-size:9px;font-weight:850;letter-spacing:.1em;color:rgba(234,252,255,.48);}
      .aeris-layer-fix-row.active .aeris-layer-fix-state{color:#7af7ff;}
      @media(max-width:760px){.aeris-layer-fix-button{left:calc(max(12px,env(safe-area-inset-left)) + 62px);bottom:calc(max(10px,env(safe-area-inset-bottom)) + 78px);height:48px;min-width:74px;border-radius:16px;}.aeris-layer-fix-menu{left:max(10px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 138px);width:min(238px,calc(100vw - 20px));}}
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    if (document.getElementById('aerisLayerFix')) return;
    const shell = document.createElement('aside');
    shell.id = 'aerisLayerFix';
    shell.className = 'aeris-layer-fix';
    shell.setAttribute('aria-label', 'AERIS layer controls');
    shell.innerHTML = `
      <button type="button" id="aerisLayerFixButton" class="aeris-layer-fix-button" aria-label="Open AERIS layer controls" aria-expanded="false">LAYERS</button>
      <section id="aerisLayerFixMenu" class="aeris-layer-fix-menu" aria-label="AERIS layer controls">
        <div class="aeris-layer-fix-head"><span>Layers</span><button type="button" id="aerisLayerFixClose" aria-label="Close layer controls">×</button></div>
        <div id="aerisLayerFixRows"></div>
      </section>
    `;
    document.body.appendChild(shell);
    document.getElementById('aerisLayerFixButton')?.addEventListener('click', () => setMenuOpen(!menuOpen));
    document.getElementById('aerisLayerFixClose')?.addEventListener('click', () => setMenuOpen(false));
    document.getElementById('aerisLayerFixRows')?.addEventListener('click', (event) => {
      const row = event.target?.closest?.('[data-aeris-fix-control]');
      if (row) toggleControl(row.getAttribute('data-aeris-fix-control'));
    });
    document.addEventListener('click', (event) => {
      if (!menuOpen || !active()) return;
      if (event.target?.closest?.('#aerisLayerFixMenu,#aerisLayerFixButton')) return;
      setMenuOpen(false);
    }, true);
    renderMenu();
  }

  function setMenuOpen(next) {
    menuOpen = !!next;
    document.getElementById('aerisLayerFixMenu')?.classList.toggle('open', menuOpen);
    document.getElementById('aerisLayerFixButton')?.classList.toggle('active', menuOpen);
    document.getElementById('aerisLayerFixButton')?.setAttribute('aria-expanded', String(menuOpen));
  }

  function controlState(key) {
    if (key === 'aircraft') return aircraftOn();
    if (key === 'trails') return trailsOn();
    if (key === 'shipping') return anyOn(['maritime', 'sdk_sea', 'cables']);
    if (key === 'weather') return anyOn(['weather']);
    if (key === 'airspace') return anyOn(['sdk_air']);
    if (key === 'satellites') return anyOn(['satellites']);
    if (key === 'labels') return labelsOn();
    return false;
  }

  function renderMenu() {
    const rows = document.getElementById('aerisLayerFixRows');
    if (!rows) return;
    rows.innerHTML = CONTROL_DEFS.map(([key, label, hint]) => {
      const on = controlState(key);
      return `<button type="button" class="aeris-layer-fix-row${on ? ' active' : ''}" data-aeris-fix-control="${key}" aria-pressed="${on}">
        <span class="dot"></span>
        <span class="aeris-layer-fix-copy"><strong>${label}</strong><small>${hint}</small></span>
        <span class="aeris-layer-fix-state">${on ? 'ON' : 'OFF'}</span>
      </button>`;
    }).join('');
  }

  function setKeys(keys, next) {
    if (!hasModel()) return;
    for (const key of keys) {
      if (!(key in model.activeLayers)) continue;
      model.activeLayers[key] = !!next;
      try { if (next && typeof ensureLayerFile === 'function') ensureLayerFile(key); } catch {}
    }
    if (!model.activeLayers.sdk_sea) model.activeLayers.cables = false;
    if (typeof updateLayerStatus === 'function') updateLayerStatus();
  }

  function toggleControl(key) {
    if (key === 'aircraft') setKeys(AIR_KEYS, !aircraftOn());
    if (key === 'shipping') setKeys(['maritime', 'sdk_sea', 'cables'], !controlState('shipping'));
    if (key === 'weather') setKeys(['weather'], !controlState('weather'));
    if (key === 'airspace') setKeys(['sdk_air'], !controlState('airspace'));
    if (key === 'satellites') setKeys(['satellites'], !controlState('satellites'));
    if (key === 'labels') { local.labels = !labelsOn(); saveLocal(); }
    if (key === 'trails') { local.trails = !trailsOn(); saveLocal(); }
    window.__osirisRefreshAerisAircraft?.();
    applyAll();
    renderMenu();
  }

  function getLabelLayerIds(m) {
    if (!labelLayerIds) {
      labelLayerIds = (m.getStyle?.().layers || [])
        .filter((layer) => layer.type === 'symbol' && /label|place|road|name|country|state|settlement/i.test(layer.id))
        .map((layer) => layer.id)
        .filter((id) => !/^osiris-aeris-aircraft/.test(id));
    }
    return labelLayerIds;
  }

  function styleLabelsAndTrails() {
    const m = map();
    if (!m?.isStyleLoaded?.()) return;
    const labelVisibility = !active() || labelsOn() ? 'visible' : 'none';
    for (const id of getLabelLayerIds(m)) {
      if (!m.getLayer(id)) continue;
      try { m.setLayoutProperty(id, 'visibility', labelVisibility); } catch {}
    }
    const trailVisibility = !active() || trailsOn() ? 'visible' : 'none';
    for (const layer of m.getStyle?.().layers || []) {
      if (!/trail|track|history|path/i.test(layer.id)) continue;
      if (/^osiris-aeris-aircraft/.test(layer.id)) continue;
      try { m.setLayoutProperty(layer.id, 'visibility', trailVisibility); } catch {}
    }
  }

  function applyAll() {
    if (!active()) setMenuOpen(false);
    styleLabelsAndTrails();
    renderMenu();
  }

  function install() {
    injectStyles();
    buildUi();
    const observer = new MutationObserver(() => requestAnimationFrame(applyAll));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const bindMap = () => {
      const m = map();
      if (!m || m.__osirisAerisControlsStableBound) return m ? undefined : setTimeout(bindMap, 250);
      m.__osirisAerisControlsStableBound = true;
      m.on('style.load', () => { labelLayerIds = null; setTimeout(applyAll, 120); });
      applyAll();
    };
    bindMap();
    window.__osirisAerisControlsFix = { version: VERSION, apply: applyAll };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
