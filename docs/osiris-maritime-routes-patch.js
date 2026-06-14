(() => {
  const PATCH_VERSION = '20260614-maritime-lowzoom-restore';
  const SOURCE_ID = 'osiris-maritime-routes-lowzoom';
  const LAYER_ID = 'osiris-maritime-routes-lowzoom-line';

  function isSeaRoute(route) {
    const layer = String(route?.layer || '').toLowerCase();
    const source = String(route?.source || route?.label || '').toLowerCase();
    return /sdk_sea|maritime|cables?/.test(layer) || /ship|sea|maritime|cable/.test(source);
  }

  function routeColor(route) {
    if (typeof route?.color === 'string' && route.color.trim()) return route.color;
    try {
      const key = route?.layer || 'sdk_sea';
      const raw = typeof tone === 'function' ? tone(layerTone?.[key] || 'blue', 1) : '#1689d6';
      const match = String(raw).match(/rgba?\(([^)]+)\)/);
      if (!match) return raw;
      const parts = match[1].split(',').map((value) => Number.parseFloat(value.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) return '#1689d6';
      return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
    } catch {
      return '#1689d6';
    }
  }

  function routeFeatures() {
    const routes = Array.isArray(window.model?.visibleRoutes) ? window.model.visibleRoutes : [];
    return routes
      .filter(isSeaRoute)
      .map((route, index) => {
        const coordinates = (route.coordinates || [])
          .map((point) => [Number(point[0]), Number(point[1])])
          .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
        if (coordinates.length < 2) return null;
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {
            id: index,
            layer: route.layer || 'sdk_sea',
            color: routeColor(route)
          }
        };
      })
      .filter(Boolean);
  }

  function firstLabelLayer(map) {
    const layers = map.getStyle()?.layers || [];
    return layers.find((layer) => layer.type === 'symbol' && /label|place|road|name/i.test(layer.id))?.id;
  }

  function ensureLayer(map) {
    if (!map || !map.isStyleLoaded()) return false;
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer(LAYER_ID)) {
      const layer = {
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        minzoom: 2.15,
        maxzoom: 5.85,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#1689d6'],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 2.15, 0.0, 2.55, 0.10, 4.4, 0.20, 5.75, 0.02],
          'line-width': ['interpolate', ['linear'], ['zoom'], 2.15, 0.35, 4.2, 0.82, 5.75, 0.42],
          'line-blur': 0.35,
          'line-dasharray': [0.85, 1.45]
        }
      };
      try { map.addLayer(layer, firstLabelLayer(map)); }
      catch { try { map.addLayer(layer); } catch {} }
    }
    return !!map.getSource(SOURCE_ID);
  }

  function renderRoutes() {
    const map = window.__osirisRealMap;
    if (!map || !map.isStyleLoaded() || !ensureLayer(map)) return;
    map.getSource(SOURCE_ID)?.setData({ type: 'FeatureCollection', features: routeFeatures() });
  }

  function install() {
    const map = window.__osirisRealMap;
    if (!map) return setTimeout(install, 120);
    map.on('style.load', () => setTimeout(renderRoutes, 80));
    map.on('moveend', () => setTimeout(renderRoutes, 110));
    map.on('idle', () => setTimeout(renderRoutes, 80));
    document.addEventListener('click', () => setTimeout(renderRoutes, 160), true);
    window.__osirisMaritimeRoutesPatch = { version: PATCH_VERSION, render: renderRoutes };
    renderRoutes();
    setInterval(renderRoutes, 900);
  }

  install();
})();
