(() => {
  const MAX_WAIT_MS = 12000;
  const startedAt = Date.now();

  function setStatus(text) {
    const readout = document.getElementById('readout');
    if (!readout || !window.__osirisRealMap) return;
    const zoom = window.__osirisRealMap.getZoom?.();
    readout.textContent = `${text} · Z ${Number.isFinite(zoom) ? zoom.toFixed(2) : '--'}`;
  }

  function trySetGlobe(map) {
    if (!map || map.__osirisGlobeProjectionApplied) return;
    map.__osirisGlobeProjectionApplied = true;

    let globeApplied = false;
    try {
      map.setProjection?.({ type: 'globe' });
      globeApplied = true;
    } catch {
      try {
        map.setProjection?.('globe');
        globeApplied = true;
      } catch {}
    }

    try { map.setRenderWorldCopies?.(false); } catch {}
    try { map.setPitch?.(0); } catch {}
    try { map.dragRotate?.disable(); } catch {}
    try { map.touchPitch?.disable(); } catch {}

    document.body.classList.toggle('osiris-globe-projection', globeApplied);
    document.body.classList.toggle('osiris-mercator-map', !globeApplied);
    setStatus(globeApplied ? 'GLOBE MAP READY' : 'MAP READY');

    const keepProjection = () => {
      if (!globeApplied) return;
      try {
        const projection = map.getProjection?.();
        const type = typeof projection === 'string' ? projection : projection?.type;
        if (type && type !== 'globe') map.setProjection?.({ type: 'globe' });
      } catch {}
    };

    map.on?.('style.load', keepProjection);
    map.on?.('load', keepProjection);
    map.on?.('idle', keepProjection);
    map.on?.('zoom', () => {
      const z = map.getZoom?.() || 0;
      document.body.classList.toggle('osiris-street-zoom', z >= 11);
      document.body.classList.toggle('osiris-orbit-zoom', z < 11);
      setStatus(globeApplied && z < 11 ? 'GLOBE MAP READY' : 'STREET MAP READY');
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
