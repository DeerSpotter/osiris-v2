(() => {
  const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const STYLE_KEY = 'osiris-pages:map-style-mode';
  const STARTED = Date.now();
  const MAX_WAIT_MS = 15000;

  function satelliteStyle() {
    return {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        },
        satelliteLabels: {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Labels © Esri'
        },
        roadsLabels: {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Road labels © Esri'
        }
      },
      layers: [
        { id: 'satellite-base', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 1 } },
        { id: 'satellite-road-labels', type: 'raster', source: 'roadsLabels', minzoom: 7, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.20, 11, 0.58, 15, 0.74] } },
        { id: 'satellite-place-labels', type: 'raster', source: 'satelliteLabels', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.34, 7, 0.58, 12, 0.80] } }
      ]
    };
  }

  function getMode() {
    const q = new URLSearchParams(location.search);
    const param = (q.get('map') || q.get('basemap') || '').toLowerCase();
    if (param === 'satellite' || param === 'sat' || param === 'imagery') return 'satellite';
    if (param === 'dark' || param === 'map') return 'dark';
    try { return localStorage.getItem(STYLE_KEY) || 'dark'; } catch { return 'dark'; }
  }

  function setStoredMode(mode) {
    try { localStorage.setItem(STYLE_KEY, mode); } catch {}
  }

  function setStatus(mode) {
    const readout = document.getElementById('readout');
    const systemState = document.getElementById('systemState');
    if (systemState) systemState.textContent = mode === 'satellite' ? 'SATELLITE' : 'MAP READY';
    if (readout && window.__osirisRealMap) readout.textContent = `${mode === 'satellite' ? 'SATELLITE' : 'MAP'} · Z ${window.__osirisRealMap.getZoom().toFixed(2)}`;
  }

  function injectToggle() {
    if (document.getElementById('satelliteToggle')) return document.getElementById('satelliteToggle');
    const button = document.createElement('button');
    button.id = 'satelliteToggle';
    button.type = 'button';
    button.className = 'satellite-toggle';
    button.setAttribute('aria-label', 'Toggle satellite map mode');
    button.innerHTML = '<span>SAT</span>';
    document.body.appendChild(button);
    return button;
  }

  function injectStyle() {
    if (document.getElementById('satelliteToggleStyles')) return;
    const style = document.createElement('style');
    style.id = 'satelliteToggleStyles';
    style.textContent = `
      .satellite-toggle{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 82px);z-index:520;width:52px;height:52px;border:1px solid rgba(215,183,57,.42);border-radius:18px;background:rgba(5,7,17,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f5d96b;box-shadow:0 12px 34px rgba(0,0,0,.46),inset 0 0 18px rgba(215,183,57,.08);font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;display:grid;place-items:center;touch-action:manipulation;}
      .satellite-toggle.active{background:rgba(215,183,57,.24);border-color:rgba(245,217,107,.88);color:#fff;text-shadow:0 0 10px rgba(245,217,107,.76);}
      .satellite-toggle:active{transform:scale(.96);}
      body.osiris-satellite-mode.osiris-primary-map.osiris-map-ready .space-vignette{background:linear-gradient(180deg,rgba(2,3,10,.26),rgba(2,3,10,.00) 22%,rgba(2,3,10,.00) 74%,rgba(2,3,10,.30))!important;}
      body.osiris-satellite-mode.osiris-primary-map.osiris-map-ready .scan-lines{opacity:.025!important;}
      @media(max-width:760px){.satellite-toggle{left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 78px);width:48px;height:48px;border-radius:16px;}}
    `;
    document.head.appendChild(style);
  }

  function currentCamera(map) {
    try {
      const center = map.getCenter();
      return { center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
    } catch { return null; }
  }

  function applyMode(mode, remember = true) {
    const map = window.__osirisRealMap;
    if (!map) return false;
    const button = injectToggle();
    const camera = currentCamera(map);
    document.body.classList.toggle('osiris-satellite-mode', mode === 'satellite');
    button.classList.toggle('active', mode === 'satellite');
    button.querySelector('span').textContent = mode === 'satellite' ? 'MAP' : 'SAT';
    if (remember) setStoredMode(mode);
    try {
      map.setStyle(mode === 'satellite' ? satelliteStyle() : DARK_STYLE, { diff: false });
      map.once('style.load', () => {
        if (camera) map.jumpTo(camera);
        setTimeout(() => {
          if (camera) map.jumpTo(camera);
          setStatus(mode);
        }, 120);
      });
    } catch {
      try { map.setStyle(DARK_STYLE, { diff: false }); } catch {}
    }
    setStatus(mode);
    return true;
  }

  function install() {
    injectStyle();
    const button = injectToggle();
    const wait = () => {
      const map = window.__osirisRealMap;
      if (!map) {
        if (Date.now() - STARTED < MAX_WAIT_MS) setTimeout(wait, 80);
        return;
      }
      const initial = getMode();
      button.addEventListener('click', () => {
        const next = document.body.classList.contains('osiris-satellite-mode') ? 'dark' : 'satellite';
        applyMode(next, true);
      });
      if (initial === 'satellite') applyMode('satellite', false);
      else {
        button.classList.remove('active');
        button.querySelector('span').textContent = 'SAT';
      }
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
