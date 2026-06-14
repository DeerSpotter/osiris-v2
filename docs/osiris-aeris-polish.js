'use strict';

(function () {
  const VERSION = '20260614-aeris-polish';
  const AIR_KEYS = ['flights', 'private', 'jets', 'military'];
  const CORE_NODE_LAYERS = ['osiris-node-halo', 'osiris-nodes', 'osiris-node-labels'];
  const AERIS_LAYERS = [
    'osiris-aeris-aircraft-halo',
    'osiris-aeris-aircraft-models',
    'osiris-aeris-aircraft-labels'
  ];
  const ROUTE_LAYERS = ['osiris-routes-line', 'osiris-cables-line'];
  const PLANE_ICON_ID = 'osiris-aeris-plane-sdf';
  const AIR_FILTER_LEGACY = ['!in', 'layer', ...AIR_KEYS];
  const EMPTY_FILTER = ['==', 'id', '__osiris_none__'];
  const ALT_FEET_EXPR = [
    'case',
    ['<=', ['coalesce', ['get', 'alt'], 0], 20000],
    ['*', ['coalesce', ['get', 'alt'], 0], 3.28084],
    ['coalesce', ['get', 'alt'], 0]
  ];
  const ALT_COLOR = [
    'interpolate', ['linear'], ALT_FEET_EXPR,
    0, '#76fbff',
    499, '#58efff',
    2001, '#35dce9',
    5000, '#2bc3e7',
    10000, '#55a5eb',
    20000, '#a88bdf',
    42651, '#ffd75e'
  ];
  const HOME = { center: [-75.1652, 39.9526], mobileZoom: 5.05, desktopZoom: 6.15 };

  let lastActive = false;
  let iconLoading = false;
  let iconReady = false;
  let labelLayerIds = null;

  function active() {
    return document.body.classList.contains('osiris-aeris-mode');
  }

  function getMap() {
    return window.__osirisRealMap || null;
  }

  function hasModel() {
    return typeof model !== 'undefined' && !!model.activeLayers;
  }

  function airEnabled() {
    if (!hasModel()) return true;
    return AIR_KEYS.some((key) => model.activeLayers[key] !== false);
  }

  function labelsEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem('osiris.aeris.controls') || '{}');
      return saved.labels !== false;
    } catch {
      return true;
    }
  }

  function injectCss() {
    if (document.getElementById('osirisAerisPolishStyles')) return;
    const style = document.createElement('style');
    style.id = 'osirisAerisPolishStyles';
    style.textContent = `
      body.osiris-primary-map:not(.osiris-aeris-mode) .aeris-toggle{width:56px!important;height:44px!important;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 174px)!important;border-radius:16px!important;font-size:9px!important;background:rgba(3,9,18,.58)!important;box-shadow:0 10px 28px rgba(0,0,0,.38),inset 0 0 16px rgba(36,220,233,.05)!important;}
      body.osiris-aeris-mode .live-header,body.osiris-aeris-mode .telemetry-card,body.osiris-aeris-mode .event-card,body.osiris-aeris-mode .bottom-nav,body.osiris-aeris-mode .projection-toggle,body.osiris-aeris-mode .map-loading-pill{display:none!important;opacity:0!important;pointer-events:none!important;}
      body.osiris-aeris-mode .aeris-toggle{display:none!important;}
      body.osiris-aeris-mode .real-map-layer{z-index:2!important;}
      body.osiris-aeris-mode .space-vignette{z-index:3!important;background:radial-gradient(circle at 50% 45%,transparent 42%,rgba(0,0,0,.16) 68%,rgba(0,0,0,.64) 100%),linear-gradient(180deg,rgba(0,2,8,.40),transparent 30%,transparent 72%,rgba(0,2,8,.44))!important;}
      body.osiris-aeris-mode .scan-lines{opacity:.012!important;}
      body.osiris-aeris-mode .aeris-card{width:min(218px,calc(100vw - 28px))!important;border-color:rgba(122,247,255,.24)!important;background:linear-gradient(180deg,rgba(2,8,17,.82),rgba(2,6,14,.62))!important;box-shadow:0 18px 48px rgba(0,0,0,.42),inset 0 0 24px rgba(122,247,255,.04)!important;}
      body.osiris-aeris-mode .aeris-brand strong{font-size:23px!important;letter-spacing:-.07em!important;}
      body.osiris-aeris-mode .aeris-legend{right:max(12px,env(safe-area-inset-right))!important;background:linear-gradient(180deg,rgba(2,8,16,.62),rgba(2,6,12,.42))!important;border-color:rgba(122,247,255,.18)!important;}
      body.osiris-aeris-mode .aeris-layer-fix{z-index:531!important;}
      body.osiris-aeris-mode .aeris-layer-fix-button{left:max(14px,env(safe-area-inset-left))!important;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 18px)!important;height:44px!important;min-width:76px!important;border-radius:15px!important;background:rgba(2,8,17,.70)!important;}
      body.osiris-aeris-mode .aeris-layer-fix-menu{left:max(14px,env(safe-area-inset-left))!important;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 72px)!important;max-height:min(58vh,440px)!important;overflow:auto!important;}
      @media(max-width:760px){
        body.osiris-primary-map:not(.osiris-aeris-mode) .aeris-toggle{left:max(12px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 168px)!important;width:54px!important;height:42px!important;}
        body.osiris-aeris-mode .aeris-card{top:max(10px,env(safe-area-inset-top))!important;left:max(10px,env(safe-area-inset-left))!important;width:205px!important;}
        body.osiris-aeris-mode .aeris-legend{top:auto!important;right:max(10px,env(safe-area-inset-right))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 82px)!important;transform:none!important;}
        body.osiris-aeris-mode .aeris-layer-fix-button{left:max(10px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 16px)!important;}
        body.osiris-aeris-mode .aeris-layer-fix-menu{left:max(10px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 68px)!important;width:min(238px,calc(100vw - 20px))!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function addPlaneIcon(map) {
    if (!map || iconReady || iconLoading || map.hasImage?.(PLANE_ICON_ID)) {
      iconReady = !!map?.hasImage?.(PLANE_ICON_ID) || iconReady;
      return;
    }
    iconLoading = true;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="white" d="M32 3c2.2 0 4 1.8 4 4v18.4l20.4 12.2c1.1.7 1.8 1.9 1.8 3.2v3.7c0 1.2-1.3 2-2.4 1.5L36 38.2V51l7 5.1c.6.4 1 1.1 1 1.9v2.4c0 .9-.9 1.6-1.8 1.2L32 58l-10.2 3.6c-.9.3-1.8-.3-1.8-1.2V58c0-.8.4-1.5 1-1.9l7-5.1V38.2L8.2 46c-1.1.4-2.4-.3-2.4-1.5v-3.7c0-1.3.7-2.5 1.8-3.2L28 25.4V7c0-2.2 1.8-4 4-4Z"/></svg>`;
    const img = new Image(64, 64);
    img.onload = () => {
      try {
        if (!map.hasImage?.(PLANE_ICON_ID)) map.addImage(PLANE_ICON_ID, img, { sdf: true, pixelRatio: 2 });
        iconReady = true;
      } catch {}
      iconLoading = false;
      applyAll();
    };
    img.onerror = () => { iconLoading = false; };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function safeSetFilter(map, layerId, filter) {
    if (!map.getLayer(layerId)) return;
    try { map.setFilter(layerId, filter); } catch {}
  }

  function safeSetLayout(map, layerId, name, value) {
    if (!map.getLayer(layerId)) return;
    try { map.setLayoutProperty(layerId, name, value); } catch {}
  }

  function safeSetPaint(map, layerId, name, value) {
    if (!map.getLayer(layerId)) return;
    try { map.setPaintProperty(layerId, name, value); } catch {}
  }

  function styleCoreLayers(map) {
    const isActive = active();
    for (const id of CORE_NODE_LAYERS) {
      if (!map.getLayer(id)) continue;
      safeSetLayout(map, id, 'visibility', isActive ? 'none' : 'visible');
      safeSetFilter(map, id, AIR_FILTER_LEGACY);
    }
    if (!isActive && map.getLayer('osiris-node-halo')) {
      safeSetPaint(map, 'osiris-node-halo', 'circle-blur', 0.35);
      safeSetPaint(map, 'osiris-node-halo', 'circle-opacity', ['interpolate', ['linear'], ['zoom'], 1, 0.08, 8, 0.18, 14, 0.26, 19, 0.34]);
      safeSetPaint(map, 'osiris-node-halo', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 1, 3, 8, 7, 14, 12, 19, 18]);
    }
  }

  function styleAerisAircraft(map) {
    addPlaneIcon(map);
    const show = active() && airEnabled();
    const showLabels = show && labelsEnabled();

    if (map.getLayer('osiris-aeris-aircraft-halo')) {
      safeSetLayout(map, 'osiris-aeris-aircraft-halo', 'visibility', 'none');
      safeSetPaint(map, 'osiris-aeris-aircraft-halo', 'circle-opacity', 0);
      safeSetPaint(map, 'osiris-aeris-aircraft-halo', 'circle-blur', 0);
      safeSetPaint(map, 'osiris-aeris-aircraft-halo', 'circle-radius', 0);
      safeSetFilter(map, 'osiris-aeris-aircraft-halo', EMPTY_FILTER);
    }

    if (map.getLayer('osiris-aeris-aircraft-models')) {
      safeSetLayout(map, 'osiris-aeris-aircraft-models', 'visibility', show ? 'visible' : 'none');
      if (iconReady || map.hasImage?.(PLANE_ICON_ID)) {
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'icon-image', PLANE_ICON_ID);
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'icon-size', ['interpolate', ['linear'], ['zoom'], 1, 0.24, 5, 0.34, 8, 0.46, 12, 0.64, 18, 0.92]);
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'icon-rotate', ['coalesce', ['get', 'heading'], 0]);
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'icon-rotation-alignment', 'map');
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'icon-pitch-alignment', 'map');
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'icon-allow-overlap', true);
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'icon-ignore-placement', true);
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'text-field', '');
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'icon-color', ALT_COLOR);
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'icon-halo-color', 'rgba(0,3,8,.92)');
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'icon-halo-width', ['interpolate', ['linear'], ['zoom'], 1, 0.4, 12, 1.1]);
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'icon-opacity', show ? 0.96 : 0);
      } else {
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'text-field', ['coalesce', ['get', 'glyph'], '✈']);
        safeSetLayout(map, 'osiris-aeris-aircraft-models', 'text-size', ['interpolate', ['linear'], ['zoom'], 1, 9, 5, 12, 8, 16, 12, 22, 18, 30]);
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'text-color', ALT_COLOR);
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'text-halo-color', 'rgba(0,3,8,.92)');
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'text-halo-width', ['interpolate', ['linear'], ['zoom'], 1, 0.5, 12, 1.2]);
        safeSetPaint(map, 'osiris-aeris-aircraft-models', 'text-opacity', show ? 0.96 : 0);
      }
      safeSetFilter(map, 'osiris-aeris-aircraft-models', show ? null : EMPTY_FILTER);
    }

    if (map.getLayer('osiris-aeris-aircraft-labels')) {
      safeSetLayout(map, 'osiris-aeris-aircraft-labels', 'visibility', showLabels ? 'visible' : 'none');
      safeSetPaint(map, 'osiris-aeris-aircraft-labels', 'text-opacity', showLabels ? ['interpolate', ['linear'], ['zoom'], 7.5, 0, 9, 0.72, 14, 1] : 0);
      safeSetFilter(map, 'osiris-aeris-aircraft-labels', showLabels ? null : EMPTY_FILTER);
    }
  }

  function getLabelLayerIds(map) {
    if (!labelLayerIds) {
      labelLayerIds = (map.getStyle?.().layers || [])
        .filter((layer) => layer.type === 'symbol' && /label|place|road|name|country|state|settlement/i.test(layer.id))
        .map((layer) => layer.id)
        .filter((id) => !AERIS_LAYERS.includes(id));
    }
    return labelLayerIds;
  }

  function styleBaseLabels(map) {
    const show = !active() || labelsEnabled();
    for (const id of getLabelLayerIds(map)) safeSetLayout(map, id, 'visibility', show ? 'visible' : 'none');
  }

  function tuneAerisCamera(map) {
    if (!active() || lastActive) return;
    const mobile = window.matchMedia?.('(max-width: 760px)')?.matches;
    try {
      window.__osirisSetBasemap?.('dark');
      window.__osirisSetProjection?.('mercator');
      map.dragRotate?.enable?.();
      map.touchPitch?.enable?.();
      map.easeTo({ center: HOME.center, zoom: mobile ? HOME.mobileZoom : HOME.desktopZoom, pitch: 58, bearing: -6, duration: 650 });
    } catch {}
  }

  function applyAll() {
    const map = getMap();
    if (!map?.isStyleLoaded?.()) return;
    tuneAerisCamera(map);
    styleCoreLayers(map);
    styleAerisAircraft(map);
    styleBaseLabels(map);
    lastActive = active();
  }

  function install() {
    injectCss();
    const bind = () => {
      const map = getMap();
      if (!map) return setTimeout(bind, 200);
      if (!map.__osirisAerisPolishBound) {
        map.__osirisAerisPolishBound = true;
        map.on('style.load', () => { labelLayerIds = null; iconReady = false; iconLoading = false; setTimeout(applyAll, 120); });
        map.on('styledata', () => setTimeout(applyAll, 40));
        map.on('idle', () => setTimeout(applyAll, 40));
        map.on('moveend', () => setTimeout(applyAll, 40));
      }
      applyAll();
    };
    bind();
    const observer = new MutationObserver(() => setTimeout(applyAll, 20));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    setInterval(applyAll, 650);
    window.__osirisAerisPolish = { version: VERSION, apply: applyAll };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
