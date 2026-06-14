'use strict';

(function () {
  const VERSION = '20260614-aeris-polish-stable';
  const AIR_KEYS = ['flights', 'private', 'jets', 'military'];
  const SOURCE_ID = 'osiris-aeris-aircraft';
  const CORE_NODE_LAYERS = ['osiris-node-halo', 'osiris-nodes', 'osiris-node-labels'];
  const AERIS_LAYERS = ['osiris-aeris-aircraft-halo', 'osiris-aeris-aircraft-models', 'osiris-aeris-aircraft-labels'];
  const PLANE_ICON_ID = 'osiris-aeris-plane-sdf';
  const AIR_FILTER_LEGACY = ['!in', 'layer', ...AIR_KEYS];
  const EMPTY_FILTER = ['==', 'id', '__osiris_none__'];
  const ALT_FEET_EXPR = ['case', ['<=', ['coalesce', ['get', 'alt'], 0], 20000], ['*', ['coalesce', ['get', 'alt'], 0], 3.28084], ['coalesce', ['get', 'alt'], 0]];
  const ALT_COLOR = ['interpolate', ['linear'], ALT_FEET_EXPR, 0, '#76fbff', 499, '#58efff', 2001, '#35dce9', 5000, '#2bc3e7', 10000, '#55a5eb', 20000, '#a88bdf', 42651, '#ffd75e'];

  let iconLoading = false;
  let iconReady = false;
  let labelLayerIds = null;
  let lastSignature = '';

  function active() {
    return document.body.classList.contains('osiris-aeris-mode');
  }

  function map() {
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
      body.osiris-primary-map:not(.osiris-aeris-mode) .aeris-toggle{left:max(14px,env(safe-area-inset-left))!important;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 252px)!important;width:72px!important;height:48px!important;border-radius:17px!important;font-size:10px!important;letter-spacing:.15em!important;}
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
        body.osiris-primary-map:not(.osiris-aeris-mode) .aeris-toggle{left:max(12px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 238px)!important;width:66px!important;height:46px!important;border-radius:16px!important;}
        body.osiris-aeris-mode .aeris-card{top:max(10px,env(safe-area-inset-top))!important;left:max(10px,env(safe-area-inset-left))!important;width:205px!important;}
        body.osiris-aeris-mode .aeris-legend{top:auto!important;right:max(10px,env(safe-area-inset-right))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 82px)!important;transform:none!important;}
        body.osiris-aeris-mode .aeris-layer-fix-button{left:max(10px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 16px)!important;}
        body.osiris-aeris-mode .aeris-layer-fix-menu{left:max(10px,env(safe-area-inset-left))!important;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 68px)!important;width:min(238px,calc(100vw - 20px))!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function addPlaneIcon(m) {
    if (!m || iconReady || iconLoading || m.hasImage?.(PLANE_ICON_ID)) {
      iconReady = !!m?.hasImage?.(PLANE_ICON_ID) || iconReady;
      return;
    }
    iconLoading = true;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="white" d="M32 3c2.2 0 4 1.8 4 4v18.4l20.4 12.2c1.1.7 1.8 1.9 1.8 3.2v3.7c0 1.2-1.3 2-2.4 1.5L36 38.2V51l7 5.1c.6.4 1 1.1 1 1.9v2.4c0 .9-.9 1.6-1.8 1.2L32 58l-10.2 3.6c-.9.3-1.8-.3-1.8-1.2V58c0-.8.4-1.5 1-1.9l7-5.1V38.2L8.2 46c-1.1.4-2.4-.3-2.4-1.5v-3.7c0-1.3.7-2.5 1.8-3.2L28 25.4V7c0-2.2 1.8-4 4-4Z"/></svg>`;
    const img = new Image(64, 64);
    img.onload = () => {
      try {
        if (!m.hasImage?.(PLANE_ICON_ID)) m.addImage(PLANE_ICON_ID, img, { sdf: true, pixelRatio: 2 });
        iconReady = true;
      } catch {}
      iconLoading = false;
      scheduleApply(true);
    };
    img.onerror = () => { iconLoading = false; };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function safeSetFilter(m, layerId, filter) { if (m.getLayer(layerId)) { try { m.setFilter(layerId, filter); } catch {} } }
  function safeSetLayout(m, layerId, name, value) { if (m.getLayer(layerId)) { try { m.setLayoutProperty(layerId, name, value); } catch {} } }
  function safeSetPaint(m, layerId, name, value) { if (m.getLayer(layerId)) { try { m.setPaintProperty(layerId, name, value); } catch {} } }

  function getLabelLayerIds(m) {
    if (!labelLayerIds) {
      labelLayerIds = (m.getStyle?.().layers || [])
        .filter((layer) => layer.type === 'symbol' && /label|place|road|name|country|state|settlement/i.test(layer.id))
        .map((layer) => layer.id)
        .filter((id) => !AERIS_LAYERS.includes(id));
    }
    return labelLayerIds;
  }

  function ensureAircraftLayerStyle(m) {
    addPlaneIcon(m);
    const show = active() && airEnabled();
    const showLabels = show && labelsEnabled();

    if (m.getLayer('osiris-aeris-aircraft-halo')) {
      safeSetLayout(m, 'osiris-aeris-aircraft-halo', 'visibility', 'none');
      safeSetPaint(m, 'osiris-aeris-aircraft-halo', 'circle-opacity', 0);
      safeSetPaint(m, 'osiris-aeris-aircraft-halo', 'circle-blur', 0);
      safeSetPaint(m, 'osiris-aeris-aircraft-halo', 'circle-radius', 0);
      safeSetFilter(m, 'osiris-aeris-aircraft-halo', EMPTY_FILTER);
    }

    if (m.getLayer('osiris-aeris-aircraft-models')) {
      safeSetLayout(m, 'osiris-aeris-aircraft-models', 'visibility', show ? 'visible' : 'none');
      if (iconReady || m.hasImage?.(PLANE_ICON_ID)) {
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'icon-image', PLANE_ICON_ID);
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'icon-size', ['interpolate', ['linear'], ['zoom'], 1, 0.24, 5, 0.34, 8, 0.46, 12, 0.64, 18, 0.92]);
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'icon-rotate', ['coalesce', ['get', 'heading'], 0]);
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'icon-rotation-alignment', 'map');
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'icon-pitch-alignment', 'map');
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'icon-allow-overlap', true);
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'icon-ignore-placement', true);
        safeSetLayout(m, 'osiris-aeris-aircraft-models', 'text-field', '');
        safeSetPaint(m, 'osiris-aeris-aircraft-models', 'icon-color', ALT_COLOR);
        safeSetPaint(m, 'osiris-aeris-aircraft-models', 'icon-halo-color', 'rgba(0,3,8,.92)');
        safeSetPaint(m, 'osiris-aeris-aircraft-models', 'icon-halo-width', ['interpolate', ['linear'], ['zoom'], 1, 0.4, 12, 1.1]);
        safeSetPaint(m, 'osiris-aeris-aircraft-models', 'icon-opacity', show ? 0.96 : 0);
      }
      safeSetFilter(m, 'osiris-aeris-aircraft-models', show ? null : EMPTY_FILTER);
    }

    if (m.getLayer('osiris-aeris-aircraft-labels')) {
      safeSetLayout(m, 'osiris-aeris-aircraft-labels', 'visibility', showLabels ? 'visible' : 'none');
      safeSetPaint(m, 'osiris-aeris-aircraft-labels', 'text-opacity', showLabels ? ['interpolate', ['linear'], ['zoom'], 7.5, 0, 9, 0.72, 14, 1] : 0);
      safeSetFilter(m, 'osiris-aeris-aircraft-labels', showLabels ? null : EMPTY_FILTER);
    }
  }

  function apply(force = false) {
    const m = map();
    if (!m?.isStyleLoaded?.()) return;
    const signature = [active(), airEnabled(), labelsEnabled(), !!m.getLayer('osiris-aeris-aircraft-models'), !!m.getSource(SOURCE_ID), iconReady].join('|');
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    for (const id of CORE_NODE_LAYERS) {
      safeSetLayout(m, id, 'visibility', active() ? 'none' : 'visible');
      safeSetFilter(m, id, AIR_FILTER_LEGACY);
    }
    ensureAircraftLayerStyle(m);
    const showBaseLabels = !active() || labelsEnabled();
    for (const id of getLabelLayerIds(m)) safeSetLayout(m, id, 'visibility', showBaseLabels ? 'visible' : 'none');
  }

  function scheduleApply(force = false) {
    window.requestAnimationFrame(() => apply(force));
  }

  function install() {
    injectCss();
    const observer = new MutationObserver(() => scheduleApply(true));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('osiris:flight-feed', () => scheduleApply());
    const bind = () => {
      const m = map();
      if (!m) return setTimeout(bind, 250);
      if (!m.__osirisAerisPolishStableBound) {
        m.__osirisAerisPolishStableBound = true;
        m.on('style.load', () => { labelLayerIds = null; iconReady = false; iconLoading = false; setTimeout(() => scheduleApply(true), 120); });
      }
      scheduleApply(true);
    };
    bind();
    window.__osirisAerisPolish = { version: VERSION, apply };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
