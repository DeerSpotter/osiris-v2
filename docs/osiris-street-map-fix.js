(() => {
  const MAX_STREET_ZOOM = 20;
  const MIN_MAP_ZOOM = 1;
  const BASE_MAP_ZOOM = 2.2;
  const OLD_SCALE = 2.25;
  const STREET_SCALE = 4.25;

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function appZoomToStreetZoom(appZoom) {
    return clampValue(BASE_MAP_ZOOM + Math.log2(Math.max(0.72, appZoom)) * STREET_SCALE, MIN_MAP_ZOOM, MAX_STREET_ZOOM);
  }

  function oldMapZoomToAppZoom(oldMapZoom) {
    return clampValue(2 ** ((oldMapZoom - BASE_MAP_ZOOM) / OLD_SCALE), 0.72, 16);
  }

  function appZoomFromStreetZoom(mapZoom) {
    return clampValue(2 ** ((mapZoom - BASE_MAP_ZOOM) / STREET_SCALE), 0.72, 16);
  }

  function shouldRemapZoom(zoom) {
    return Number.isFinite(zoom) && zoom >= MIN_MAP_ZOOM && zoom <= 12.4;
  }

  function remapSyncZoom(zoom) {
    if (!shouldRemapZoom(zoom)) return zoom;
    return appZoomToStreetZoom(oldMapZoomToAppZoom(zoom));
  }

  function syncModelFromMap(map) {
    if (typeof model === 'undefined' || !map) return;
    try {
      const center = map.getCenter();
      model.view.targetLon = ((center.lng + 540) % 360) - 180;
      model.view.targetLat = clampValue(center.lat, -72, 78);
      model.view.zoom = appZoomFromStreetZoom(map.getZoom());
      if (typeof resize === 'function') resize();
    } catch {}
  }

  function patchMapInstance(map) {
    if (!map || map.__osirisStreetPatch) return map;
    map.__osirisStreetPatch = true;
    window.__osirisRealMap = map;

    try { map.setMaxZoom(MAX_STREET_ZOOM); } catch {}

    for (const method of ['jumpTo', 'easeTo', 'flyTo']) {
      const original = map[method]?.bind(map);
      if (!original) continue;
      map[method] = (options = {}, eventData) => {
        const next = { ...options };
        if (typeof next.zoom === 'number') next.zoom = remapSyncZoom(next.zoom);
        if (typeof next.pitch !== 'number') next.pitch = (next.zoom || map.getZoom()) >= 15 ? 0 : 28;
        return original(next, eventData);
      };
    }

    map.on?.('zoomend', () => syncModelFromMap(map));
    map.on?.('moveend', () => syncModelFromMap(map));
    return map;
  }

  function patchMapLibre(lib) {
    if (!lib || lib.__osirisStreetPatch || !lib.Map) return lib;
    lib.__osirisStreetPatch = true;
    const OriginalMap = lib.Map;

    function StreetLevelMap(options = {}) {
      const next = { ...options, maxZoom: MAX_STREET_ZOOM };
      if (typeof next.zoom === 'number') next.zoom = remapSyncZoom(next.zoom);
      const map = new OriginalMap(next);
      return patchMapInstance(map);
    }

    StreetLevelMap.prototype = OriginalMap.prototype;
    Object.setPrototypeOf(StreetLevelMap, OriginalMap);
    lib.Map = StreetLevelMap;
    return lib;
  }

  function installMapLibreHook() {
    let cached = window.maplibregl;
    if (cached) {
      window.maplibregl = patchMapLibre(cached);
      return;
    }

    try {
      Object.defineProperty(window, 'maplibregl', {
        configurable: true,
        get() { return cached; },
        set(value) {
          cached = patchMapLibre(value);
          Object.defineProperty(window, 'maplibregl', {
            value: cached,
            configurable: true,
            writable: true
          });
        }
      });
    } catch {}
  }

  function installRealMapZoomButtons() {
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-zoom-in],[data-zoom-out]');
      const map = window.__osirisRealMap;
      if (!button || !map || !document.body.classList.contains('real-map-mode')) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const direction = button.hasAttribute('data-zoom-in') ? 1 : -1;
      const nextZoom = clampValue(map.getZoom() + direction * 1.35, MIN_MAP_ZOOM, MAX_STREET_ZOOM);
      try {
        map.easeTo({ zoom: nextZoom, pitch: nextZoom >= 15 ? 0 : 28, duration: 220 });
      } catch {}
      setTimeout(() => syncModelFromMap(map), 260);
    }, true);
  }

  function installNodeStreetZoom() {
    if (typeof selectNode !== 'function') return setTimeout(installNodeStreetZoom, 60);
    const originalSelectNode = selectNode;
    if (originalSelectNode.__osirisStreetPatch) return;

    selectNode = function streetLevelSelectNode(node) {
      const result = originalSelectNode(node);
      const map = window.__osirisRealMap;
      if (node && map && document.body.classList.contains('real-map-mode')) {
        const targetZoom = Math.max(map.getZoom(), node.layer === 'cctv' ? 18 : 16);
        try {
          map.easeTo({ center: [Number(node.lon), Number(node.lat)], zoom: clampValue(targetZoom, MIN_MAP_ZOOM, MAX_STREET_ZOOM), pitch: 0, duration: 420 });
        } catch {}
      }
      return result;
    };
    selectNode.__osirisStreetPatch = true;
  }

  installMapLibreHook();
  installRealMapZoomButtons();
  installNodeStreetZoom();
})();
