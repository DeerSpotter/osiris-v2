(() => {
  const MAX_WAIT_MS = 12000;
  const startedAt = Date.now();
  const ORBIT_ZOOM_MAX = 11;

  function setStatus(text) {
    const readout = document.getElementById('readout');
    if (!readout || !window.__osirisRealMap) return;
    const zoom = window.__osirisRealMap.getZoom?.();
    readout.textContent = `${text} · Z ${Number.isFinite(zoom) ? zoom.toFixed(2) : '--'}`;
  }

  function projectionType(map) {
    try {
      const projection = map.getProjection?.();
      return typeof projection === 'string' ? projection : projection?.type;
    } catch {
      return '';
    }
  }

  function applyGlobe(map) {
    let ok = false;
    try {
      map.setProjection?.('globe');
      ok = projectionType(map) === 'globe' || !projectionType(map);
    } catch {}
    if (!ok) {
      try {
        map.setProjection?.({ type: 'globe' });
        ok = projectionType(map) === 'globe' || !projectionType(map);
      } catch {}
    }
    return ok;
  }

  function trySetGlobe(map) {
    if (!map) return;
    if (map.__osirisGlobeProjectionInstalled) return;
    map.__osirisGlobeProjectionInstalled = true;

    const forceGlobe = () => {
      const ok = applyGlobe(map);
      try { map.setRenderWorldCopies?.(false); } catch {}
      try { map.setPitch?.(0); } catch {}
      try { map.dragRotate?.disable(); } catch {}
      try { map.touchPitch?.disable(); } catch {}
      document.body.classList.toggle('osiris-globe-projection', ok);
      document.body.classList.toggle('osiris-mercator-map', !ok);
      const z = map.getZoom?.() || 0;
      document.body.classList.toggle('osiris-street-zoom', z >= ORBIT_ZOOM_MAX);
      document.body.classList.toggle('osiris-orbit-zoom', z < ORBIT_ZOOM_MAX);
      setStatus(ok ? 'GLOBE MAP READY' : 'MAP READY');
      return ok;
    };

    forceGlobe();

    const keepProjection = () => {
      forceGlobe();
      setTimeout(forceGlobe, 80);
      setTimeout(forceGlobe, 300);
    };

    map.on?.('style.load', keepProjection);
    map.on?.('load', keepProjection);
    map.on?.('idle', keepProjection);
    map.on?.('data', () => {
      if ((map.getZoom?.() || 0) < ORBIT_ZOOM_MAX) keepProjection();
    });
    map.on?.('zoom', () => {
      const z = map.getZoom?.() || 0;
      document.body.classList.toggle('osiris-street-zoom', z >= ORBIT_ZOOM_MAX);
      document.body.classList.toggle('osiris-orbit-zoom', z < ORBIT_ZOOM_MAX);
      forceGlobe();
      setStatus(z < ORBIT_ZOOM_MAX ? 'GLOBE MAP READY' : 'STREET MAP READY');
    });
  }

  function waitForMap() {
    const map = window.__osirisRealMap;
    if (map) {
      trySetGlobe(map);
      return;
    }
    if (Date.now() - startedAt > MAX_WAIT_MS) return;
    setTimeout(waitForMap, 60);
  }

  const style = document.createElement('style');
  style.textContent = `
    body.osiris-globe-projection .real-map-layer{background:radial-gradient(circle at 42% 36%,#1a2d3c 0%,#09111c 46%,#02030a 76%)!important;}
    body.osiris-globe-projection.osiris-map-ready .space-vignette{background:radial-gradient(circle at 50% 46%,rgba(2,3,10,0) 0%,rgba(2,3,10,.04) 45%,rgba(2,3,10,.72) 100%),linear-gradient(180deg,rgba(2,3,10,.48),rgba(2,3,10,.02) 26%,rgba(2,3,10,.02) 72%,rgba(2,3,10,.62))!important;}
    body.osiris-globe-projection .maplibregl-canvas{filter:saturate(1.08) contrast(1.05);}
    body.osiris-globe-projection.osiris-orbit-zoom .maplibregl-canvas-container{border-radius:50%;overflow:hidden;box-shadow:0 0 0 1px rgba(38,132,198,.28),0 0 90px rgba(21,124,203,.22),inset 0 0 80px rgba(0,0,0,.56);}
    body.osiris-globe-projection.osiris-street-zoom .maplibregl-canvas-container{border-radius:0;box-shadow:none;}
  `;
  document.head.appendChild(style);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForMap, { once: true });
  else waitForMap();
})();
