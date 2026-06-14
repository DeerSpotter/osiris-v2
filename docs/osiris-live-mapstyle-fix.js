(() => {
  const LIVE_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const WAIT_MS = 16000;
  const startedAt = Date.now();
  let installed = false;
  let sourceSyncTimer = null;

  function safe(fn) {
    try { return fn(); } catch { return undefined; }
  }

  function injectCriticalCss() {
    if (document.getElementById('osiris-live-mapstyle-css')) return;
    const style = document.createElement('style');
    style.id = 'osiris-live-mapstyle-css';
    style.textContent = `
      #realMapLayer.real-map-layer{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;background:#06070c!important;}
      body.real-map-mode #realMapLayer.real-map-layer,
      body.primary-real-map #realMapLayer.real-map-layer{z-index:6!important;}
      body.osiris-map-ready #realMapLayer.real-map-layer{opacity:1!important;pointer-events:auto!important;filter:none!important;}
      body.osiris-map-ready .maplibregl-map,
      body.osiris-map-ready .maplibregl-canvas-container,
      body.osiris-map-ready .maplibregl-canvas{width:100%!important;height:100%!important;opacity:1!important;filter:none!important;}
      body.osiris-map-ready .globe-canvas{opacity:0!important;pointer-events:none!important;}
      body.osiris-map-ready .space-vignette{background:linear-gradient(180deg,rgba(2,3,10,.18),rgba(2,3,10,0) 18%,rgba(2,3,10,0) 80%,rgba(2,3,10,.25))!important;}
      body.osiris-map-ready .scan-lines{opacity:.018!important;mix-blend-mode:screen!important;}
    `;
    document.head.appendChild(style);
  }

  function markReady(map) {
    document.body.classList.add('primary-real-map', 'real-map-mode', 'osiris-map-ready');
    const readout = document.getElementById('readout');
    if (readout && map?.getZoom) readout.textContent = `MAP READY · Z ${map.getZoom().toFixed(2)}`;
    safe(() => map.resize());
  }

  function colorForNode(node) {
    if (typeof tone === 'function') {
      const raw = tone(node.tone || (typeof layerTone !== 'undefined' && layerTone[node.layer]) || 'green', 1);
      const match = String(raw).match(/rgba?\(([^)]+)\)/);
      if (match) {
        const parts = match[1].split(',').map((x) => Number.parseFloat(x.trim()));
        if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
      }
      return raw;
    }
    return '#00f08a';
  }

  function currentNodes() {
    if (typeof model === 'undefined') return [];
    if (Array.isArray(model.visibleNodes)) return model.visibleNodes;
    const active = model.activeLayers || {};
    return (Array.isArray(model.nodes) ? model.nodes : []).filter((n) => !n.layer || active[n.layer] !== false);
  }

  function nodeFeatures() {
    return currentNodes().map((n, i) => {
      const lat = Number(n.lat);
      const lon = Number(n.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          nodeId: `${n.layer || 'node'}:${i}:${lat.toFixed(5)}:${lon.toFixed(5)}`,
          label: n.label || n.name || '',
          layer: n.layer || '',
          color: colorForNode(n),
          index: i
        }
      };
    }).filter(Boolean);
  }

  function firstSymbolLayer(map) {
    const layers = safe(() => map.getStyle().layers) || [];
    return layers.find((layer) => layer.type === 'symbol')?.id;
  }

  function ensureSource(map, id, source) {
    if (!safe(() => map.getSource(id))) safe(() => map.addSource(id, source));
  }

  function ensureLayer(map, layer, before) {
    if (!safe(() => map.getLayer(layer.id))) safe(() => map.addLayer(layer, before));
  }

  function ensureOsirisLayers(map) {
    if (!map || !safe(() => map.isStyleLoaded())) return false;
    const beforeLabels = firstSymbolLayer(map);

    ensureSource(map, 'cables', { type: 'geojson', data: './data/submarine-cables.json' });
    ensureSource(map, 'osirisNodes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    ensureLayer(map, {
      id: 'osiris-cables',
      type: 'line',
      source: 'cables',
      paint: {
        'line-color': '#1689d6',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.12, 6, 0.32, 12, 0.56, 17, 0.72],
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.18, 6, 0.85, 12, 1.8, 17, 2.8]
      }
    }, beforeLabels);

    ensureLayer(map, {
      id: 'osiris-node-halo',
      type: 'circle',
      source: 'osirisNodes',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 8, 10, 14, 18],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.22,
        'circle-blur': 0.6
      }
    });

    ensureLayer(map, {
      id: 'osiris-nodes',
      type: 'circle',
      source: 'osirisNodes',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.8, 8, 5.5, 14, 9],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#05070f',
        'circle-stroke-width': 1.8,
        'circle-opacity': 0.95
      }
    });

    ensureLayer(map, {
      id: 'osiris-labels',
      type: 'symbol',
      source: 'osirisNodes',
      minzoom: 7.2,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 14, 14, 18, 17],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'text-color': '#f5d96b',
        'text-halo-color': '#02030a',
        'text-halo-width': 1.8,
        'text-opacity': 0.96
      }
    });

    syncNodes(map);
    installClicks(map);
    return true;
  }

  function syncNodes(map) {
    const source = safe(() => map.getSource('osirisNodes'));
    if (!source?.setData) return;
    source.setData({ type: 'FeatureCollection', features: nodeFeatures() });
    const showCables = typeof model === 'undefined' || !!(model.activeLayers?.sdk_sea || model.activeLayers?.cables);
    if (safe(() => map.getLayer('osiris-cables'))) safe(() => map.setLayoutProperty('osiris-cables', 'visibility', showCables ? 'visible' : 'none'));
  }

  function installClicks(map) {
    if (map.__osirisLiveStyleClicks) return;
    map.__osirisLiveStyleClicks = true;
    safe(() => map.on('click', 'osiris-nodes', (event) => {
      const index = Number(event.features?.[0]?.properties?.index);
      const node = currentNodes()[index];
      if (!node || typeof selectNode !== 'function') return;
      selectNode(node);
      safe(() => map.easeTo({ center: [Number(node.lon), Number(node.lat)], zoom: Math.max(map.getZoom(), node.layer === 'cctv' ? 18 : 16), pitch: 0, duration: 260 }));
    }));
    safe(() => map.on('mouseenter', 'osiris-nodes', () => { map.getCanvas().style.cursor = 'pointer'; }));
    safe(() => map.on('mouseleave', 'osiris-nodes', () => { map.getCanvas().style.cursor = ''; }));
  }

  function scheduleSync(map) {
    if (sourceSyncTimer) clearInterval(sourceSyncTimer);
    sourceSyncTimer = setInterval(() => syncNodes(map), 2500);
    const originalUpdate = typeof updateLayerStatus === 'function' ? updateLayerStatus : null;
    if (originalUpdate && !originalUpdate.__osirisLiveStylePatch) {
      updateLayerStatus = function liveStyleUpdateLayerStatus() {
        const result = originalUpdate.apply(this, arguments);
        setTimeout(() => syncNodes(map), 0);
        return result;
      };
      updateLayerStatus.__osirisLiveStylePatch = true;
    }
  }

  function applyLiveStyle(map) {
    if (!map || map.__osirisLiveStyleApplied) return;
    map.__osirisLiveStyleApplied = true;
    window.__osirisRealMap = map;
    safe(() => map.setMaxZoom(20));
    safe(() => map.setMinZoom(1));
    safe(() => map.dragPan.enable());
    safe(() => map.scrollZoom.enable());
    safe(() => map.touchZoomRotate.enable());
    safe(() => map.doubleClickZoom.enable());
    safe(() => map.dragRotate.disable());
    safe(() => map.touchPitch.disable());

    const onReady = () => {
      if (ensureOsirisLayers(map)) {
        scheduleSync(map);
        markReady(map);
      }
    };

    safe(() => map.on('style.load', onReady));
    safe(() => map.on('load', onReady));
    safe(() => map.on('idle', onReady));
    safe(() => map.on('sourcedata', () => { if (!document.body.classList.contains('osiris-map-ready')) onReady(); }));

    const currentStyle = safe(() => map.getStyle().sprite) || '';
    if (!String(currentStyle).includes('cartocdn.com')) {
      safe(() => map.setStyle(LIVE_STYLE, { diff: false }));
    } else {
      onReady();
    }

    setTimeout(onReady, 1800);
    setTimeout(() => {
      if (!document.body.classList.contains('osiris-map-ready')) {
        document.body.classList.add('primary-real-map', 'real-map-mode');
        const status = document.getElementById('osirisMapStatus');
        if (status) status.textContent = 'Map style loading · fallback active';
      }
    }, 3500);
  }

  function waitForMap() {
    injectCriticalCss();
    const map = window.__osirisRealMap;
    if (map) {
      applyLiveStyle(map);
      return;
    }
    if (Date.now() - startedAt < WAIT_MS) return setTimeout(waitForMap, 80);
    const status = document.getElementById('osirisMapStatus');
    if (status) status.textContent = 'Map unavailable · globe fallback active';
  }

  function install() {
    if (installed) return;
    installed = true;
    waitForMap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
