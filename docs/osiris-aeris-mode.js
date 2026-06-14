'use strict';

(function () {
  const SOURCE_ID = 'osiris-aeris-aircraft';
  const HALO_LAYER_ID = 'osiris-aeris-aircraft-halo';
  const MODEL_LAYER_ID = 'osiris-aeris-aircraft-models';
  const LABEL_LAYER_ID = 'osiris-aeris-aircraft-labels';
  const AIR_LAYERS = ['flights', 'private', 'jets', 'military'];
  const AIR_GROUPS = [
    ['commercial_flights', 'flights', '#24dce9', 'Commercial'],
    ['private_flights', 'private', '#d7b739', 'Private'],
    ['private_jets', 'jets', '#f5d96b', 'Jet'],
    ['military_flights', 'military', '#e83b7f', 'Military']
  ];

  let installed = false;
  let active = false;
  let aircraftById = new Map();

  function css() {
    if (document.getElementById('osirisAerisModeStyles')) return;
    const style = document.createElement('style');
    style.id = 'osirisAerisModeStyles';
    style.textContent = `
      .aeris-toggle{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 252px);z-index:523;width:72px;height:48px;border:1px solid rgba(36,220,233,.50);border-radius:17px;background:rgba(3,9,18,.78);color:#24dce9;box-shadow:0 12px 34px rgba(0,0,0,.50),inset 0 0 20px rgba(36,220,233,.10);font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.15em;display:grid;place-items:center;touch-action:manipulation;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}
      .aeris-toggle.active{background:rgba(36,220,233,.20);border-color:rgba(36,220,233,.95);color:#fff;text-shadow:0 0 12px rgba(36,220,233,.82);}
      .aeris-toggle:active{transform:scale(.96);}
      .aeris-panel{position:fixed;right:max(14px,env(safe-area-inset-right));top:calc(max(14px,env(safe-area-inset-top)) + 88px);z-index:522;width:min(360px,calc(100vw - 28px));max-height:48vh;display:none;border:1px solid rgba(36,220,233,.38);border-radius:22px;background:linear-gradient(180deg,rgba(4,10,22,.88),rgba(3,6,14,.74));box-shadow:0 24px 70px rgba(0,0,0,.55),inset 0 0 26px rgba(36,220,233,.06);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow:hidden;color:#dffaff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
      body.osiris-aeris-mode .aeris-panel{display:block;}
      .aeris-head{padding:14px 15px 10px;border-bottom:1px solid rgba(36,220,233,.18);display:flex;align-items:center;justify-content:space-between;gap:10px;}
      .aeris-title{display:grid;gap:3px;}
      .aeris-title strong{color:#24dce9;font-size:13px;letter-spacing:.18em;}
      .aeris-title span{font-size:10px;color:rgba(223,250,255,.66);letter-spacing:.10em;}
      .aeris-close{width:34px;height:34px;border:1px solid rgba(245,217,107,.42);border-radius:14px;background:rgba(5,7,17,.78);color:#f5d96b;font:900 16px/1 ui-monospace,SFMono-Regular,Menlo,monospace;}
      .aeris-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 12px;border-bottom:1px solid rgba(36,220,233,.12);}
      .aeris-stat{border:1px solid rgba(36,220,233,.20);border-radius:14px;padding:8px 6px;background:rgba(0,0,0,.18);text-align:center;}
      .aeris-stat b{display:block;color:#f5d96b;font-size:13px;}
      .aeris-stat small{display:block;margin-top:3px;color:rgba(223,250,255,.62);font-size:8px;letter-spacing:.12em;}
      .aeris-list{max-height:calc(48vh - 150px);overflow:auto;-webkit-overflow-scrolling:touch;padding:7px 10px 12px;}
      .aeris-row{display:grid;grid-template-columns:30px 1fr auto;gap:8px;align-items:center;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.06);}
      .aeris-plane{font-size:18px;color:#24dce9;text-align:center;text-shadow:0 0 13px rgba(36,220,233,.8);transform:rotate(var(--hdg,0deg));}
      .aeris-row[data-layer="military"] .aeris-plane{color:#e83b7f;text-shadow:0 0 13px rgba(232,59,127,.8);}
      .aeris-row[data-layer="jets"] .aeris-plane,.aeris-row[data-layer="private"] .aeris-plane{color:#f5d96b;text-shadow:0 0 13px rgba(245,217,107,.72);}
      .aeris-main{min-width:0;}.aeris-main b{display:block;font-size:11px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.05em;}.aeris-main small{display:block;margin-top:2px;font-size:9px;color:rgba(223,250,255,.64);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.aeris-range{font-size:10px;color:#f5d96b;}
      @media(max-width:760px){.aeris-toggle{left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 238px);width:66px;height:46px;border-radius:16px;}.aeris-panel{top:calc(max(12px,env(safe-area-inset-top)) + 86px);right:max(10px,env(safe-area-inset-right));width:calc(100vw - 20px);max-height:42vh;}.aeris-list{max-height:calc(42vh - 150px);}}
    `;
    document.head.appendChild(style);
  }

  function getMap() { return window.__osirisRealMap || null; }
  function feedData() { return window.__osirisLastFlightFeed?.data || null; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function callsign(f) { return String(f?.callsign || f?.icao24 || f?.registration || 'LIVE FLIGHT').trim(); }
  function glyph(f) { return /heli|h60|h47|ec|bell|r44/i.test(String(f?.model || f?.aircraft_category || '')) ? '✚' : '✈'; }

  function activeAirLayerKeys() {
    if (typeof model === 'undefined' || !model.activeLayers) return AIR_LAYERS;
    return AIR_LAYERS.filter((key) => !!model.activeLayers[key]);
  }

  function featureId(f, layer, index) {
    return String(f?.icao24 || f?.hex || f?.registration || `${layer}:${callsign(f)}:${index}`).toLowerCase();
  }

  function allAircraftFeatures() {
    const data = feedData();
    const visible = new Set(activeAirLayerKeys());
    const features = [];
    aircraftById = new Map();
    for (const [groupKey, layer, color, category] of AIR_GROUPS) {
      if (!visible.has(layer)) continue;
      for (const [index, f] of asArray(data?.[groupKey]).entries()) {
        const lat = num(f?.lat, NaN);
        const lon = num(f?.lng ?? f?.lon, NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const id = featureId(f, layer, index);
        const heading = ((num(f?.heading ?? f?.track, 0) % 360) + 360) % 360;
        const node = { lat, lon, label: callsign(f), source: `AERIS · ${category} · ${f?.model || 'Unknown'} · ${Math.round(num(f?.speed_knots, 0))} kt · ${Math.round(num(f?.alt, 0))} m`, layer, tone: layer === 'military' ? 'red' : layer === 'flights' ? 'cyan' : 'gold', priority: layer === 'military' || layer === 'jets', url: '', aircraft: true, heading, model: f?.model || '', registration: f?.registration || '', speed_knots: f?.speed_knots || null, alt: f?.alt || 0 };
        aircraftById.set(id, node);
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { id, layer, callsign: node.label, model: node.model, registration: node.registration, category, color, glyph: glyph(f), heading, alt: num(f?.alt, 0), speed: num(f?.speed_knots, 0) } });
      }
    }
    return { type: 'FeatureCollection', features };
  }

  function firstLabelLayer(map) {
    const layers = map.getStyle()?.layers || [];
    return layers.find((l) => l.type === 'symbol' && /label|place|road|name/i.test(l.id))?.id;
  }

  function addLayerSafe(map, layer, before) {
    if (map.getLayer(layer.id)) return;
    try { before ? map.addLayer(layer, before) : map.addLayer(layer); }
    catch { try { map.addLayer(layer); } catch {} }
  }

  function setExistingCircleFilters(map) {
    const filter = ['!in', 'layer', ...AIR_LAYERS];
    for (const id of ['osiris-node-halo', 'osiris-nodes', 'osiris-node-labels']) {
      if (!map.getLayer(id)) continue;
      try { map.setFilter(id, filter); } catch {}
    }
  }

  function ensureAircraftLayers() {
    const map = getMap();
    if (!map || !map.isStyleLoaded()) return false;
    if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = firstLabelLayer(map);
    addLayerSafe(map, { id: HALO_LAYER_ID, type: 'circle', source: SOURCE_ID, layout: { visibility: 'none' }, paint: { 'circle-radius': 0, 'circle-color': ['get', 'color'], 'circle-opacity': 0, 'circle-blur': 0 } }, before);
    addLayerSafe(map, { id: MODEL_LAYER_ID, type: 'symbol', source: SOURCE_ID, layout: { 'text-field': ['get', 'glyph'], 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 13, 7, 17, 12, 23, 18, 34], 'text-rotate': ['get', 'heading'], 'text-rotation-alignment': 'map', 'text-pitch-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true, visibility: active ? 'visible' : 'none' }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#02030a', 'text-halo-width': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 12, 2.4], 'text-opacity': 0.98 } }, before);
    addLayerSafe(map, { id: LABEL_LAYER_ID, type: 'symbol', source: SOURCE_ID, minzoom: 7.2, layout: { 'text-field': ['get', 'callsign'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 9, 14, 12, 18, 15], 'text-offset': [0, 1.45], 'text-anchor': 'top', 'text-allow-overlap': false, 'text-ignore-placement': false, visibility: active ? 'visible' : 'none' }, paint: { 'text-color': '#f5d96b', 'text-halo-color': '#02030a', 'text-halo-width': 1.7, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 7.2, 0.0, 9, 0.9, 14, 1] } }, before);
    setExistingCircleFilters(map);
    return true;
  }

  function updateAircraftSource(force = false) {
    const map = getMap();
    if (!ensureAircraftLayers()) return;
    if (active && window.__osirisAerisAnimationActive && !force) return;
    map.getSource(SOURCE_ID)?.setData(allAircraftFeatures());
    updatePanel();
  }

  function distanceNm(aLat, aLon, bLat, bLon) {
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
    return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function buildUi() {
    css();
    let button = document.getElementById('aerisModeToggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'aerisModeToggle';
      button.type = 'button';
      button.className = 'aeris-toggle';
      button.textContent = 'AERIS';
      button.setAttribute('aria-label', 'Toggle AERIS aircraft mode');
      button.addEventListener('click', () => setAerisMode(!active));
      document.body.appendChild(button);
    }
    let panel = document.getElementById('aerisPanel');
    if (!panel) {
      panel = document.createElement('aside');
      panel.id = 'aerisPanel';
      panel.className = 'aeris-panel';
      panel.setAttribute('aria-label', 'AERIS local airspace panel');
      panel.innerHTML = `<div class="aeris-head"><div class="aeris-title"><strong>AERIS AIRSPACE</strong><span id="aerisLocation">LOCAL MAP CENTER</span></div><button type="button" class="aeris-close" aria-label="Close AERIS mode">×</button></div><div class="aeris-stats" id="aerisStats"></div><div class="aeris-list" id="aerisList"></div>`;
      panel.querySelector('.aeris-close')?.addEventListener('click', () => setAerisMode(false));
      document.body.appendChild(panel);
    }
  }

  function updatePanel(features = allAircraftFeatures().features) {
    const stats = document.getElementById('aerisStats');
    const list = document.getElementById('aerisList');
    const loc = document.getElementById('aerisLocation');
    if (!stats || !list) return;
    const map = getMap();
    const center = map?.getCenter?.();
    const cLat = center?.lat ?? 40.3;
    const cLon = center?.lng ?? -75.0;
    if (loc) loc.textContent = `${cLat.toFixed(2)}, ${cLon.toFixed(2)} · LOCAL VIEW`;
    const counts = AIR_LAYERS.map((layer) => features.filter((f) => f.properties.layer === layer).length);
    stats.innerHTML = [['FLT', counts[0]], ['PRI', counts[1]], ['JET', counts[2]], ['MIL', counts[3]]].map(([label, count]) => `<div class="aeris-stat"><b>${count}</b><small>${label}</small></div>`).join('');
    const nearest = features.map((f) => { const [lon, lat] = f.geometry.coordinates; return { f, d: distanceNm(cLat, cLon, lat, lon) }; }).sort((a, b) => a.d - b.d).slice(0, 18);
    list.innerHTML = nearest.map(({ f, d }) => { const p = f.properties; return `<button type="button" class="aeris-row" data-id="${p.id}" data-layer="${p.layer}"><span class="aeris-plane" style="--hdg:${p.heading || 0}deg">${p.glyph || '✈'}</span><span class="aeris-main"><b>${escapeHtml(p.callsign || 'LIVE FLIGHT')}</b><small>${escapeHtml(`${p.category || ''} · ${p.model || 'Unknown'} · ${Math.round(p.speed || 0)} kt · ${Math.round(p.alt || 0)} m`)}</small></span><span class="aeris-range">${Math.round(d)} nm</span></button>`; }).join('') || '<div class="aeris-row"><span class="aeris-plane">✈</span><span class="aeris-main"><b>NO VISIBLE AIRCRAFT</b><small>ENABLE FLIGHT LAYERS</small></span><span class="aeris-range">--</span></div>';
  }

  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  function selectAircraftById(id) {
    const node = aircraftById.get(String(id || '').toLowerCase());
    if (!node) return;
    if (typeof selectNode === 'function') selectNode(node);
  }

  function bindMapClicks() {
    const map = getMap();
    if (!map || map.__osirisAerisClicksBound) return;
    map.__osirisAerisClicksBound = true;
    map.on('click', MODEL_LAYER_ID, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      event.preventDefault();
      selectAircraftById(feature.properties?.id);
    });
    map.on('mouseenter', MODEL_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', MODEL_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });
    map.on('moveend', () => updatePanel());
    map.on('style.load', () => setTimeout(() => updateAircraftSource(true), 120));
  }

  function patchLayerStatus() {
    if (typeof updateLayerStatus !== 'function' || updateLayerStatus.__osirisAerisPatched) return;
    const originalUpdateLayerStatus = updateLayerStatus;
    updateLayerStatus = function osirisAerisUpdateLayerStatus(...args) {
      const result = originalUpdateLayerStatus.apply(this, args);
      window.setTimeout(() => updateAircraftSource(), 0);
      return result;
    };
    updateLayerStatus.__osirisAerisPatched = true;
  }

  function setAerisMode(next) {
    active = !!next;
    document.body.classList.toggle('osiris-aeris-mode', active);
    document.getElementById('aerisModeToggle')?.classList.toggle('active', active);
    const map = getMap();
    if (active) {
      if (typeof window.__osirisSetProjection === 'function') window.__osirisSetProjection('mercator');
      try { map?.dragRotate?.enable?.(); } catch {}
      try { map?.touchPitch?.enable?.(); } catch {}
      const center = map?.getCenter?.();
      if (map && center) map.easeTo({ center, zoom: Math.max(map.getZoom(), 7.8), pitch: 62, bearing: -18, duration: 620 });
    } else if (map) {
      try { map.dragRotate?.disable?.(); } catch {}
      try { map.touchPitch?.disable?.(); } catch {}
      map.easeTo({ pitch: 0, bearing: 0, duration: 420 });
    }
    updateAircraftSource(true);
    updatePanel();
    window.dispatchEvent(new CustomEvent('osiris:aeris-mode', { detail: { active } }));
  }

  function install() {
    if (installed) return;
    buildUi();
    const map = getMap();
    if (!map || typeof model === 'undefined') return;
    installed = true;
    window.__osirisSetAerisMode = setAerisMode;
    window.__osirisRefreshAerisAircraft = () => updateAircraftSource(true);
    patchLayerStatus();
    bindMapClicks();
    updateAircraftSource(true);
    window.addEventListener('osiris:flight-feed', () => updateAircraftSource());
    document.addEventListener('click', (event) => {
      const row = event.target?.closest?.('.aeris-row[data-id]');
      if (row) selectAircraftById(row.getAttribute('data-id'));
    });
  }

  function wait() {
    buildUi();
    install();
    if (!installed) window.setTimeout(wait, 250);
  }

  wait();
})();
