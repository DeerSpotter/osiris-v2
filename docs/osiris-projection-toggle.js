(() => {
  const STARTED = Date.now();
  const MAX_WAIT_MS = 15000;
  const GLOBE_VERSION = '5.24.0';
  const GLOBE_STYLE = 'https://demotiles.maplibre.org/style.json';
  const GLOBE_LAYER_ID = 'globeMapFrame';

  const state = {
    active: false,
    frame: null,
    frameReady: false,
    nodeIndex: new Map(),
    syncTimer: 0
  };

  function urlWantsGlobe() {
    const q = new URLSearchParams(location.search);
    const raw = (q.get('projection') || q.get('view') || q.get('mode') || '').toLowerCase();
    return raw === 'globe' || raw === '3d' || raw === 'orbit';
  }

  function injectStyle() {
    if (document.getElementById('projectionToggleStyles')) return;
    const style = document.createElement('style');
    style.id = 'projectionToggleStyles';
    style.textContent = `
      .projection-toggle{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 140px);z-index:521;width:52px;height:52px;border:1px solid rgba(215,183,57,.42);border-radius:18px;background:rgba(5,7,17,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f5d96b;box-shadow:0 12px 34px rgba(0,0,0,.46),inset 0 0 18px rgba(215,183,57,.08);font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;display:grid;place-items:center;touch-action:manipulation;}
      .projection-toggle.active{background:rgba(215,183,57,.24);border-color:rgba(245,217,107,.88);color:#fff;text-shadow:0 0 10px rgba(245,217,107,.76);}
      .projection-toggle.loading{opacity:.72;pointer-events:none;}
      .projection-toggle:active{transform:scale(.96);}
      .globe-map-frame{position:fixed;inset:0;z-index:2;border:0;opacity:0;pointer-events:none;background:#02030a;transition:opacity .18s ease;}
      body.osiris-globe-projection .globe-map-frame{opacity:1;pointer-events:auto;}
      body.osiris-globe-projection #realMapLayer{opacity:0!important;pointer-events:none!important;}
      @media(max-width:760px){.projection-toggle{left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 132px);width:48px;height:48px;border-radius:16px;}}
    `;
    document.head.appendChild(style);
  }

  function injectToggle() {
    let button = document.getElementById('projectionToggle');
    if (button) return button;
    button = document.createElement('button');
    button.id = 'projectionToggle';
    button.type = 'button';
    button.className = 'projection-toggle';
    button.setAttribute('aria-label', 'Toggle 2D and 3D globe map');
    button.innerHTML = '<span>2D</span>';
    document.body.appendChild(button);
    return button;
  }

  function currentCamera() {
    const map = window.__osirisRealMap;
    try {
      const c = map?.getCenter?.();
      if (!c) throw new Error('No camera');
      return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: 0, pitch: 0 };
    } catch {
      return { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 };
    }
  }

  function colorForNode(node) {
    const raw = typeof tone === 'function' ? tone(node?.tone || layerTone?.[node?.layer] || 'green', 1) : 'rgb(0,240,138)';
    const match = String(raw).match(/rgba?\(([^)]+)\)/);
    if (!match) return raw;
    const parts = match[1].split(',').map((value) => Number.parseFloat(value.trim()));
    return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite) ? `rgb(${parts[0]},${parts[1]},${parts[2]})` : raw;
  }

  function visibleNodeFeatures() {
    state.nodeIndex.clear();
    const nodes = Array.isArray(model?.visibleNodes) ? model.visibleNodes : [];
    return nodes.map((node, index) => {
      const lon = Number(node.lon);
      const lat = Number(node.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      const id = `${node.layer || 'node'}:${index}:${lat.toFixed(5)}:${lon.toFixed(5)}`;
      state.nodeIndex.set(id, node);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { nodeId: id, label: node.label || '', layer: node.layer || '', color: colorForNode(node), priority: !!node.priority }
      };
    }).filter(Boolean);
  }

  function visibleRouteFeatures() {
    const routes = Array.isArray(model?.visibleRoutes) ? model.visibleRoutes : [];
    return routes.map((route, index) => {
      const coordinates = (route.coordinates || [])
        .map((point) => [Number(point[0]), Number(point[1])])
        .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
      return coordinates.length > 1 ? {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { id: index, layer: route.layer || 'sdk_sea', color: '#1689d6' }
      } : null;
    }).filter(Boolean);
  }

  function payload() {
    return {
      camera: currentCamera(),
      showCables: !!(model?.activeLayers?.sdk_sea || model?.activeLayers?.cables),
      nodes: { type: 'FeatureCollection', features: visibleNodeFeatures() },
      routes: { type: 'FeatureCollection', features: visibleRouteFeatures() }
    };
  }

  function setStatus(mode, ok = true) {
    const readout = document.getElementById('readout');
    const systemState = document.getElementById('systemState');
    const source = window.__osirisRealMap;
    if (systemState) systemState.textContent = ok ? (mode === 'globe' ? 'GLOBE' : 'MAP READY') : '2D ONLY';
    if (readout && source) readout.textContent = `${ok ? (mode === 'globe' ? 'GLOBE' : '2D MAP') : 'GLOBE FAILED'} · Z ${source.getZoom().toFixed(2)}`;
  }

  function globeDocument() {
    const base = new URL('.', location.href).href;
    const css = `https://unpkg.com/maplibre-gl@${GLOBE_VERSION}/dist/maplibre-gl.css`;
    const js = `https://unpkg.com/maplibre-gl@${GLOBE_VERSION}/dist/maplibre-gl.js`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<base href="${base}">
<link rel="stylesheet" href="${css}">
<style>
html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:#02030a;}
#map{position:absolute;inset:0;}
.maplibregl-canvas{outline:none;background:#02030a;}
.maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right,.maplibregl-ctrl-top-right{display:none!important;}
.status{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;padding:9px 12px;border:1px solid rgba(215,183,57,.34);border-radius:999px;background:rgba(5,7,17,.74);color:#f5d96b;font:800 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;pointer-events:none;}
body.ready .status{display:none;}
</style>
</head>
<body>
<div id="map"></div>
<div class="status" id="status">LOADING 3D GLOBE</div>
<script src="${js}"><\/script>
<script>
(() => {
  const STYLE = ${JSON.stringify(GLOBE_STYLE)};
  let map;
  let pending;
  let ready = false;
  function addSourceSafe(id, source) { try { if (!map.getSource(id)) map.addSource(id, source); } catch {} }
  function addLayerSafe(layer, before) { try { if (!map.getLayer(layer.id)) map.addLayer(layer, before); } catch { try { if (!map.getLayer(layer.id)) map.addLayer(layer); } catch {} } }
  function firstLabelLayer() { return (map.getStyle()?.layers || []).find((layer) => layer.type === 'symbol' && /label|place|road|name/i.test(layer.id))?.id; }
  function ensureOverlays() {
    if (!map || !map.isStyleLoaded()) return;
    addSourceSafe('globe-cables', { type: 'geojson', data: './data/submarine-cables.json' });
    addSourceSafe('globe-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    addSourceSafe('globe-nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = firstLabelLayer();
    addLayerSafe({ id: 'globe-cables-line', type: 'line', source: 'globe-cables', paint: { 'line-color': '#1689d6', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.16, 6, 0.34, 11, 0.58], 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.25, 6, 0.9, 12, 2.0] } }, before);
    addLayerSafe({ id: 'globe-routes-line', type: 'line', source: 'globe-routes', paint: { 'line-color': ['coalesce', ['get', 'color'], '#1689d6'], 'line-opacity': 0.42, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.28, 8, 1.2, 14, 2.4] } }, before);
    addLayerSafe({ id: 'globe-node-halo', type: 'circle', source: 'globe-nodes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 8, 12, 14, 20], 'circle-color': ['get', 'color'], 'circle-opacity': 0.24, 'circle-blur': 0.72 } });
    addLayerSafe({ id: 'globe-nodes', type: 'circle', source: 'globe-nodes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.8, 8, 5.6, 14, 9], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#05070f', 'circle-stroke-width': 1.6, 'circle-opacity': 0.96 } });
    addLayerSafe({ id: 'globe-node-labels', type: 'symbol', source: 'globe-nodes', minzoom: 7.5, layout: { 'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7.5, 10, 14, 14], 'text-offset': [0, 1.25], 'text-anchor': 'top' }, paint: { 'text-color': '#f5d96b', 'text-halo-color': '#02030a', 'text-halo-width': 1.8 } });
    if (pending) applyPayload(pending);
  }
  function applyPayload(data) {
    pending = data;
    if (!map || !map.isStyleLoaded()) return;
    try { map.getSource('globe-nodes')?.setData(data.nodes || { type: 'FeatureCollection', features: [] }); } catch {}
    try { map.getSource('globe-routes')?.setData(data.routes || { type: 'FeatureCollection', features: [] }); } catch {}
    try { if (map.getLayer('globe-cables-line')) map.setLayoutProperty('globe-cables-line', 'visibility', data.showCables ? 'visible' : 'none'); } catch {}
    const camera = data.camera || {};
    if (Array.isArray(camera.center)) {
      try { map.jumpTo({ center: camera.center, zoom: Math.min(Number(camera.zoom) || 2, 8.5), bearing: 0, pitch: 0 }); } catch {}
    }
  }
  window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'osiris-globe-sync') applyPayload(message.payload || {});
  });
  map = new maplibregl.Map({ container: 'map', style: STYLE, center: [0, 0], zoom: 2, minZoom: 1, maxZoom: 20, pitch: 0, bearing: 0, attributionControl: false, cooperativeGestures: false, fadeDuration: 0 });
  map.on('style.load', () => { try { map.setProjection({ type: 'globe' }); } catch {} try { map.setRenderWorldCopies(false); } catch {} ensureOverlays(); });
  map.on('load', () => { ready = true; document.body.classList.add('ready'); ensureOverlays(); parent.postMessage({ type: 'osiris-globe-ready' }, '*'); });
  map.on('idle', () => { if (!ready) { ready = true; document.body.classList.add('ready'); parent.postMessage({ type: 'osiris-globe-ready' }, '*'); } });
  map.on('click', 'globe-nodes', (event) => { const nodeId = event.features?.[0]?.properties?.nodeId; if (nodeId) parent.postMessage({ type: 'osiris-globe-node', nodeId }, '*'); });
  map.on('moveend', () => { try { const c = map.getCenter(); parent.postMessage({ type: 'osiris-globe-camera', camera: { center: [c.lng, c.lat], zoom: map.getZoom() } }, '*'); } catch {} });
  map.on('error', (event) => { console.warn('[osiris globe frame]', event?.error || event); });
})();
<\/script>
</body>
</html>`;
  }

  function ensureFrame() {
    if (state.frame) return state.frame;
    const main = document.querySelector('.osiris-live') || document.body;
    const frame = document.createElement('iframe');
    frame.id = GLOBE_LAYER_ID;
    frame.className = 'globe-map-frame';
    frame.title = 'OSIRIS 3D globe';
    frame.loading = 'eager';
    frame.referrerPolicy = 'no-referrer';
    frame.srcdoc = globeDocument();
    main.insertBefore(frame, main.firstChild);
    state.frame = frame;
    frame.addEventListener('load', () => setTimeout(() => syncFrame(true), 80));
    return frame;
  }

  function syncFrame(includeCamera = false) {
    if (!state.frame?.contentWindow) return;
    const data = payload();
    if (!includeCamera) delete data.camera;
    state.frame.contentWindow.postMessage({ type: 'osiris-globe-sync', payload: data }, '*');
  }

  function applyProjection(mode) {
    const button = injectToggle();
    if (mode === 'globe') {
      button.classList.add('loading');
      button.querySelector('span').textContent = '...';
      ensureFrame();
      document.body.classList.add('osiris-globe-projection');
      state.active = true;
      setTimeout(() => {
        syncFrame(true);
        button.classList.remove('loading');
        button.classList.add('active');
        button.querySelector('span').textContent = 'GLB';
        setStatus('globe', true);
      }, state.frameReady ? 60 : 600);
      return;
    }
    state.active = false;
    document.body.classList.remove('osiris-globe-projection');
    button.classList.remove('active', 'loading');
    button.querySelector('span').textContent = '2D';
    setStatus('2d', true);
  }

  function patchLayerSync() {
    if (typeof updateLayerStatus !== 'function' || updateLayerStatus.__osirisProjectionPatched) return;
    const original = updateLayerStatus;
    updateLayerStatus = function osirisProjectionUpdateLayerStatus(...args) {
      const result = original.apply(this, args);
      clearTimeout(state.syncTimer);
      state.syncTimer = setTimeout(() => { if (state.active) syncFrame(false); }, 0);
      return result;
    };
    updateLayerStatus.__osirisProjectionPatched = true;
  }

  function install() {
    injectStyle();
    const button = injectToggle();
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'osiris-globe-ready') { state.frameReady = true; if (state.active) syncFrame(true); }
      if (message.type === 'osiris-globe-node') {
        const node = state.nodeIndex.get(message.nodeId);
        if (node && typeof selectNode === 'function') selectNode(node);
      }
      if (message.type === 'osiris-globe-camera' && state.active && window.__osirisRealMap) {
        try { window.__osirisRealMap.jumpTo({ center: message.camera.center, zoom: message.camera.zoom, bearing: 0, pitch: 0 }); } catch {}
      }
    });
    const wait = () => {
      if (!window.__osirisRealMap || typeof model === 'undefined') {
        if (Date.now() - STARTED < MAX_WAIT_MS) setTimeout(wait, 80);
        return;
      }
      patchLayerSync();
      button.addEventListener('click', () => applyProjection(state.active ? '2d' : 'globe'));
      applyProjection(urlWantsGlobe() ? 'globe' : '2d');
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
