(() => {
  const MAP_GESTURE_HOLD_MS = 900;
  let installed = false;
  let mapGestureUntil = 0;

  function now() { return Date.now(); }
  function isMapMode() { return document.body.classList.contains('real-map-mode'); }
  function markMapGesture(ms = MAP_GESTURE_HOLD_MS) { mapGestureUntil = now() + ms; }
  function duringMapGesture() { return isMapMode() && now() < mapGestureUntil; }
  function clampValue(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .deep-zoom-controls{display:none!important;}
      .real-map-mode .real-map-layer{z-index:6;pointer-events:auto!important;touch-action:none;}
      .real-map-mode .globe-canvas{pointer-events:none!important;}
      .real-map-mode .event-card{pointer-events:none;}
      .real-map-mode .floating-actions{pointer-events:none;}
      .real-map-mode .maplibregl-canvas{touch-action:none!important;}
    `;
    document.head.appendChild(style);
  }

  function removeLegacyButtons() {
    document.querySelectorAll('.deep-zoom-controls,[data-zoom-in],[data-zoom-out]').forEach((node) => node.remove());
  }

  function patchSetZoom() {
    if (typeof setZoom !== 'function' || setZoom.__osirisPanFix) return false;
    const originalSetZoom = setZoom;
    setZoom = function panSafeSetZoom(value) {
      if (duringMapGesture() && typeof model !== 'undefined') {
        model.view.zoom = clampValue(Number(value) || model.view.zoom || 1, 0.72, 16);
        if (typeof resize === 'function') resize();
        if (model.view.zoom > 1.2 && typeof ensureStates === 'function') ensureStates();
        if (model.view.zoom > 1.35 && typeof ensureFullLive === 'function') ensureFullLive();
        return model.view.zoom;
      }
      return originalSetZoom(value);
    };
    setZoom.__osirisPanFix = true;
    return true;
  }

  function patchMap(map) {
    if (!map || map.__osirisPanFix) return;
    map.__osirisPanFix = true;

    try { map.dragPan.enable(); } catch {}
    try { map.scrollZoom.enable(); } catch {}
    try { map.boxZoom.disable(); } catch {}
    try { map.dragRotate.disable(); } catch {}
    try { map.touchPitch.disable(); } catch {}
    try { map.touchZoomRotate.enable(); } catch {}
    try { map.doubleClickZoom.enable(); } catch {}

    map.on?.('dragstart', () => markMapGesture(1600));
    map.on?.('drag', () => markMapGesture(700));
    map.on?.('dragend', () => markMapGesture(600));
    map.on?.('movestart', () => markMapGesture(1200));
    map.on?.('move', () => markMapGesture(500));
    map.on?.('moveend', () => markMapGesture(450));
    map.on?.('zoomstart', () => markMapGesture(1200));
    map.on?.('zoom', () => markMapGesture(500));
    map.on?.('zoomend', () => markMapGesture(450));

    const canvas = map.getCanvas?.();
    if (canvas) {
      canvas.style.touchAction = 'none';
      canvas.style.pointerEvents = 'auto';
    }
  }

  function watchMap() {
    removeLegacyButtons();
    patchSetZoom();
    if (window.__osirisRealMap) patchMap(window.__osirisRealMap);
    requestAnimationFrame(watchMap);
  }

  function install() {
    if (installed) return;
    installed = true;
    injectStyle();
    removeLegacyButtons();
    watchMap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
