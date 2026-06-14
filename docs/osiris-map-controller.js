(() => {
  const MAPLIBRE_VERSION = '5.24.0';
  const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
  const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
  const CARTO_DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const DEFAULT_VIEW = { lat: 18, lon: 0, zoom: 1.45, projection: 'globe' };
  const MAP_LAYER_ID = 'realMapLayer';
  const DATA_SOURCE = 'osiris-nodes';
  const ROUTE_SOURCE = 'osiris-routes';
  const CABLE_SOURCE = 'osiris-cables';

  const state = {
    map: null,
    ready: false,
    installing: false,
    nodeIndex: new Map(),
    syncTimer: 0,
    selectedNode: null,
    usedFallbackStyle: false,
    projection: DEFAULT_VIEW.projection,
    basemap: 'dark'
  };

  function hasCore() {
    return typeof model !== 'undefined' &&
      typeof updateLayerStatus === 'function' &&
      typeof selectNode === 'function' &&
      typeof applyLayerSet === 'function' &&
      typeof activeLayerKeys === 'function' &&
      typeof layerKeys !== 'undefined' &&
      typeof layerTone !== 'undefined' &&
      typeof tone === 'function' &&
      typeof clamp === 'function' &&
      typeof normLon === 'function';
  }

  function clampNum(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function defaultZoom() {
    return window.matchMedia?.('(max-width: 760px)')?.matches ? 1.18 : DEFAULT_VIEW.zoom;
  }

  function parseView() {
    const q = new URLSearchParams(location.search);
    const rawProjection = (q.get('projection') || q.get('view') || q.get('mode') || DEFAULT_VIEW.projection).toLowerCase();
    const layerParam = q.get('layers') || '';
    return {
      lat: clampNum(q.get('lat'), -85, 85, DEFAULT_VIEW.lat),
      lon: clampNum(q.get('lon'), -180, 180, DEFAULT_VIEW.lon),
      zoom: clampNum(q.get('zoom'), 0, 20, defaultZoom()),
      projection: rawProjection === '2d' || rawProjection === 'map' || rawProjection === 'mercator' ? 'mercator' : 'globe',
      layers: layerParam.split(',').map((v) => v.trim()).filter(Boolean)
    };
  }

  function setStatus(title, meta, status = 'GLOBE') {
    const eventTitle = document.getElementById('eventTitle');
    const eventMeta = document.getElementById('eventMeta');
    const readout = document.getElementById('readout');
    const systemState = document.getElementById('systemState');
    if (title && eventTitle) eventTitle.textContent = title;
    if (meta && eventMeta) eventMeta.textContent = meta;
    if (readout && state.map) readout.textContent = `${status} · Z ${state.map.getZoom().toFixed(2)}`;
    if (systemState) systemState.textContent = status;
  }

  function injectStyle() {
    if (document.getElementById('osirisMapControllerStyles')) return;
    const style = document.createElement('style');
    style.id = 'osirisMapControllerStyles';
    style.textContent = `
      body.osiris-primary-map .real-map-layer{position:fixed;inset:0;z-index:2;opacity:1;pointer-events:auto;background:#02030a;touch-action:none;}
      body.osiris-primary-map:not(.osiris-map-ready) .real-map-layer{opacity:0;pointer-events:none;}
      body.osiris-primary-map.osiris-map-ready .globe-canvas{opacity:0!important;pointer-events:none!important;transition:opacity .22s ease;}
      body.osiris-primary-map.osiris-map-ready .space-vignette{background:linear-gradient(180deg,rgba(2,3,10,.44),rgba(2,3,10,.02) 24%,rgba(2,3,10,.02) 72%,rgba(2,3,10,.42))!important;z-index:3!important;pointer-events:none!important;}
      body.osiris-primary-map.osiris-map-ready .scan-lines{opacity:.035!important;z-index:4!important;pointer-events:none!important;}
      body.osiris-primary-map .floating-actions{display:none!important;}
      body.osiris-primary-map .maplibregl-canvas{touch-action:none!important;outline:none!important;background:#02030a!important;}
      body.osiris-primary-map .maplibregl-ctrl-bottom-left,body.osiris-primary-map .maplibregl-ctrl-bottom-right,body.osiris-primary-map .maplibregl-ctrl-top-right{display:none!important;}
      body.osiris-satellite-mode.osiris-primary-map.osiris-map-ready .space-vignette{background:linear-gradient(180deg,rgba(2,3,10,.26),rgba(2,3,10,.00) 22%,rgba(2,3,10,.00) 74%,rgba(2,3,10,.30))!important;}
      .map-loading-pill{position:fixed;left:50%;top:50%;z-index:9;transform:translate(-50%,-50%);padding:10px 14px;border:1px solid rgba(215,183,57,.32);border-radius:999px;background:rgba(5,7,17,.82);color:#f5d96b;font:800 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;pointer-events:none;box-shadow:0 18px 48px rgba(0,0,0,.5);}
      body.osiris-map-ready .map-loading-pill{display:none;}
      .projection-toggle{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 140px);z-index:521;width:52px;height:52px;border:1px solid rgba(215,183,57,.42);border-radius:18px;background:rgba(5,7,17,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f5d96b;box-shadow:0 12px 34px rgba(0,0,0,.46),inset 0 0 18px rgba(215,183,57,.08);font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;display:grid;place-items:center;touch-action:manipulation;}
      .projection-toggle.active{background:rgba(215,183,57,.24);border-color:rgba(245,217,107,.88);color:#fff;text-shadow:0 0 10px rgba(245,217,107,.76);}
      .projection-toggle:active{transform:scale(.96);}
      .panel-deck,.layer-drawer{touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}
      @media(max-width:760px){.projection-toggle{left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 132px);width:48px;height:48px;border-radius:16px;}}
    `;
    document.head.appendChild(style);
  }

  function ensureContainer() {
    const main = document.querySelector('.osiris-live') || document.body;
    let el = document.getElementById(MAP_LAYER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = MAP_LAYER_ID;
      el.className = 'real-map-layer';
      main.insertBefore(el, main.firstChild);
    }
    let pill = document.querySelector('.map-loading-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'map-loading-pill';
      pill.textContent = 'LOADING MAPLIBRE GLOBE';
      document.body.appendChild(pill);
    }
    document.body.classList.add('osiris-primary-map');
    return el;
  }

  function injectProjectionToggle() {
    let button = document.getElementById('projectionToggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'projectionToggle';
      button.type = 'button';
      button.className = 'projection-toggle';
      button.setAttribute('aria-label', 'Toggle 2D and globe map');
      document.body.appendChild(button);
    }
    const update = () => {
      button.classList.toggle('active', state.projection === 'globe');
      button.textContent = state.projection === 'globe' ? '2D' : '3D';
      document.body.classList.toggle('osiris-globe-projection', state.projection === 'globe');
    };
    button.addEventListener('click', () => setProjection(state.projection === 'globe' ? 'mercator' : 'globe'), { passive: true });
    update();
    return update;
  }

  function loadCss(href) {
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    if (window.maplibregl?.Map) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function satelliteStyle() {
    return withGlobeStyle({
      version: 8,
      sources: {
        satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
        satelliteLabels: { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Labels © Esri' },
        roadsLabels: { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Road labels © Esri' }
      },
      layers: [
        { id: 'satellite-base', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 1 } },
        { id: 'satellite-road-labels', type: 'raster', source: 'roadsLabels', minzoom: 7, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.20, 11, 0.58, 15, 0.74] } },
        { id: 'satellite-place-labels', type: 'raster', source: 'satelliteLabels', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.34, 7, 0.58, 12, 0.80] } }
      ]
    });
  }

  function fallbackStyle() {
    return withGlobeStyle({
      version: 8,
      sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
      layers: [{ id: 'osm-base', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.98 } }]
    });
  }

  function withGlobeStyle(style) {
    if (state.projection === 'globe') {
      style.projection = { type: 'globe' };
      style.sky = { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] };
      style.light = { anchor: 'map', position: [1.5, 90, 80] };
    } else {
      style.projection = { type: 'mercator' };
    }
    return style;
  }

  function colorForNode(node) {
    const raw = tone(node?.tone || layerTone[node?.layer] || 'green', 1);
    const match = raw.match(/rgba?\(([^)]+)\)/);
    if (!match) return raw;
    const parts = match[1].split(',').map((v) => Number.parseFloat(v.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some((v) => !Number.isFinite(v))) return raw;
    return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
  }

  function visibleRouteFeatures() {
    const routes = Array.isArray(model.visibleRoutes) ? model.visibleRoutes : [];
    return routes.map((r, i) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: (r.coordinates || []).map((p) => [Number(p[0]), Number(p[1])]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)) },
      properties: { id: i, layer: r.layer || 'sdk_sea', color: colorForNode({ tone: layerTone[r.layer] || 'blue' }), alpha: Number(r.alpha) || 0.35 }
    })).filter((f) => f.geometry.coordinates.length > 1);
  }

  function visibleNodeFeatures() {
    state.nodeIndex.clear();
    const nodes = Array.isArray(model.visibleNodes) ? model.visibleNodes : [];
    return nodes.map((n, i) => {
      const lon = Number(n.lon);
      const lat = Number(n.lat);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const id = `${n.layer || 'node'}:${i}:${lat.toFixed(5)}:${lon.toFixed(5)}`;
      state.nodeIndex.set(id, n);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { nodeId: id, label: n.label || '', layer: n.layer || '', source: n.source || '', color: colorForNode(n), priority: !!n.priority }
      };
    }).filter(Boolean);
  }

  function addSourceSafe(map, id, source) { if (!map.getSource(id)) map.addSource(id, source); }
  function addLayerSafe(map, layer, beforeId) {
    if (map.getLayer(layer.id)) return;
    try { beforeId ? map.addLayer(layer, beforeId) : map.addLayer(layer); }
    catch { try { map.addLayer(layer); } catch {} }
  }
  function firstLabelLayer(map) {
    const layers = map.getStyle()?.layers || [];
    return layers.find((l) => l.type === 'symbol' && /label|place|road|name/i.test(l.id))?.id;
  }

  function ensureProjection() {
    const map = state.map;
    if (!map?.setProjection) return;
    try { map.setProjection({ type: state.projection }); } catch {}
  }

  function ensureOverlayLayers() {
    const map = state.map;
    if (!map || !map.isStyleLoaded()) return;
    ensureProjection();
    addSourceSafe(map, CABLE_SOURCE, { type: 'geojson', data: './data/submarine-cables.json' });
    addSourceSafe(map, ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    addSourceSafe(map, DATA_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = firstLabelLayer(map);
    addLayerSafe(map, { id: 'osiris-cables-line', type: 'line', source: CABLE_SOURCE, paint: { 'line-color': '#1689d6', 'line-opacity': ['case', ['any', ['boolean', ['literal', !!model.activeLayers?.sdk_sea], false], ['boolean', ['literal', !!model.activeLayers?.cables], false]], ['interpolate', ['linear'], ['zoom'], 1, 0.16, 6, 0.36, 13, 0.66], 0], 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.25, 7, 1.0, 13, 2.1] } }, before);
    addLayerSafe(map, { id: 'osiris-routes-line', type: 'line', source: ROUTE_SOURCE, paint: { 'line-color': ['coalesce', ['get', 'color'], '#1689d6'], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.16, 8, 0.42, 14, 0.66], 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.28, 8, 1.1, 14, 2.4] } }, before);
    addLayerSafe(map, { id: 'osiris-node-halo', type: 'circle', source: DATA_SOURCE, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 8, 12, 14, 20, 19, 32], 'circle-color': ['get', 'color'], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.16, 10, 0.30, 18, 0.42], 'circle-blur': 0.7 } });
    addLayerSafe(map, { id: 'osiris-nodes', type: 'circle', source: DATA_SOURCE, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.8, 8, 5.5, 14, 8.5, 19, 12], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#05070f', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 12, 2.0], 'circle-opacity': 0.96 } });
    addLayerSafe(map, { id: 'osiris-node-labels', type: 'symbol', source: DATA_SOURCE, minzoom: 6.5, layout: { 'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6.5, 10, 14, 13, 19, 16], 'text-offset': [0, 1.25], 'text-anchor': 'top', 'text-allow-overlap': false, 'text-ignore-placement': false }, paint: { 'text-color': '#f5d96b', 'text-halo-color': '#02030a', 'text-halo-width': 1.8, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0.0, 9, 0.85, 14, 1.0] } });
    syncMapData();
  }

  function syncMapData() {
    const map = state.map;
    if (!map || !map.isStyleLoaded()) return;
    const nodes = { type: 'FeatureCollection', features: visibleNodeFeatures() };
    const routes = { type: 'FeatureCollection', features: visibleRouteFeatures() };
    map.getSource(DATA_SOURCE)?.setData(nodes);
    map.getSource(ROUTE_SOURCE)?.setData(routes);
    if (map.getLayer('osiris-cables-line')) {
      const showCables = !!(model.activeLayers?.sdk_sea || model.activeLayers?.cables);
      map.setLayoutProperty('osiris-cables-line', 'visibility', showCables ? 'visible' : 'none');
    }
    const feedCount = document.getElementById('feedCount');
    if (feedCount) feedCount.textContent = String(nodes.features.length);
  }

  function markReady() {
    if (state.ready) return;
    state.ready = true;
    document.body.classList.add('osiris-map-ready');
    setStatus('MAPLIBRE GLOBE READY', 'PINCH TO ZOOM · PAN MAP · TAP NODES FOR DETAIL', state.projection === 'globe' ? 'GLOBE' : 'MAP READY');
    setTimeout(() => state.map?.resize(), 60);
  }

  function setMapViewFromUrl(view) {
    model.view.targetLon = view.lon; model.view.lon = view.lon;
    model.view.targetLat = view.lat; model.view.lat = view.lat;
    model.view.zoom = view.zoom;
    state.projection = view.projection;
    if (view.layers.length) {
      const valid = view.layers.filter((key) => layerKeys.includes(key));
      if (valid.length) applyLayerSet(valid, 'custom');
    }
  }

  function installPanelTouchGuards() {
    const isPanelTarget = (target) => !!target?.closest?.('.panel-deck,.layer-drawer');
    ['wheel', 'pointerdown', 'pointermove', 'touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
      document.addEventListener(name, (event) => {
        if (!isPanelTarget(event.target)) return;
        event.stopPropagation();
        if ((name.startsWith('gesture') || (event.touches && event.touches.length > 1))) event.preventDefault();
      }, { capture: true, passive: false });
    });
  }

  function focusNodeOnMap(node, zoom = 15.5) {
    if (!state.map || !node) return;
    state.selectedNode = node;
    state.map.easeTo({ center: [Number(node.lon), Number(node.lat)], zoom: Math.max(state.map.getZoom(), zoom), duration: 420, pitch: 0, bearing: 0 });
  }

  function patchCoreFunctions() {
    const originalUpdateLayerStatus = updateLayerStatus;
    updateLayerStatus = function osirisMapControllerUpdateLayerStatus(...args) {
      const result = originalUpdateLayerStatus.apply(this, args);
      clearTimeout(state.syncTimer);
      state.syncTimer = setTimeout(() => { ensureOverlayLayers(); syncMapData(); }, 0);
      return result;
    };

    const originalSelectNode = selectNode;
    selectNode = function osirisMapControllerSelectNode(node) {
      const result = originalSelectNode.call(this, node);
      if (node) focusNodeOnMap(node, /cctv|live_news/i.test(node.layer || '') ? 17.5 : 14.5);
      return result;
    };

    const originalResetView = typeof resetView === 'function' ? resetView : null;
    resetView = function osirisMapControllerResetView() {
      if (originalResetView) originalResetView();
      state.map?.easeTo({ center: [DEFAULT_VIEW.lon, DEFAULT_VIEW.lat], zoom: defaultZoom(), pitch: 0, bearing: 0, duration: 420 });
    };

    document.querySelectorAll('.bottom-nav button').forEach((button) => {
      button.addEventListener('click', () => {
        model.selected = null;
        state.selectedNode = null;
        setTimeout(syncMapData, 60);
      }, { capture: true });
    });
  }

  function bindMapEvents(map) {
    map.on('style.load', () => { ensureProjection(); ensureOverlayLayers(); syncMapData(); });
    map.on('load', () => { ensureProjection(); ensureOverlayLayers(); syncMapData(); });
    map.once('idle', markReady);
    setTimeout(() => { if (map.isStyleLoaded()) markReady(); }, 4200);
    map.on('move', () => {
      const center = map.getCenter();
      model.view.targetLon = normLon(center.lng); model.view.lon = model.view.targetLon;
      model.view.targetLat = clamp(center.lat, -85, 85); model.view.lat = model.view.targetLat;
      model.view.zoom = clamp(map.getZoom(), 0, 20);
      const readout = document.getElementById('readout');
      if (readout) readout.textContent = `${state.projection === 'globe' ? 'GLOBE' : 'MAP'} · ${activeLayerKeys().length} LAYERS · Z ${map.getZoom().toFixed(2)}`;
    });
    map.on('click', 'osiris-nodes', (event) => {
      const feature = event.features?.[0];
      const node = state.nodeIndex.get(feature?.properties?.nodeId);
      if (!node) return;
      event.preventDefault();
      selectNode(node);
    });
    map.on('mouseenter', 'osiris-nodes', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'osiris-nodes', () => { map.getCanvas().style.cursor = ''; });
    map.on('error', (event) => {
      const message = String(event?.error?.message || '');
      if (!state.ready && !state.usedFallbackStyle && /style|sprite|glyph|source|tile|network|fetch|carto/i.test(message)) {
        state.usedFallbackStyle = true;
        try { map.setStyle(fallbackStyle(), { diff: false }); } catch {}
      }
    });
  }

  function setProjection(nextProjection) {
    state.projection = nextProjection === 'mercator' ? 'mercator' : 'globe';
    window.__osirisProjection = state.projection;
    const button = document.getElementById('projectionToggle');
    if (button) {
      button.classList.toggle('active', state.projection === 'globe');
      button.textContent = state.projection === 'globe' ? '2D' : '3D';
    }
    document.body.classList.toggle('osiris-globe-projection', state.projection === 'globe');
    ensureProjection();
    setStatus(state.projection === 'globe' ? 'MAPLIBRE GLOBE READY' : '2D MAP READY', state.projection === 'globe' ? 'NATIVE MAPLIBRE GLOBE PROJECTION' : 'MERCATOR MAP PROJECTION', state.projection === 'globe' ? 'GLOBE' : 'MAP READY');
    setTimeout(() => state.map?.resize(), 80);
  }

  function setBasemap(mode, remember = false) {
    const map = state.map;
    if (!map) return false;
    state.basemap = mode === 'satellite' ? 'satellite' : 'dark';
    document.body.classList.toggle('osiris-satellite-mode', state.basemap === 'satellite');
    try {
      const camera = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
      map.setStyle(state.basemap === 'satellite' ? satelliteStyle() : CARTO_DARK_MATTER, { diff: false });
      map.once('style.load', () => {
        try { map.jumpTo(camera); } catch {}
        ensureProjection();
        ensureOverlayLayers();
        syncMapData();
      });
      if (remember) localStorage.setItem('osiris-pages:map-style-mode', state.basemap);
    } catch {}
    setStatus(state.basemap === 'satellite' ? 'SATELLITE MAP READY' : 'MAPLIBRE GLOBE READY', state.basemap === 'satellite' ? 'ARCGIS IMAGERY · MAPLIBRE GLOBE' : 'CARTO DARK MATTER · MAPLIBRE GLOBE', state.basemap === 'satellite' ? 'SATELLITE' : (state.projection === 'globe' ? 'GLOBE' : 'MAP READY'));
    return true;
  }

  async function createMap(view) {
    ensureContainer();
    await Promise.all([loadCss(MAPLIBRE_CSS), loadScript(MAPLIBRE_JS)]);
    if (!window.maplibregl) throw new Error('MapLibre failed to load');
    const storedMode = (() => { try { return localStorage.getItem('osiris-pages:map-style-mode') || 'dark'; } catch { return 'dark'; } })();
    state.basemap = /satellite|sat|imagery/i.test(new URLSearchParams(location.search).get('map') || '') ? 'satellite' : storedMode;
    const map = new maplibregl.Map({
      container: MAP_LAYER_ID,
      style: state.basemap === 'satellite' ? satelliteStyle() : CARTO_DARK_MATTER,
      center: [view.lon, view.lat],
      zoom: view.zoom,
      pitch: 0,
      bearing: 0,
      maxZoom: 20,
      minZoom: 0,
      projection: { type: state.projection },
      attributionControl: false,
      cooperativeGestures: false,
      preserveDrawingBuffer: false,
      fadeDuration: 0
    });
    state.map = map;
    window.__osirisRealMap = map;
    window.__osirisMapLibreVersion = MAPLIBRE_VERSION;
    window.__osirisProjection = state.projection;
    window.__osirisSetProjection = setProjection;
    window.__osirisSetBasemap = setBasemap;
    document.body.classList.toggle('osiris-satellite-mode', state.basemap === 'satellite');
    try { map.dragPan.enable(); } catch {}
    try { map.scrollZoom.enable(); } catch {}
    try { map.touchZoomRotate.enable(); } catch {}
    try { map.doubleClickZoom.enable(); } catch {}
    try { map.dragRotate.disable(); } catch {}
    try { map.touchPitch.disable(); } catch {}
    injectProjectionToggle();
    bindMapEvents(map);
    return map;
  }

  async function install() {
    if (state.installing) return;
    state.installing = true;
    injectStyle();
    installPanelTouchGuards();
    const view = parseView();
    setMapViewFromUrl(view);
    patchCoreFunctions();
    setStatus('LOADING MAPLIBRE GLOBE', `CONNECTING MAPLIBRE ${MAPLIBRE_VERSION} · CARTO STYLE · OSIRIS LAYERS`, 'LOADING');
    try { await createMap(view); }
    catch (error) {
      console.warn('[osiris-map-controller] map failed, using static fallback', error);
      document.body.classList.add('osiris-map-failed');
      document.body.classList.remove('osiris-primary-map');
      setStatus('MAP FALLBACK ONLINE', 'REAL MAP FAILED TO LOAD', 'FALLBACK');
    }
  }

  function wait() {
    if (!hasCore()) return setTimeout(wait, 40);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  }

  wait();
})();