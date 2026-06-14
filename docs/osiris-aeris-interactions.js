'use strict';

(function () {
  const VERSION = '20260614-aeris-interactions-rescue';
  const MIN_PITCH = 0;
  const MAX_PITCH = 85;
  const MIN_ZOOM = 1.2;
  const MAX_ZOOM = 20;
  const HOME = { center: [-84.388, 33.749], zoom: 8.2, pitch: 76, bearing: -14 };
  const AIR_KEYS = ['flights', 'private', 'jets', 'military'];
  const GROUPS = [
    ['commercial_flights', 'flights', '#24dce9'],
    ['private_flights', 'private', '#f5d96b'],
    ['private_jets', 'jets', '#f5d96b'],
    ['military_flights', 'military', '#e83b7f']
  ];

  let wasActive = false;
  let markerLayer = null;
  let markerTimer = 0;

  function active() { return document.body.classList.contains('osiris-aeris-mode'); }
  function map() { return window.__osirisRealMap || null; }
  function mobile() { return window.matchMedia?.('(max-width: 760px)')?.matches === true; }
  function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, num(v, min))); }

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

  function enableAerisHandlers(m) {
    if (!m) return;
    setPitchCeiling(m);
    forceMercator(m);
    try { m.dragPan?.enable?.(); } catch {}
    try { m.scrollZoom?.enable?.(); } catch {}
    try { m.boxZoom?.enable?.(); } catch {}
    try { m.doubleClickZoom?.enable?.(); } catch {}
    try { m.touchZoomRotate?.enable?.(); } catch {}
    try { m.touchZoomRotate?.enableRotation?.(); } catch {}
    try { m.dragRotate?.enable?.(); } catch {}
    try { m.touchPitch?.enable?.(); } catch {}
    try { m.keyboard?.enable?.(); } catch {}
  }

  function disableAerisOnlyHandlers(m) {
    if (!m) return;
    try { m.dragRotate?.disable?.(); } catch {}
    try { m.touchPitch?.disable?.(); } catch {}
    try { m.touchZoomRotate?.enable?.(); } catch {}
  }

  function setCamera(next, duration = 120) {
    const m = map();
    if (!m) return;
    enableAerisHandlers(m);
    const camera = {
      center: next.center || m.getCenter(),
      zoom: clamp(next.zoom ?? m.getZoom(), MIN_ZOOM, MAX_ZOOM),
      pitch: clamp(next.pitch ?? m.getPitch(), MIN_PITCH, MAX_PITCH),
      bearing: next.bearing ?? m.getBearing(),
      duration
    };
    try { m.stop?.(); } catch {}
    try { m.easeTo(camera); } catch { try { m.jumpTo(camera); } catch {} }
    setTimeout(renderMarkers, duration + 40);
  }

  function setPitchAbsolute(pitch) {
    const m = map();
    if (!m) return;
    enableAerisHandlers(m);
    const camera = { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: clamp(pitch, MIN_PITCH, MAX_PITCH) };
    try { m.stop?.(); } catch {}
    try { m.jumpTo(camera); } catch {}
    try { m.setPitch?.(camera.pitch); } catch {}
    requestAnimationFrame(renderMarkers);
  }

  function pitchBy(delta) { const m = map(); if (m) setPitchAbsolute(num(m.getPitch?.(), 0) + delta); }
  function zoomBy(delta) { const m = map(); if (m) setCamera({ zoom: m.getZoom() + delta }, 120); }
  function resetBearing() { setCamera({ bearing: 0 }, 120); }
  function resetView() { setCamera({ center: HOME.center, zoom: mobile() ? 7.2 : HOME.zoom, pitch: HOME.pitch, bearing: HOME.bearing }, 340); }

  function ensureAirLayersOn() {
    if (typeof model === 'undefined' || !model.activeLayers) return;
    const anyOn = AIR_KEYS.some((key) => model.activeLayers[key] !== false);
    if (anyOn) return;
    for (const key of AIR_KEYS) model.activeLayers[key] = true;
    try { if (typeof updateLayerStatus === 'function') updateLayerStatus(); } catch {}
  }

  function feed() { return window.__osirisLastFlightFeed?.data || null; }
  function activeLayer(layer) { return typeof model === 'undefined' || !model.activeLayers || model.activeLayers[layer] !== false; }
  function glyphFor(f) { return /heli|h60|h47|ec|bell|r44/i.test(String(f?.model || f?.type || f?.aircraft_category || '')) ? '✚' : '✈'; }

  function aircraft() {
    const data = feed();
    const out = [];
    if (!data) return out;
    for (const [group, layer, color] of GROUPS) {
      if (!activeLayer(layer)) continue;
      const list = Array.isArray(data[group]) ? data[group] : [];
      for (const [index, f] of list.entries()) {
        const lat = num(f?.lat, NaN);
        const lon = num(f?.lng ?? f?.lon, NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        out.push({
          id: String(f?.icao24 || f?.hex || f?.registration || `${layer}:${index}:${lat}:${lon}`),
          lat, lon, layer, color,
          glyph: glyphFor(f),
          heading: ((num(f?.heading ?? f?.track ?? f?.trueTrack, 0) % 360) + 360) % 360
        });
      }
    }
    return out.slice(0, 750);
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
    if (!active() || !m) { layer.style.display = 'none'; layer.innerHTML = ''; return; }
    ensureAirLayersOn();
    layer.style.display = 'block';
    const w = window.innerWidth;
    const h = window.innerHeight;
    const html = [];
    for (const p of aircraft()) {
      let pt;
      try { pt = m.project([p.lon, p.lat]); } catch { continue; }
      if (!pt || pt.x < -40 || pt.y < -40 || pt.x > w + 40 || pt.y > h + 40) continue;
      const size = p.layer === 'military' ? 18 : p.layer === 'jets' ? 17 : 15;
      html.push(`<span style="position:absolute;left:${pt.x.toFixed(1)}px;top:${pt.y.toFixed(1)}px;width:${size}px;height:${size}px;margin-left:${(-size / 2).toFixed(1)}px;margin-top:${(-size / 2).toFixed(1)}px;display:grid;place-items:center;color:${p.color};font:900 ${size}px/1 ui-monospace,SFMono-Regular,Menlo,monospace;text-shadow:0 0 6px rgba(0,0,0,.92),0 0 14px ${p.color};transform:rotate(${p.heading}deg);opacity:.96;will-change:transform;">${p.glyph}</span>`);
    }
    layer.innerHTML = html.join('');
  }

  function injectCss() {
    if (document.getElementById('osirisAerisInteractionStyles')) return;
    const style = document.createElement('style');
    style.id = 'osirisAerisInteractionStyles';
    style.textContent = `
      body.osiris-aeris-mode{overscroll-behavior:none!important;}
      body.osiris-aeris-mode .real-map-layer,body.osiris-aeris-mode .maplibregl-canvas,body.osiris-aeris-mode .maplibregl-canvas-container{touch-action:none!important;overscroll-behavior:none!important;-webkit-user-select:none!important;user-select:none!important;}
      .aeris-camera-rail{position:fixed;right:max(12px,env(safe-area-inset-right));top:50%;z-index:532;transform:translateY(-50%);display:none;grid-template-columns:1fr;border:1px solid rgba(122,247,255,.14);border-radius:22px;background:linear-gradient(180deg,rgba(3,9,18,.74),rgba(3,7,15,.54));box-shadow:0 18px 52px rgba(0,0,0,.46),inset 0 0 24px rgba(122,247,255,.035);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow:hidden;pointer-events:auto;}
      body.osiris-aeris-mode .aeris-camera-rail{display:grid;}
      .aeris-camera-rail button{width:44px;height:45px;border:0;border-bottom:1px solid rgba(234,252,255,.08);background:transparent;color:rgba(234,252,255,.68);font:900 21px/1 ui-monospace,SFMono-Regular,Menlo,monospace;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;}
      .aeris-camera-rail button:last-child{border-bottom:0;}
      .aeris-camera-rail button:hover,.aeris-camera-rail button:focus-visible{color:#fff;background:rgba(122,247,255,.08);outline:none;}
      .aeris-camera-rail button:active{transform:scale(.92);color:#7af7ff;}
      body.osiris-aeris-mode .aeris-layer-fix{z-index:650!important;}
      body.osiris-aeris-mode .aeris-layer-fix-button{left:max(12px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 58px)!important;min-width:106px!important;height:50px!important;z-index:651!important;}
      body.osiris-aeris-mode .aeris-layer-fix-menu{position:fixed!important;left:max(10px,env(safe-area-inset-left))!important;right:max(10px,env(safe-area-inset-right))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 118px)!important;width:auto!important;max-height:min(58vh,440px)!important;z-index:652!important;overflow:auto!important;}
      body.osiris-aeris-mode .aeris-layer-fix-menu.open{display:block!important;}
      @media(max-width:760px){.aeris-camera-rail{right:max(10px,env(safe-area-inset-right));top:45%;border-radius:20px;}.aeris-camera-rail button{width:38px;height:40px;font-size:18px;}}
    `;
    document.head.appendChild(style);
  }

  function buildRail() {
    if (document.getElementById('aerisCameraRail')) return;
    const rail = document.createElement('section');
    rail.id = 'aerisCameraRail';
    rail.className = 'aeris-camera-rail';
    rail.setAttribute('aria-label', 'AERIS camera controls');
    rail.innerHTML = `
      <button type="button" data-aeris-camera="zoom-in" aria-label="Zoom in">+</button>
      <button type="button" data-aeris-camera="zoom-out" aria-label="Zoom out">−</button>
      <button type="button" data-aeris-camera="pitch-up" aria-label="Pitch camera up">⌃</button>
      <button type="button" data-aeris-camera="pitch-down" aria-label="Pitch camera down">⌄</button>
      <button type="button" data-aeris-camera="reset-bearing" aria-label="Reset bearing">↻</button>
      <button type="button" data-aeris-camera="reset-view" aria-label="Reset Aeris view">⌖</button>
    `;
    rail.addEventListener('click', (event) => {
      const action = event.target?.closest?.('[data-aeris-camera]')?.getAttribute('data-aeris-camera');
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'zoom-in') zoomBy(0.75);
      if (action === 'zoom-out') zoomBy(-0.75);
      if (action === 'pitch-up') pitchBy(22);
      if (action === 'pitch-down') pitchBy(-22);
      if (action === 'reset-bearing') resetBearing();
      if (action === 'reset-view') resetView();
    }, { capture: true, passive: false });
    document.body.appendChild(rail);
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

  function applyMode() {
    const m = map();
    if (!m) return;
    const isActive = active();
    if (isActive) {
      ensureAirLayersOn();
      enableAerisHandlers(m);
      if (!wasActive) {
        resetView();
        window.dispatchEvent(new CustomEvent('osiris:aeris-mode', { detail: { active: true } }));
      }
      renderMarkers();
    } else if (wasActive) {
      disableAerisOnlyHandlers(m);
      ensureMarkerLayer().style.display = 'none';
      try { m.easeTo({ pitch: 0, bearing: 0, duration: 260 }); } catch {}
      window.dispatchEvent(new CustomEvent('osiris:aeris-mode', { detail: { active: false } }));
    }
    wasActive = isActive;
  }

  function install() {
    injectCss();
    buildRail();
    const bind = () => {
      const m = map();
      if (!m) return setTimeout(bind, 200);
      setPitchCeiling(m);
      patchLayersButton();
      applyMode();
      if (!m.__osirisAerisInteractionEvents) {
        m.__osirisAerisInteractionEvents = true;
        m.on('style.load', () => setTimeout(() => { setPitchCeiling(m); applyMode(); renderMarkers(); }, 120));
        m.on('move', () => requestAnimationFrame(renderMarkers));
      }
    };
    bind();
    const observer = new MutationObserver(() => setTimeout(() => { patchLayersButton(); applyMode(); }, 20));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('osiris:flight-feed', () => requestAnimationFrame(renderMarkers));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderMarkers(); });
    markerTimer = window.setInterval(() => { patchLayersButton(); if (active()) { ensureAirLayersOn(); renderMarkers(); } }, 700);
    window.__osirisAerisInteractions = { version: VERSION, resetView, setCamera, pitchBy, renderMarkers };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
