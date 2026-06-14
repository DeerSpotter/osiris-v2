'use strict';

(function () {
  const VERSION = '20260614-aeris-native-deep-tilt';
  const MIN_PITCH = 0;
  const MAX_PITCH = 85;
  const MIN_ZOOM = 1.2;
  const MAX_ZOOM = 20;
  const HOME = { center: [-75.1652, 39.9526], zoom: 8.2, pitch: 76, bearing: -12 };

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

  function setPitchCeiling(m) {
    if (!m) return;
    try { m.setMaxPitch?.(MAX_PITCH); } catch {}
    try { m.setMinPitch?.(MIN_PITCH); } catch {}
  }

  function enableAerisHandlers(m) {
    if (!m) return;
    setPitchCeiling(m);
    try { m.dragPan?.enable?.(); } catch {}
    try { m.scrollZoom?.enable?.(); } catch {}
    try { m.boxZoom?.enable?.(); } catch {}
    try { m.doubleClickZoom?.enable?.(); } catch {}
    try { m.touchZoomRotate?.enable?.(); } catch {}
    try { m.touchZoomRotate?.enableRotation?.(); } catch {}
    try { m.dragRotate?.enable?.(); } catch {}
    try { m.touchPitch?.enable?.(); } catch {}
    try { m.keyboard?.enable?.(); } catch {}
  }

  function disableAerisOnlyHandlers(m) {
    if (!m) return;
    try { m.dragRotate?.disable?.(); } catch {}
    try { m.touchPitch?.disable?.(); } catch {}
    try { m.touchZoomRotate?.enable?.(); } catch {}
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
    if (m) setCamera({ pitch: m.getPitch() + delta }, 140);
  }

  function zoomBy(delta) {
    const m = map();
    if (m) setCamera({ zoom: m.getZoom() + delta }, 140);
  }

  function resetBearing() {
    setCamera({ bearing: 0 }, 160);
  }

  function resetView() {
    setCamera({ center: HOME.center, zoom: mobile() ? 7.2 : HOME.zoom, pitch: HOME.pitch, bearing: HOME.bearing }, 420);
  }

  function injectCss() {
    if (document.getElementById('osirisAerisInteractionStyles')) return;
    const style = document.createElement('style');
    style.id = 'osirisAerisInteractionStyles';
    style.textContent = `
      body.osiris-aeris-mode{overscroll-behavior:none!important;}
      body.osiris-aeris-mode .real-map-layer,body.osiris-aeris-mode .maplibregl-canvas,body.osiris-aeris-mode .maplibregl-canvas-container{touch-action:none!important;overscroll-behavior:none!important;-webkit-user-select:none!important;user-select:none!important;}
      .aeris-camera-rail{position:fixed;right:max(12px,env(safe-area-inset-right));top:50%;z-index:532;transform:translateY(-50%);display:none;grid-template-columns:1fr;border:1px solid rgba(122,247,255,.14);border-radius:22px;background:linear-gradient(180deg,rgba(3,9,18,.74),rgba(3,7,15,.54));box-shadow:0 18px 52px rgba(0,0,0,.46),inset 0 0 24px rgba(122,247,255,.035);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow:hidden;pointer-events:auto;}
      body.osiris-aeris-mode .aeris-camera-rail{display:grid;}
      .aeris-camera-rail button{width:44px;height:45px;border:0;border-bottom:1px solid rgba(234,252,255,.08);background:transparent;color:rgba(234,252,255,.68);font:900 21px/1 ui-monospace,SFMono-Regular,Menlo,monospace;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;}
      .aeris-camera-rail button:last-child{border-bottom:0;}
      .aeris-camera-rail button:hover,.aeris-camera-rail button:focus-visible{color:#fff;background:rgba(122,247,255,.08);outline:none;}
      .aeris-camera-rail button:active{transform:scale(.92);color:#7af7ff;}
      @media(max-width:760px){.aeris-camera-rail{right:max(10px,env(safe-area-inset-right));top:45%;border-radius:20px;}.aeris-camera-rail button{width:38px;height:40px;font-size:18px;}}
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
      if (action === 'zoom-in') zoomBy(0.75);
      if (action === 'zoom-out') zoomBy(-0.75);
      if (action === 'pitch-up') pitchBy(16);
      if (action === 'pitch-down') pitchBy(-16);
      if (action === 'reset-bearing') resetBearing();
      if (action === 'reset-view') resetView();
    }, { passive: false });
    document.body.appendChild(rail);
  }

  function applyMode() {
    const m = map();
    if (!m) return;
    const isActive = active();
    if (isActive) {
      enableAerisHandlers(m);
      if (!wasActive) {
        resetView();
        window.dispatchEvent(new CustomEvent('osiris:aeris-mode', { detail: { active: true } }));
      }
    } else if (wasActive) {
      disableAerisOnlyHandlers(m);
      try { m.easeTo({ pitch: 0, bearing: 0, duration: 260 }); } catch {}
      window.dispatchEvent(new CustomEvent('osiris:aeris-mode', { detail: { active: false } }));
    }
    wasActive = isActive;
  }

  function install() {
    injectCss();
    buildRail();
    const bind = () => {
      const m = map();
      if (!m) return setTimeout(bind, 200);
      setPitchCeiling(m);
      applyMode();
      if (!m.__osirisAerisInteractionEvents) {
        m.__osirisAerisInteractionEvents = true;
        m.on('style.load', () => setTimeout(applyMode, 100));
      }
    };
    bind();
    const observer = new MutationObserver(() => setTimeout(applyMode, 20));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.__osirisAerisInteractions = { version: VERSION, resetView, setCamera };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
