'use strict';

(function () {
  const VERSION = '20260614-aeris-rescue-final';
  const MAX_PITCH = 85;
  const MIN_PITCH = 0;
  const AIR_KEYS = ['flights', 'private', 'jets', 'military'];
  const GROUPS = [
    ['commercial_flights', 'flights', '#24dce9'],
    ['private_flights', 'private', '#f5d96b'],
    ['private_jets', 'jets', '#f5d96b'],
    ['military_flights', 'military', '#e83b7f']
  ];

  let markerLayer = null;
  let markerTimer = 0;
  let bound = false;

  function active() {
    return document.body.classList.contains('osiris-aeris-mode');
  }

  function map() {
    return window.__osirisRealMap || null;
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, num(value, min)));
  }

  function feed() {
    return window.__osirisLastFlightFeed?.data || null;
  }

  function ensureAirLayersOn() {
    if (typeof model === 'undefined' || !model.activeLayers) return;
    const anyOn = AIR_KEYS.some((key) => model.activeLayers[key] !== false);
    if (anyOn) return;
    for (const key of AIR_KEYS) model.activeLayers[key] = true;
    try { if (typeof updateLayerStatus === 'function') updateLayerStatus(); } catch {}
  }

  function setPitchCeiling(m) {
    if (!m) return;
    try { m.setMaxPitch?.(MAX_PITCH); } catch {}
    try { m.setMinPitch?.(MIN_PITCH); } catch {}
    try { if (m.transform) m.transform.maxPitch = MAX_PITCH; } catch {}
    try { if (m.transform) m.transform.minPitch = MIN_PITCH; } catch {}
  }

  function forceMercator(m) {
    try { window.__osirisSetProjection?.('mercator'); } catch {}
    try { m?.setProjection?.({ type: 'mercator' }); } catch {}
  }

  function setPitchAbsolute(nextPitch) {
    const m = map();
    if (!m) return;
    setPitchCeiling(m);
    forceMercator(m);
    const pitch = clamp(nextPitch, MIN_PITCH, MAX_PITCH);
    const camera = {
      center: m.getCenter(),
      zoom: m.getZoom(),
      bearing: m.getBearing(),
      pitch
    };
    try { m.stop?.(); } catch {}
    try { m.jumpTo(camera); } catch {}
    try { m.setPitch?.(pitch); } catch {}
    requestAnimationFrame(() => {
      try { m.jumpTo(camera); } catch {}
      renderMarkers();
    });
  }

  function pitchBy(delta) {
    const m = map();
    if (!m) return;
    setPitchAbsolute(num(m.getPitch?.(), 0) + delta);
  }

  function resetView() {
    const m = map();
    if (!m) return;
    setPitchCeiling(m);
    forceMercator(m);
    try { m.stop?.(); } catch {}
    try { m.easeTo({ center: [-84.388, 33.749], zoom: Math.max(m.getZoom(), 7.6), pitch: 76, bearing: -14, duration: 380 }); } catch {}
    setTimeout(renderMarkers, 420);
  }

  function activeLayer(layer) {
    if (typeof model === 'undefined' || !model.activeLayers) return true;
    return model.activeLayers[layer] !== false;
  }

  function glyphFor(flight) {
    const text = String(flight?.model || flight?.type || flight?.aircraft_category || '').toLowerCase();
    return /heli|h60|h47|ec|bell|r44/.test(text) ? '✚' : '✈';
  }

  function aircraft() {
    const data = feed();
    const output = [];
    if (!data) return output;
    for (const [group, layer, color] of GROUPS) {
      if (!activeLayer(layer)) continue;
      const list = Array.isArray(data[group]) ? data[group] : [];
      for (const [index, f] of list.entries()) {
        const lat = num(f?.lat, NaN);
        const lon = num(f?.lng ?? f?.lon, NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        output.push({
          id: String(f?.icao24 || f?.hex || f?.registration || `${layer}:${index}:${lat}:${lon}`),
          lat,
          lon,
          layer,
          color,
          glyph: glyphFor(f),
          heading: ((num(f?.heading ?? f?.track ?? f?.trueTrack, 0) % 360) + 360) % 360
        });
      }
    }
    return output.slice(0, 750);
  }

  function ensureMarkerLayer() {
    if (markerLayer) return markerLayer;
    markerLayer = document.createElement('div');
    markerLayer.id = 'aerisDomAircraftLayer';
    markerLayer.setAttribute('aria-hidden', 'true');
    markerLayer.style.cssText = 'position:fixed;inset:0;z-index:6;pointer-events:none;display:none;overflow:hidden;contain:layout style paint;';
    document.body.appendChild(markerLayer);
    return markerLayer;
  }

  function renderMarkers() {
    const m = map();
    const layer = ensureMarkerLayer();
    if (!active() || !m) {
      layer.style.display = 'none';
      layer.innerHTML = '';
      return;
    }
    ensureAirLayersOn();
    layer.style.display = 'block';
    const planes = aircraft();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const html = [];
    for (const plane of planes) {
      let point;
      try { point = m.project([plane.lon, plane.lat]); } catch { continue; }
      if (!point || point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40) continue;
      const size = plane.layer === 'military' ? 18 : plane.layer === 'jets' ? 17 : 15;
      html.push(`<span style="position:absolute;left:${point.x.toFixed(1)}px;top:${point.y.toFixed(1)}px;width:${size}px;height:${size}px;margin-left:${(-size / 2).toFixed(1)}px;margin-top:${(-size / 2).toFixed(1)}px;display:grid;place-items:center;color:${plane.color};font:900 ${size}px/1 ui-monospace,SFMono-Regular,Menlo,monospace;text-shadow:0 0 6px rgba(0,0,0,.92),0 0 14px ${plane.color};transform:rotate(${plane.heading}deg);opacity:.96;will-change:transform;">${plane.glyph}</span>`);
    }
    layer.innerHTML = html.join('');
  }

  function patchLayersButton() {
    const button = document.getElementById('aerisLayerFixButton');
    const menu = document.getElementById('aerisLayerFixMenu');
    if (!button || !menu || button.__aerisRescueBound) return;
    button.__aerisRescueBound = true;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = !menu.classList.contains('open');
      menu.classList.toggle('open', next);
      button.classList.toggle('active', next);
      button.setAttribute('aria-expanded', String(next));
    }, { capture: true, passive: false });
  }

  function injectCss() {
    if (document.getElementById('aerisRescueStyles')) return;
    const style = document.createElement('style');
    style.id = 'aerisRescueStyles';
    style.textContent = `
      body.osiris-aeris-mode .aeris-layer-fix{z-index:650!important;}
      body.osiris-aeris-mode .aeris-layer-fix-button{left:max(12px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 58px)!important;min-width:106px!important;height:50px!important;z-index:651!important;}
      body.osiris-aeris-mode .aeris-layer-fix-menu{position:fixed!important;left:max(10px,env(safe-area-inset-left))!important;right:max(10px,env(safe-area-inset-right))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 118px)!important;width:auto!important;max-height:min(58vh,440px)!important;z-index:652!important;overflow:auto!important;}
      body.osiris-aeris-mode .aeris-layer-fix-menu.open{display:block!important;}
      body.osiris-aeris-mode #aerisDomAircraftLayer{display:block;}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    if (bound) return;
    bound = true;
    injectCss();
    const m = map();
    if (m) {
      setPitchCeiling(m);
      m.on?.('move', () => requestAnimationFrame(renderMarkers));
      m.on?.('style.load', () => setTimeout(() => { setPitchCeiling(m); renderMarkers(); }, 180));
    }
    document.addEventListener('click', (event) => {
      const action = event.target?.closest?.('[data-aeris-camera]')?.getAttribute?.('data-aeris-camera');
      if (!active() || !action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'pitch-up') pitchBy(22);
      if (action === 'pitch-down') pitchBy(-22);
      if (action === 'reset-view') resetView();
    }, { capture: true, passive: false });
    window.addEventListener('osiris:flight-feed', () => requestAnimationFrame(renderMarkers));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderMarkers(); });
    const observer = new MutationObserver(() => {
      const m2 = map();
      if (active()) {
        ensureAirLayersOn();
        if (m2) { setPitchCeiling(m2); forceMercator(m2); }
      }
      patchLayersButton();
      renderMarkers();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    markerTimer = window.setInterval(() => {
      patchLayersButton();
      if (active()) {
        ensureAirLayersOn();
        renderMarkers();
      }
    }, 700);
    window.__osirisAerisRescue = { version: VERSION, renderMarkers, pitchBy, resetView };
  }

  function wait() {
    const m = map();
    if (!m) return setTimeout(wait, 200);
    bind();
    renderMarkers();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wait, { once: true });
  else wait();
})();
