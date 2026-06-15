'use strict';

(function () {
  const VERSION = '20260615-aeris-deck-iconlayer';
  const DECK_SCRIPT_ID = 'osirisAerisDeckGlScript';
  const DECK_SCRIPT_SRC = 'https://unpkg.com/deck.gl@9.2.11/dist.min.js';
  const MAP_SOURCE_ID = 'osiris-aeris-aircraft';
  const MAP_SYMBOL_LAYER_ID = 'osiris-aeris-aircraft-models';
  const DECK_LAYER_ID = 'osiris-aeris-aircraft-deck-icons';
  const AIRCRAFT_ICON_MAPPING = {
    aircraft: {
      x: 0,
      y: 0,
      width: 128,
      height: 128,
      anchorX: 64,
      anchorY: 64,
      mask: true
    }
  };
  const AIR_GROUPS = [
    ['commercial_flights', 'flights', [120, 225, 235, 235]],
    ['private_flights', 'private', [245, 217, 107, 235]],
    ['private_jets', 'jets', [255, 212, 95, 240]],
    ['military_flights', 'military', [232, 59, 127, 245]]
  ];

  let deckLoading = false;
  let atlasUrl = '';
  let animationFrame = 0;

  function map() {
    return window.__osirisRealMap || null;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function activeAirLayerKeys() {
    if (typeof model === 'undefined' || !model.activeLayers) return ['flights', 'private', 'jets', 'military'];
    return ['flights', 'private', 'jets', 'military'].filter((key) => !!model.activeLayers[key]);
  }

  function createAircraftAtlas() {
    // Ported from kewonit/aeris: a single canvas aircraft silhouette used by deck.gl IconLayer.
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';

    ctx.beginPath();
    ctx.moveTo(64, 6);
    ctx.lineTo(71, 19);
    ctx.lineTo(71, 33);
    ctx.lineTo(100, 44);
    ctx.lineTo(106, 52);
    ctx.lineTo(80, 53);
    ctx.lineTo(72, 56);
    ctx.lineTo(72, 88);
    ctx.lineTo(90, 101);
    ctx.lineTo(88, 108);
    ctx.lineTo(69, 99);
    ctx.lineTo(69, 121);
    ctx.lineTo(64, 126);
    ctx.lineTo(59, 121);
    ctx.lineTo(59, 99);
    ctx.lineTo(40, 108);
    ctx.lineTo(38, 101);
    ctx.lineTo(56, 88);
    ctx.lineTo(56, 56);
    ctx.lineTo(48, 53);
    ctx.lineTo(22, 52);
    ctx.lineTo(28, 44);
    ctx.lineTo(57, 33);
    ctx.lineTo(57, 19);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(64, 13);
    ctx.lineTo(67, 19);
    ctx.lineTo(64, 24);
    ctx.lineTo(61, 19);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    return canvas;
  }

  function getAircraftAtlasUrl() {
    if (!atlasUrl) {
      const canvas = createAircraftAtlas();
      atlasUrl = canvas ? canvas.toDataURL() : '';
    }
    return atlasUrl;
  }

  function altitudeColor(altMeters, fallbackColor) {
    const alt = Math.max(0, num(altMeters, 0));
    if (alt < 1200) return [36, 220, 233, 240];
    if (alt < 5500) return [90, 230, 245, 235];
    if (alt < 9000) return [120, 210, 255, 235];
    return fallbackColor;
  }

  function aircraftSizeMultiplier(flight, layer) {
    const modelText = String(flight?.model || flight?.aircraft_category || '').toUpperCase();
    if (/A380|B748|B744|B747|A340|C5|C17|KC|IL76|A124/.test(modelText)) return 1.3;
    if (/B77|B78|B76|A33|A35|A30/.test(modelText)) return 1.18;
    if (/CRJ|E17|E19|E75|DH8|AT7|SF34|REGIONAL/.test(modelText)) return 0.88;
    if (/C172|PA28|SR22|BE36|LIGHT|PISTON|PROP/.test(modelText)) return 0.72;
    if (/HELI|H60|H47|EC|BELL|R44|ROTOR/.test(modelText)) return 0.82;
    if (layer === 'military') return 1.02;
    if (layer === 'jets' || layer === 'private') return 0.92;
    return 1.0;
  }

  function currentFlights() {
    const data = window.__osirisLastFlightFeed?.data || null;
    const visible = new Set(activeAirLayerKeys());
    const flights = [];

    for (const [groupKey, layer, color] of AIR_GROUPS) {
      if (!visible.has(layer)) continue;
      for (const [index, flight] of asArray(data?.[groupKey]).entries()) {
        const lat = num(flight?.lat, NaN);
        const lon = num(flight?.lng ?? flight?.lon, NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const heading = ((num(flight?.heading ?? flight?.track, 0) % 360) + 360) % 360;
        const alt = num(flight?.alt, 0);
        flights.push({
          id: String(flight?.icao24 || flight?.hex || flight?.registration || `${layer}:${index}`).toLowerCase(),
          lat,
          lon,
          heading,
          alt,
          layer,
          model: flight?.model || '',
          color: altitudeColor(alt, color),
          size: 22 * aircraftSizeMultiplier(flight, layer),
          raw: flight
        });
      }
    }

    return flights;
  }

  function hideMapLibreGlyphLayer(m) {
    if (!m?.getLayer?.(MAP_SYMBOL_LAYER_ID)) return;
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'visibility', 'none'); } catch {}
    try { m.setPaintProperty(MAP_SYMBOL_LAYER_ID, 'text-opacity', 0); } catch {}
    try { m.setPaintProperty(MAP_SYMBOL_LAYER_ID, 'icon-opacity', 0); } catch {}
  }

  function showMapLibreFallback(m) {
    // Fallback still uses the kewonit/aeris canvas atlas, not Unicode text glyphs.
    if (!m || !m.isStyleLoaded?.() || !m.getLayer?.(MAP_SYMBOL_LAYER_ID)) return false;
    const imageId = 'aeris-aircraft-atlas-kewonit-style';
    const canvas = createAircraftAtlas();
    if (canvas && !m.hasImage?.(imageId)) {
      try { m.addImage(imageId, canvas, { pixelRatio: 2 }); } catch {}
    }
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'text-field', ''); } catch {}
    try { m.setPaintProperty(MAP_SYMBOL_LAYER_ID, 'text-opacity', 0); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'icon-image', imageId); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'icon-size', ['interpolate', ['linear'], ['zoom'], 1, 0.26, 7, 0.38, 12, 0.58, 18, 0.92]); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'icon-rotate', ['-', 360, ['get', 'heading']]); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'icon-rotation-alignment', 'map'); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'icon-pitch-alignment', 'map'); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'icon-allow-overlap', true); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'icon-ignore-placement', true); } catch {}
    try { m.setLayoutProperty(MAP_SYMBOL_LAYER_ID, 'visibility', document.body.classList.contains('osiris-aeris-mode') ? 'visible' : 'none'); } catch {}
    try { m.setPaintProperty(MAP_SYMBOL_LAYER_ID, 'icon-opacity', document.body.classList.contains('osiris-aeris-mode') ? 0.96 : 0); } catch {}
    return true;
  }

  function loadDeck(callback) {
    if (window.deck?.MapboxOverlay && window.deck?.IconLayer) {
      callback();
      return;
    }
    if (deckLoading) return;
    deckLoading = true;
    const script = document.createElement('script');
    script.id = DECK_SCRIPT_ID;
    script.src = DECK_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      deckLoading = false;
      callback();
    };
    script.onerror = () => {
      deckLoading = false;
      showMapLibreFallback(map());
    };
    document.head.appendChild(script);
  }

  function ensureOverlay(m) {
    if (!m || !window.deck?.MapboxOverlay) return null;
    if (m.__osirisAerisDeckOverlay) return m.__osirisAerisDeckOverlay;

    const overlay = new window.deck.MapboxOverlay({
      interleaved: false,
      pickingRadius: 6,
      useDevicePixels: 1,
      layers: []
    });
    m.addControl(overlay);
    m.__osirisAerisDeckOverlay = overlay;
    return overlay;
  }

  function applyDeckLayer() {
    const m = map();
    if (!m || !m.isStyleLoaded?.()) return false;
    const active = document.body.classList.contains('osiris-aeris-mode');
    const atlas = getAircraftAtlasUrl();
    if (!atlas) return false;

    hideMapLibreGlyphLayer(m);

    if (!window.deck?.IconLayer || !window.deck?.MapboxOverlay) {
      showMapLibreFallback(m);
      loadDeck(applyDeckLayer);
      return false;
    }

    const overlay = ensureOverlay(m);
    if (!overlay) return false;

    const flights = active ? currentFlights() : [];
    const layer = new window.deck.IconLayer({
      id: DECK_LAYER_ID,
      pickable: true,
      visible: active,
      data: flights,
      opacity: 1,
      getPosition: (d) => [d.lon, d.lat, 0],
      getIcon: () => 'aircraft',
      getSize: (d) => d.size,
      getColor: (d) => d.color,
      getAngle: (d) => 360 - d.heading,
      iconAtlas: atlas,
      iconMapping: AIRCRAFT_ICON_MAPPING,
      billboard: false,
      sizeUnits: 'pixels',
      sizeScale: 1,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      updateTriggers: {
        getPosition: animationFrame,
        getAngle: animationFrame,
        getColor: animationFrame,
        getSize: animationFrame
      }
    });

    animationFrame += 1;
    overlay.setProps({ layers: [layer] });
    return true;
  }

  function scheduleApply() {
    window.requestAnimationFrame(() => {
      applyDeckLayer();
    });
  }

  function waitLoop() {
    scheduleApply();
    window.setTimeout(waitLoop, document.body.classList.contains('osiris-aeris-mode') ? 900 : 2500);
  }

  function install() {
    window.__osirisAerisAircraftAssets = { version: VERSION, apply: applyDeckLayer };
    window.addEventListener('osiris:aeris-mode', scheduleApply);
    window.addEventListener('osiris:flight-feed', scheduleApply);
    window.addEventListener('osiris:layers-changed', scheduleApply);

    const bindStyleLoad = () => {
      const m = map();
      if (!m) return window.setTimeout(bindStyleLoad, 250);
      if (!m.__osirisAerisDeckAssetsBound) {
        m.__osirisAerisDeckAssetsBound = true;
        m.on('style.load', () => window.setTimeout(scheduleApply, 180));
      }
      loadDeck(scheduleApply);
      waitLoop();
    };
    bindStyleLoad();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
