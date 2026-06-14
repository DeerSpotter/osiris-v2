(() => {
  const DEFAULT_VIEW = { lon: -62, lat: 22, zoom: 1 };
  const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';

  const state = {
    installed: false,
    realMap: null,
    realMapReady: false,
    realMapLoading: null,
    realMapMode: false,
    nodeIndex: new Map(),
    syncing: false
  };

  function hasCore() {
    return typeof model !== 'undefined' &&
      typeof resize === 'function' &&
      typeof setZoom === 'function' &&
      typeof clamp === 'function' &&
      typeof normLon === 'function' &&
      typeof updateLayerStatus === 'function' &&
      typeof selectNode === 'function' &&
      typeof layerTone !== 'undefined' &&
      typeof tone === 'function';
  }

  function wait() {
    if (!hasCore()) return setTimeout(wait, 50);
    install();
  }

  function install() {
    if (state.installed) return;
    state.installed = true;
    injectStyle();
    installPanelTouchGuards();
    patchDeepZoom();
    patchLayerUpdates();
    installZoomButtons();
    installRealMapButton();
    installBottomNavReset();
    patchNodeSelectionSync();
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .panel-deck,.layer-drawer{touch-action:pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}
      .deep-zoom-controls{position:fixed;right:max(14px,env(safe-area-inset-right));top:50%;z-index:430;display:grid;gap:8px;transform:translateY(-50%);}
      .deep-zoom-controls button,.real-map-toggle{width:44px;height:44px;border:1px solid rgba(215,183,57,.32);border-radius:14px;background:rgba(5,7,17,.76);backdrop-filter:blur(14px);color:#f5d96b;box-shadow:0 10px 28px rgba(0,0,0,.42),inset 0 0 18px rgba(215,183,57,.07);font:800 18px ui-monospace,SFMono-Regular,Menlo,monospace;}
      .deep-zoom-controls button:active,.real-map-toggle:active{transform:scale(.96);border-color:rgba(245,217,107,.72);}
      .real-map-toggle{font-size:10px;letter-spacing:.08em;}
      .real-map-toggle.active{background:rgba(215,183,57,.22);color:#fff;border-color:rgba(245,217,107,.78);}
      .real-map-layer{position:fixed;inset:0;z-index:2;opacity:0;pointer-events:none;background:#02030a;transition:opacity .22s ease;}
      .real-map-mode .real-map-layer{opacity:1;pointer-events:auto;}
      .real-map-mode .globe-canvas{opacity:.18;pointer-events:none;}
      .real-map-mode .space-vignette{background:linear-gradient(180deg,rgba(2,3,10,.92) 0%,rgba(2,3,10,.32) 20%,transparent 45%,transparent 68%,rgba(2,3,10,.76) 100%);}
      .maplibregl-ctrl-bottom-left,.maplibregl-ctrl-bottom-right{display:none!important;}
      .maplibregl-popup-content{background:rgba(5,7,17,.94)!important;color:#eff5f8!important;border:1px solid rgba(215,183,57,.42)!important;border-radius:12px!important;font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace!important;box-shadow:0 18px 50px rgba(0,0,0,.55)!important;}
      .maplibregl-popup-tip{border-top-color:rgba(5,7,17,.94)!important;border-bottom-color:rgba(5,7,17,.94)!important;}
      @media(max-width:760px){.deep-zoom-controls{right:10px;top:44%;}.deep-zoom-controls button,.real-map-toggle{width:40px;height:40px;border-radius:13px;}.real-map-mode .telemetry-card{opacity:.72;}}
    `;
    document.head.appendChild(style);
  }

  function isPanelTarget(target) {
    return !!target?.closest?.('.panel-deck,.layer-drawer');
  }

  function installPanelTouchGuards() {
    document.addEventListener('wheel', (event) => {
      if (!isPanelTarget(event.target)) return;
      event.stopPropagation();
    }, { capture: true, passive: true });

    document.addEventListener('pointerdown', (event) => {
      if (isPanelTarget(event.target)) event.stopPropagation();
    }, { capture: true, passive: true });
    document.addEventListener('pointermove', (event) => {
      if (isPanelTarget(event.target)) event.stopPropagation();
    }, { capture: true, passive: true });

    document.addEventListener('touchstart', (event) => {
      if (!isPanelTarget(event.target)) return;
      event.stopPropagation();
      if (event.touches && event.touches.length > 1) event.preventDefault();
    }, { capture: true, passive: false });
    document.addEventListener('touchmove', (event) => {
      if (!isPanelTarget(event.target)) return;
      event.stopPropagation();
      if (event.touches && event.touches.length > 1) event.preventDefault();
    }, { capture: true, passive: false });

    ['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
      document.addEventListener(name, (event) => {
        if (!isPanelTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true, passive: false });
    });
  }

  function patchDeepZoom() {
    const originalResize = resize;
    resize = function mapControlsResize() {
      originalResize();
      const mobile = innerWidth < 760;
      const base = mobile ? innerWidth * 0.72 : Math.min(innerWidth, innerHeight) * 0.44;
      const max = Math.max(innerWidth, innerHeight) * (mobile ? 11.5 : 8.2);
      model.size.r = clamp(base * model.view.zoom, mobile ? 220 : 260, max);
    };

    setZoom = function mapControlsSetZoom(z) {
      model.view.zoom = clamp(z, 0.72, 16);
      resize();
      if (model.view.zoom > 1.2 && typeof ensureStates === 'function') ensureStates();
      if (model.view.zoom > 1.35 && typeof ensureFullLive === 'function') ensureFullLive();
      syncRealMapView();
    };
    resize();
  }

  function zoomBy(multiplier) {
    setZoom(model.view.zoom * multiplier);
  }

  function installZoomButtons() {
    const stack = document.createElement('div');
    stack.className = 'deep-zoom-controls';
    stack.innerHTML = `<button type="button" data-zoom-in aria-label="Zoom in">+</button><button type="button" data-zoom-out aria-label="Zoom out">−</button><button type="button" data-real-map class="real-map-toggle" aria-label="Toggle real map data">MAP</button>`;
    document.body.appendChild(stack);
    stack.querySelector('[data-zoom-in]')?.addEventListener('click', () => zoomBy(1.48));
    stack.querySelector('[data-zoom-out]')?.addEventListener('click', () => zoomBy(1 / 1.48));
    stack.querySelector('[data-real-map]')?.addEventListener('click', () => setRealMapMode(!state.realMapMode));

    const canvas = document.getElementById('globeCanvas');
    let lastTap = 0;
    canvas?.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < 320) zoomBy(1.65);
      lastTap = now;
    }, { passive: true });
  }

  function installBottomNavReset() {
    document.querySelectorAll('.bottom-nav button').forEach((button) => {
      button.addEventListener('click', () => {
        model.selected = null;
        model.searchText = '';
        model.view.targetLon = DEFAULT_VIEW.lon;
        model.view.targetLat = DEFAULT_VIEW.lat;
        setZoom(DEFAULT_VIEW.zoom);
        const deck = document.getElementById('panelDeck');
        deck?.classList.remove('node-detail', 'compact-selected');
        syncRealMapView(true);
      }, { capture: true });
    });
  }

  function patchLayerUpdates() {
    const originalUpdateLayerStatus = updateLayerStatus;
    updateLayerStatus = function mapControlsUpdateLayerStatus() {
      originalUpdateLayerStatus();
      syncRealMapData();
    };
  }

  function patchNodeSelectionSync() {
    const originalSelectNode = selectNode;
    selectNode = function mapControlsSelectNode(node) {
      originalSelectNode(node);
      if (!node) return;
      syncRealMapView(true, node);
    };
  }

  function installRealMapButton() {
    const main = document.querySelector('.osiris-live') || document.body;
    if (!document.getElementById('realMapLayer')) {
      const div = document.createElement('div');
      div.id = 'realMapLayer';
      div.className = 'real-map-layer';
      main.insertBefore(div, main.firstChild);
    }
  }

  function loadCss(href) {
    if ([...document.styleSheets].some((sheet) => sheet.href === href)) return Promise.resolve();
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
    if (window.maplibregl) return Promise.resolve();
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

  function realMapStyle() {
    return {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors © CARTO'
        },
        cables: { type: 'geojson', data: './data/submarine-cables.json' },
        osirisNodes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
      },
      layers: [
        { id: 'carto-base', type: 'raster', source: 'carto', paint: { 'raster-opacity': 0.84 } },
        { id: 'osiris-cables', type: 'line', source: 'cables', paint: { 'line-color': '#1689d6', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.16, 8, 0.34, 12, 0.52], 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.22, 7, 0.9, 12, 1.7] } },
        { id: 'osiris-node-halo', type: 'circle', source: 'osirisNodes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 8, 10, 14, 18], 'circle-color': ['get', 'color'], 'circle-opacity': 0.22, 'circle-blur': 0.6 } },
        { id: 'osiris-nodes', type: 'circle', source: 'osirisNodes', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.8, 8, 5.5, 14, 9], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#05070f', 'circle-stroke-width': 1.8, 'circle-opacity': 0.95 } },
        { id: 'osiris-labels', type: 'symbol', source: 'osirisNodes', minzoom: 7.2, layout: { 'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 14, 14], 'text-offset': [0, 1.2], 'text-anchor': 'top' }, paint: { 'text-color': '#f5d96b', 'text-halo-color': '#02030a', 'text-halo-width': 1.5, 'text-opacity': 0.9 } }
      ]
    };
  }

  async function ensureRealMap() {
    if (state.realMapReady) return state.realMap;
    if (state.realMapLoading) return state.realMapLoading;
    state.realMapLoading = Promise.all([loadCss(MAPLIBRE_CSS), loadScript(MAPLIBRE_JS)]).then(() => new Promise((resolve, reject) => {
      if (!window.maplibregl) return reject(new Error('MapLibre failed to load'));
      const map = new maplibregl.Map({
        container: 'realMapLayer',
        style: realMapStyle(),
        center: [model.view.targetLon || DEFAULT_VIEW.lon, model.view.targetLat || DEFAULT_VIEW.lat],
        zoom: globeToMapZoom(model.view.zoom),
        pitch: 28,
        bearing: 0,
        attributionControl: false,
        maxZoom: 17,
        minZoom: 1
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        state.realMap = map;
        state.realMapReady = true;
        syncRealMapData();
        syncRealMapView(true);
        resolve(map);
      });
      map.on('moveend', () => {
        if (!state.realMapMode || state.syncing) return;
        const center = map.getCenter();
        model.view.targetLon = normLon(center.lng);
        model.view.targetLat = clamp(center.lat, -72, 78);
        const nextZoom = mapToGlobeZoom(map.getZoom());
        if (Math.abs(nextZoom - model.view.zoom) > 0.15) setZoom(nextZoom);
      });
      map.on('click', 'osiris-nodes', (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.nodeId;
        const node = state.nodeIndex.get(id);
        if (!node) return;
        model.view.targetLon = node.lon;
        model.view.targetLat = clamp(node.lat, -72, 78);
        setZoom(Math.max(model.view.zoom, 6));
        selectNode(node);
      });
      map.on('mouseenter', 'osiris-nodes', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'osiris-nodes', () => { map.getCanvas().style.cursor = ''; });
      map.on('error', () => {});
    })).catch((error) => {
      console.warn('[osiris-map] real map unavailable', error);
      state.realMapLoading = null;
      return null;
    });
    return state.realMapLoading;
  }

  function globeToMapZoom(z) {
    return clamp(2.2 + Math.log2(Math.max(0.72, z)) * 2.25, 1.2, 16.5);
  }

  function mapToGlobeZoom(z) {
    return clamp(2 ** ((z - 2.2) / 2.25), 0.72, 16);
  }

  function setRealMapMode(on) {
    state.realMapMode = !!on;
    document.body.classList.toggle('real-map-mode', state.realMapMode);
    document.querySelector('[data-real-map]')?.classList.toggle('active', state.realMapMode);
    if (!state.realMapMode) return;
    ensureRealMap().then(() => {
      syncRealMapData();
      syncRealMapView(true);
    });
  }

  function colorForNode(node) {
    const raw = tone(node.tone || layerTone[node.layer] || 'green', 1);
    const match = raw.match(/rgba?\(([^)]+)\)/);
    if (!match) return raw;
    const parts = match[1].split(',').map((x) => Number.parseFloat(x.trim()));
    if (parts.length < 3 || parts.some((x, i) => i < 3 && !Number.isFinite(x))) return raw;
    return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
  }

  function syncRealMapData() {
    if (!state.realMapReady || !state.realMap?.getSource('osirisNodes')) return;
    state.nodeIndex.clear();
    const features = [];
    const nodes = Array.isArray(model.visibleNodes) ? model.visibleNodes : [];
    const limit = Math.min(nodes.length, model.view.zoom > 5 ? 4000 : 2200);
    for (let i = 0; i < limit; i += 1) {
      const n = nodes[i];
      if (!Number.isFinite(Number(n.lat)) || !Number.isFinite(Number(n.lon))) continue;
      const id = `${n.layer || 'node'}:${i}:${Number(n.lat).toFixed(5)}:${Number(n.lon).toFixed(5)}`;
      state.nodeIndex.set(id, n);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(n.lon), Number(n.lat)] },
        properties: { nodeId: id, label: n.label || '', layer: n.layer || '', color: colorForNode(n) }
      });
    }
    state.realMap.getSource('osirisNodes').setData({ type: 'FeatureCollection', features });
    if (state.realMap.getLayer('osiris-cables')) {
      const showCables = !!(model.activeLayers?.sdk_sea || model.activeLayers?.cables);
      state.realMap.setLayoutProperty('osiris-cables', 'visibility', showCables ? 'visible' : 'none');
    }
  }

  function syncRealMapView(animate = false, node = null) {
    if (!state.realMapReady || !state.realMap || !state.realMapMode) return;
    state.syncing = true;
    const center = [Number(node?.lon ?? model.view.targetLon ?? DEFAULT_VIEW.lon), Number(node?.lat ?? model.view.targetLat ?? DEFAULT_VIEW.lat)];
    const zoom = globeToMapZoom(model.view.zoom);
    const opts = { center, zoom, pitch: zoom > 8 ? 45 : 28, duration: animate ? 350 : 0 };
    try { animate ? state.realMap.easeTo(opts) : state.realMap.jumpTo(opts); } finally { setTimeout(() => { state.syncing = false; }, animate ? 420 : 40); }
  }

  wait();
})();
