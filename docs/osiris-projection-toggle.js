(() => {
  const STORAGE_KEY = 'osiris-pages:projection-mode';
  const STARTED = Date.now();
  const MAX_WAIT_MS = 15000;
  const MAPLIBRE_GLOBE_VERSION = '5.24.0';
  const MAPLIBRE_GLOBE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_GLOBE_VERSION}/dist/maplibre-gl.css`;
  const MAPLIBRE_GLOBE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_GLOBE_VERSION}/dist/maplibre-gl.js`;
  const CARTO_DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const GLOBE_LAYER_ID = 'globeMapLayer';

  const state = {
    active: false,
    loading: null,
    map: null,
    nodeIndex: new Map(),
    maplibre5: null,
    previousMaplibre: null
  };

  function getInitialMode() {
    const q = new URLSearchParams(location.search);
    const raw = (q.get('projection') || q.get('view') || q.get('mode') || '').toLowerCase();
    if (raw === 'globe' || raw === '3d' || raw === 'orbit') return 'globe';
    if (raw === 'mercator' || raw === '2d' || raw === 'map') return '2d';
    try { return localStorage.getItem(STORAGE_KEY) || '2d'; } catch { return '2d'; }
  }

  function storeMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
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
      .globe-map-layer{position:fixed;inset:0;z-index:2;opacity:0;pointer-events:none;background:#02030a;transition:opacity .18s ease;}
      body.osiris-globe-projection .globe-map-layer{opacity:1;pointer-events:auto;}
      body.osiris-globe-projection #realMapLayer{opacity:0!important;pointer-events:none!important;}
      body.osiris-globe-projection.osiris-primary-map.osiris-map-ready .globe-canvas{opacity:0!important;pointer-events:none!important;}
      body.osiris-globe-projection.osiris-primary-map.osiris-map-ready .space-vignette{background:radial-gradient(circle at 50% 48%,rgba(2,3,10,0) 0%,rgba(2,3,10,0) 48%,rgba(2,3,10,.34) 72%,rgba(2,3,10,.70) 100%),linear-gradient(180deg,rgba(2,3,10,.42),rgba(2,3,10,.02) 26%,rgba(2,3,10,.02) 70%,rgba(2,3,10,.48))!important;}
      body.osiris-globe-projection .maplibregl-canvas{background:#02030a;}
      @media(max-width:760px){.projection-toggle{left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 132px);width:48px;height:48px;border-radius:16px;}}
    `;
    document.head.appendChild(style);
  }

  function injectToggle() {
    if (document.getElementById('projectionToggle')) return document.getElementById('projectionToggle');
    const button = document.createElement('button');
    button.id = 'projectionToggle';
    button.type = 'button';
    button.className = 'projection-toggle';
    button.setAttribute('aria-label', 'Toggle 2D and globe map projection');
    button.innerHTML = '<span>2D</span>';
    document.body.appendChild(button);
    return button;
  }

  function ensureContainer() {
    const main = document.querySelector('.osiris-live') || document.body;
    let el = document.getElementById(GLOBE_LAYER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = GLOBE_LAYER_ID;
      el.className = 'globe-map-layer';
      main.insertBefore(el, main.firstChild);
    }
    return el;
  }

  function currentCamera() {
    const map = window.__osirisRealMap;
    try {
      const c = map?.getCenter?.();
      if (!c) throw new Error('No camera');
      return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing?.() || 0, pitch: 0 };
    } catch {
      return { center: [0, 40.4168], zoom: 3, bearing: 0, pitch: 0 };
    }
  }

  function setStatus(mode, ok = true) {
    const readout = document.getElementById('readout');
    const systemState = document.getElementById('systemState');
    const source = state.active && state.map ? state.map : window.__osirisRealMap;
    if (systemState) systemState.textContent = ok ? (mode === 'globe' ? 'GLOBE' : 'MAP READY') : '2D ONLY';
    if (readout && source) readout.textContent = `${ok ? (mode === 'globe' ? 'GLOBE' : '2D MAP') : 'GLOBE FAILED'} · Z ${source.getZoom().toFixed(2)}`;
  }

  function loadCss(href) {
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === href)) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function loadGlobeRuntime() {
    if (state.maplibre5) return Promise.resolve(state.maplibre5);
    if (state.loading) return state.loading;
    state.previousMaplibre = window.maplibregl;
    state.loading = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-osiris-maplibre-globe="${MAPLIBRE_GLOBE_VERSION}"]`);
      if (existing) {
        existing.addEventListener('load', () => { state.maplibre5 = window.maplibregl; resolve(state.maplibre5); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = MAPLIBRE_GLOBE_JS;
      script.async = true;
      script.dataset.osirisMaplibreGlobe = MAPLIBRE_GLOBE_VERSION;
      script.onload = () => { state.maplibre5 = window.maplibregl; resolve(state.maplibre5); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return Promise.all([loadCss(MAPLIBRE_GLOBE_CSS), state.loading]).then(([, lib]) => lib);
  }

  function addSourceSafe(map, id, source) {
    try { if (!map.getSource(id)) map.addSource(id, source); } catch {}
  }

  function addLayerSafe(map, layer, before) {
    if (map.getLayer(layer.id)) return;
    try { before ? map.addLayer(layer, before) : map.addLayer(layer); }
    catch { try { map.addLayer(layer); } catch {} }
  }

  function firstLabelLayer(map) {
    const layers = map.getStyle()?.layers || [];
    return layers.find((layer) => layer.type === 'symbol' && /label|place|road|name/i.test(layer.id))?.id;
  }

  function colorForNode(node) {
    const raw = typeof tone === 'function' ? tone(node?.tone || layerTone?.[node?.layer] || 'green', 1) : 'rgb(0,240,138)';
    const match = raw.match(/rgba?\(([^)]+)\)/);
    if (!match) return raw;
    const parts = match[1].split(',').map((value) => Number.parseFloat(value.trim()));
    return parts.length >= 3 ? `rgb(${parts[0]},${parts[1]},${parts[2]})` : raw;
  }

  function visibleNodeFeatures() {
    state.nodeIndex.clear();
    const nodes = Array.isArray(model?.visibleNodes) ? model.visibleNodes : [];
    return nodes.map((node, index) => {
      const lon = Number(node.lon);
      const lat = Number(node.lat);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
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
      const coordinates = (route.coordinates || []).map((point) => [Number(point[0]), Number(point[1])]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
      return coordinates.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { id: index, layer: route.layer || 'sdk_sea', color: '#1689d6' } } : null;
    }).filter(Boolean);
  }

  function syncGlobeData() {
    const map = state.map;
    if (!map || !map.isStyleLoaded?.()) return;
    addSourceSafe(map, 'globe-cables', { type: 'geojson', data: './data/submarine-cables.json' });
    addSourceSafe(map, 'globe-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    addSourceSafe(map, 'globe-nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = firstLabelLayer(map);
    addLayerSafe(map, { id: 'globe-cables-line', type: 'line', source: 'globe-cables', paint: { 'line-color': '#1689d6', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.18, 6, 0.38, 11, 0.62], 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.25, 6, 0.9, 12, 2.0] } }, before);
    addLayerSafe(map, { id: 'globe-routes-line', type: 'line', source: 'globe-routes', paint: { 'line-color': ['coalesce', ['get', 'color'], '#1689d6'], 'line-opacity': 0.42, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.28, 8, 1.2, 14, 2.4] } }, before);
    addLayerSafe(map, { id: 'globe-node-halo', type: 'circle', source: 'globe-nodes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 8, 12, 14, 20], 'circle-color': ['get', 'color'], 'circle-opacity': 0.24, 'circle-blur': 0.72 } });
    addLayerSafe(map, { id: 'globe-nodes', type: 'circle', source: 'globe-nodes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.8, 8, 5.6, 14, 9], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#05070f', 'circle-stroke-width': 1.6, 'circle-opacity': 0.96 } });
    addLayerSafe(map, { id: 'globe-node-labels', type: 'symbol', source: 'globe-nodes', minzoom: 8.5, layout: { 'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8.5, 10, 14, 14], 'text-offset': [0, 1.25], 'text-anchor': 'top' }, paint: { 'text-color': '#f5d96b', 'text-halo-color': '#02030a', 'text-halo-width': 1.8 } });
    map.getSource('globe-nodes')?.setData({ type: 'FeatureCollection', features: visibleNodeFeatures() });
    map.getSource('globe-routes')?.setData({ type: 'FeatureCollection', features: visibleRouteFeatures() });
    if (map.getLayer('globe-cables-line')) {
      const showCables = !!(model?.activeLayers?.sdk_sea || model?.activeLayers?.cables);
      map.setLayoutProperty('globe-cables-line', 'visibility', showCables ? 'visible' : 'none');
    }
  }

  async function ensureGlobeMap() {
    if (state.map) return state.map;
    const button = injectToggle();
    button.classList.add('loading');
    button.querySelector('span').textContent = '...';
    const container = ensureContainer();
    const maplibregl5 = await loadGlobeRuntime();
    const camera = currentCamera();
    return new Promise((resolve, reject) => {
      try {
        const map = new maplibregl5.Map({
          container,
          style: CARTO_DARK_MATTER,
          center: camera.center,
          zoom: Math.min(camera.zoom, 8.5),
          pitch: 0,
          bearing: camera.bearing || 0,
          minZoom: 1,
          maxZoom: 20,
          attributionControl: false,
          cooperativeGestures: false,
          fadeDuration: 0
        });
        state.map = map;
        window.__osirisGlobeMap = map;
        map.on('style.load', () => {
          try { map.setProjection({ type: 'globe' }); } catch (error) { console.warn('[osiris-projection-toggle] globe projection failed', error); }
          try { map.setRenderWorldCopies(false); } catch {}
          syncGlobeData();
        });
        map.on('load', () => {
          try { map.dragPan.enable(); map.scrollZoom.enable(); map.touchZoomRotate.enable(); map.doubleClickZoom.enable(); map.dragRotate.disable(); map.touchPitch.disable(); } catch {}
          syncGlobeData();
          button.classList.remove('loading');
          resolve(map);
        });
        map.on('click', 'globe-nodes', (event) => {
          const feature = event.features?.[0];
          const node = state.nodeIndex.get(feature?.properties?.nodeId);
          if (node && typeof selectNode === 'function') selectNode(node);
        });
        map.on('move', () => {
          const readout = document.getElementById('readout');
          if (readout && state.active) readout.textContent = `GLOBE · Z ${map.getZoom().toFixed(2)}`;
        });
        map.on('error', (event) => console.warn('[osiris-projection-toggle] globe map warning', event?.error || event));
      } catch (error) {
        button.classList.remove('loading');
        reject(error);
      }
    });
  }

  async function applyProjection(mode, remember = true) {
    const button = injectToggle();
    if (mode === 'globe') {
      try {
        const map = await ensureGlobeMap();
        const camera = currentCamera();
        map.jumpTo({ center: camera.center, zoom: Math.min(camera.zoom, 8.5), bearing: camera.bearing || 0, pitch: 0 });
        syncGlobeData();
        document.body.classList.add('osiris-globe-projection');
        button.classList.add('active');
        button.querySelector('span').textContent = 'GLB';
        state.active = true;
        if (remember) storeMode('globe');
        setStatus('globe', true);
        return true;
      } catch (error) {
        console.warn('[osiris-projection-toggle] globe unavailable', error);
        setStatus('2d', false);
        applyProjection('2d', true);
        return false;
      }
    }

    state.active = false;
    document.body.classList.remove('osiris-globe-projection');
    button.classList.remove('active', 'loading');
    button.querySelector('span').textContent = '2D';
    const realMap = window.__osirisRealMap;
    const globeMap = state.map;
    if (realMap && globeMap) {
      try {
        const center = globeMap.getCenter();
        realMap.jumpTo({ center: [center.lng, center.lat], zoom: globeMap.getZoom(), bearing: 0, pitch: 0 });
      } catch {}
    }
    if (remember) storeMode('2d');
    setStatus('2d', true);
    return true;
  }

  function patchLayerSync() {
    if (typeof updateLayerStatus !== 'function' || updateLayerStatus.__osirisProjectionPatched) return;
    const original = updateLayerStatus;
    updateLayerStatus = function osirisProjectionUpdateLayerStatus(...args) {
      const result = original.apply(this, args);
      if (state.map) setTimeout(syncGlobeData, 0);
      return result;
    };
    updateLayerStatus.__osirisProjectionPatched = true;
  }

  function install() {
    injectStyle();
    const button = injectToggle();
    const wait = () => {
      const map = window.__osirisRealMap;
      if (!map || typeof model === 'undefined') {
        if (Date.now() - STARTED < MAX_WAIT_MS) setTimeout(wait, 80);
        return;
      }

      patchLayerSync();
      button.addEventListener('click', () => {
        const next = state.active || document.body.classList.contains('osiris-globe-projection') ? '2d' : 'globe';
        applyProjection(next, true);
      });

      const initial = getInitialMode();
      if (initial === 'globe') applyProjection('globe', false);
      else applyProjection('2d', false);
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
