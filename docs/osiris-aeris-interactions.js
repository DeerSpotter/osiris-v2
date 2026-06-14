'use strict';

(function () {
  const VERSION = '20260614-aeris-interactions';
  const MIN_PITCH = 0;
  const MAX_PITCH = 78;
  const MIN_ZOOM = 1.2;
  const MAX_ZOOM = 20;
  const HOME = { center: [-75.1652, 39.9526], zoom: 8.2, pitch: 64, bearing: -12 };

  let activeGesture = null;
  const pointers = new Map();
  let wasActive = false;

  function active() {
    return document.body.classList.contains('osiris-aeris-mode');
  }

  function map() {
    return window.__osirisRealMap || null;
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function mobile() {
    return window.matchMedia?.('(max-width: 760px)')?.matches === true;
  }

  function screenPoint(pointer) {
    return { x: Number(pointer.clientX), y: Number(pointer.clientY) };
  }

  function pairMetrics(a, b) {
    const pa = screenPoint(a);
    const pb = screenPoint(b);
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    return {
      a: pa,
      b: pb,
      cx: (pa.x + pb.x) / 2,
      cy: (pa.y + pb.y) / 2,
      dx,
      dy,
      distance: Math.max(1, Math.hypot(dx, dy)),
      angle: Math.atan2(dy, dx) * 180 / Math.PI
    };
  }

  function angleDelta(next, start) {
    return ((((next - start) + 540) % 360) - 180);
  }

  function enableAerisHandlers(m) {
    if (!m) return;
    try { m.dragPan?.enable?.(); } catch {}
    try { m.scrollZoom?.enable?.(); } catch {}
    try { m.boxZoom?.enable?.(); } catch {}
    try { m.doubleClickZoom?.enable?.(); } catch {}
    try { m.touchZoomRotate?.enable?.(); } catch {}
    try { m.dragRotate?.enable?.(); } catch {}
    try { m.touchPitch?.enable?.(); } catch {}
    try { m.keyboard?.enable?.(); } catch {}
  }

  function disableAerisOnlyHandlers(m) {
    if (!m) return;
    try { m.dragRotate?.disable?.(); } catch {}
    try { m.touchPitch?.disable?.(); } catch {}
  }

  function setCamera(next, duration = 180) {
    const m = map();
    if (!m) return;
    enableAerisHandlers(m);
    const camera = {
      center: next.center || m.getCenter(),
      zoom: clamp(next.zoom ?? m.getZoom(), MIN_ZOOM, MAX_ZOOM),
      pitch: clamp(next.pitch ?? m.getPitch(), MIN_PITCH, MAX_PITCH),
      bearing: next.bearing ?? m.getBearing(),
      duration
    };
    try { m.easeTo(camera); } catch { try { m.jumpTo(camera); } catch {} }
  }

  function pitchBy(delta) {
    const m = map();
    if (!m) return;
    setCamera({ pitch: m.getPitch() + delta }, 150);
  }

  function zoomBy(delta) {
    const m = map();
    if (!m) return;
    setCamera({ zoom: m.getZoom() + delta }, 150);
  }

  function resetBearing() {
    setCamera({ bearing: 0 }, 180);
  }

  function resetView() {
    const m = map();
    if (!m) return;
    setCamera({
      center: HOME.center,
      zoom: mobile() ? 7.2 : HOME.zoom,
      pitch: HOME.pitch,
      bearing: HOME.bearing
    }, 450);
  }

  function injectCss() {
    if (document.getElementById('osirisAerisInteractionStyles')) return;
    const style = document.createElement('style');
    style.id = 'osirisAerisInteractionStyles';
    style.textContent = `
      body.osiris-aeris-mode,body.osiris-aeris-mode html{overscroll-behavior:none!important;touch-action:none!important;}
      body.osiris-aeris-mode .osiris-live,body.osiris-aeris-mode .real-map-layer,body.osiris-aeris-mode .maplibregl-canvas,body.osiris-aeris-mode .maplibregl-canvas-container{touch-action:none!important;overscroll-behavior:none!important;-webkit-user-select:none!important;user-select:none!important;}
      .aeris-camera-rail{position:fixed;right:max(12px,env(safe-area-inset-right));top:50%;z-index:532;transform:translateY(-50%);display:none;grid-template-columns:1fr;border:1px solid rgba(122,247,255,.14);border-radius:22px;background:linear-gradient(180deg,rgba(3,9,18,.74),rgba(3,7,15,.54));box-shadow:0 18px 52px rgba(0,0,0,.46),inset 0 0 24px rgba(122,247,255,.035);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow:hidden;pointer-events:auto;}
      body.osiris-aeris-mode .aeris-camera-rail{display:grid;}
      .aeris-camera-rail button{width:44px;height:45px;border:0;border-bottom:1px solid rgba(234,252,255,.08);background:transparent;color:rgba(234,252,255,.68);font:900 21px/1 ui-monospace,SFMono-Regular,Menlo,monospace;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;}
      .aeris-camera-rail button:last-child{border-bottom:0;}
      .aeris-camera-rail button:hover,.aeris-camera-rail button:focus-visible{color:#fff;background:rgba(122,247,255,.08);outline:none;}
      .aeris-camera-rail button:active{transform:scale(.92);color:#7af7ff;}
      .aeris-gesture-hint{position:fixed;left:50%;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 16px);z-index:530;transform:translateX(-50%);display:none;padding:8px 12px;border:1px solid rgba(122,247,255,.16);border-radius:999px;background:rgba(3,9,18,.58);color:rgba(234,252,255,.62);font:800 9px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;pointer-events:none;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
      body.osiris-aeris-mode .aeris-gesture-hint{display:block;}
      @media(max-width:760px){
        .aeris-camera-rail{right:max(10px,env(safe-area-inset-right));top:45%;border-radius:20px;}
        .aeris-camera-rail button{width:38px;height:40px;font-size:18px;}
        body.osiris-aeris-mode .aeris-gesture-hint{display:none;}
      }
    `;
    document.head.appendChild(style);
  }

  function buildRail() {
    if (document.getElementById('aerisCameraRail')) return;
    const rail = document.createElement('section');
    rail.id = 'aerisCameraRail';
    rail.className = 'aeris-camera-rail';
    rail.setAttribute('aria-label', 'AERIS camera controls');
    rail.innerHTML = `
      <button type="button" data-aeris-camera="zoom-in" aria-label="Zoom in">+</button>
      <button type="button" data-aeris-camera="zoom-out" aria-label="Zoom out">−</button>
      <button type="button" data-aeris-camera="pitch-up" aria-label="Pitch camera up">⌃</button>
      <button type="button" data-aeris-camera="pitch-down" aria-label="Pitch camera down">⌄</button>
      <button type="button" data-aeris-camera="reset-bearing" aria-label="Reset bearing">↻</button>
      <button type="button" data-aeris-camera="reset-view" aria-label="Reset Aeris view">⌖</button>
    `;
    rail.addEventListener('click', (event) => {
      const action = event.target?.closest?.('[data-aeris-camera]')?.getAttribute('data-aeris-camera');
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'zoom-in') zoomBy(0.65);
      if (action === 'zoom-out') zoomBy(-0.65);
      if (action === 'pitch-up') pitchBy(8);
      if (action === 'pitch-down') pitchBy(-8);
      if (action === 'reset-bearing') resetBearing();
      if (action === 'reset-view') resetView();
    }, { passive: false });
    document.body.appendChild(rail);

    const hint = document.createElement('div');
    hint.className = 'aeris-gesture-hint';
    hint.textContent = 'TWO FINGERS: PAN · PINCH · ROTATE · SWIPE UP TO PITCH';
    document.body.appendChild(hint);
  }

  function startGesture() {
    const m = map();
    if (!m || pointers.size < 2) return;
    const values = [...pointers.values()].slice(0, 2);
    const metrics = pairMetrics(values[0], values[1]);
    const center = m.getCenter();
    const centerPoint = m.project(center);
    activeGesture = {
      start: metrics,
      startZoom: m.getZoom(),
      startPitch: m.getPitch(),
      startBearing: m.getBearing(),
      centerPoint: { x: centerPoint.x, y: centerPoint.y }
    };
  }

  function updateGesture(event) {
    const m = map();
    if (!m || !activeGesture || pointers.size < 2) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const values = [...pointers.values()].slice(0, 2);
    const metrics = pairMetrics(values[0], values[1]);
    const start = activeGesture.start;
    const dx = metrics.cx - start.cx;
    const dy = metrics.cy - start.cy;
    const scale = clamp(metrics.distance / start.distance, 0.35, 3.2);
    const zoom = clamp(activeGesture.startZoom + Math.log2(scale), MIN_ZOOM, MAX_ZOOM);
    const bearing = activeGesture.startBearing - angleDelta(metrics.angle, start.angle);
    const pitchDelta = clamp(-dy * 0.18, -48, 48);
    const pitch = clamp(activeGesture.startPitch + pitchDelta, MIN_PITCH, MAX_PITCH);
    const targetPoint = {
      x: activeGesture.centerPoint.x - dx,
      y: activeGesture.centerPoint.y - dy
    };
    const center = m.unproject(targetPoint);
    try {
      m.jumpTo({ center, zoom, bearing, pitch });
    } catch {}
  }

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) activeGesture = null;
    else startGesture();
  }

  function isControlTarget(target) {
    return !!target?.closest?.('.aeris-camera-rail,.aeris-layer-fix,.aeris-skin,.aeris-card,.aeris-legend,.maplibregl-ctrl');
  }

  function bindGestures(m) {
    const target = m?.getCanvasContainer?.();
    if (!target || target.__osirisAerisGestureBound) return;
    target.__osirisAerisGestureBound = true;

    target.addEventListener('pointerdown', (event) => {
      if (!active() || event.pointerType !== 'touch' || isControlTarget(event.target)) return;
      pointers.set(event.pointerId, event);
      if (pointers.size >= 2) {
        event.preventDefault();
        event.stopPropagation();
        try { target.setPointerCapture?.(event.pointerId); } catch {}
        startGesture();
      }
    }, { capture: true, passive: false });

    target.addEventListener('pointermove', (event) => {
      if (!active() || event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, event);
      if (pointers.size >= 2) updateGesture(event);
    }, { capture: true, passive: false });

    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((name) => {
      target.addEventListener(name, (event) => {
        if (event?.pointerType === 'touch') endPointer(event);
      }, { capture: true, passive: false });
    });

    ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
      target.addEventListener(name, (event) => {
        if (!active()) return;
        if (isControlTarget(event.target)) return;
        if ((event.touches && event.touches.length > 1) || name.startsWith('gesture')) event.preventDefault();
      }, { capture: true, passive: false });
    });
  }

  function applyMode() {
    const m = map();
    if (!m) return;
    if (active()) {
      enableAerisHandlers(m);
      if (!wasActive) resetView();
    } else if (wasActive) {
      pointers.clear();
      activeGesture = null;
      disableAerisOnlyHandlers(m);
      try { m.easeTo({ pitch: 0, bearing: 0, duration: 260 }); } catch {}
    }
    wasActive = active();
  }

  function install() {
    injectCss();
    buildRail();
    const bind = () => {
      const m = map();
      if (!m) return setTimeout(bind, 200);
      bindGestures(m);
      applyMode();
      if (!m.__osirisAerisInteractionEvents) {
        m.__osirisAerisInteractionEvents = true;
        m.on('style.load', () => setTimeout(applyMode, 100));
      }
    };
    bind();
    const observer = new MutationObserver(() => setTimeout(applyMode, 20));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    setInterval(applyMode, 900);
    window.__osirisAerisInteractions = { version: VERSION, resetView, setCamera };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
