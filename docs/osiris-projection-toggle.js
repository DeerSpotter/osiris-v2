(() => {
  const STORAGE_KEY = 'osiris-pages:projection-mode';
  const STARTED = Date.now();
  const MAX_WAIT_MS = 15000;

  function getInitialMode() {
    const q = new URLSearchParams(location.search);
    const raw = (q.get('projection') || q.get('view') || q.get('mode') || '').toLowerCase();
    if (raw === 'globe' || raw === '3d' || raw === 'orbit') return 'globe';
    if (raw === 'mercator' || raw === '2d' || raw === 'map') return '2d';
    try { return localStorage.getItem(STORAGE_KEY) || '2d'; } catch { return '2d'; }
  }

  function storeMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }

  function injectStyle() {
    if (document.getElementById('projectionToggleStyles')) return;
    const style = document.createElement('style');
    style.id = 'projectionToggleStyles';
    style.textContent = `
      .projection-toggle{position:fixed;left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 140px);z-index:521;width:52px;height:52px;border:1px solid rgba(215,183,57,.42);border-radius:18px;background:rgba(5,7,17,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#f5d96b;box-shadow:0 12px 34px rgba(0,0,0,.46),inset 0 0 18px rgba(215,183,57,.08);font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.13em;display:grid;place-items:center;touch-action:manipulation;}
      .projection-toggle.active{background:rgba(215,183,57,.24);border-color:rgba(245,217,107,.88);color:#fff;text-shadow:0 0 10px rgba(245,217,107,.76);}
      .projection-toggle:active{transform:scale(.96);}
      body.osiris-globe-projection.osiris-primary-map.osiris-map-ready .space-vignette{background:radial-gradient(circle at 50% 48%,rgba(2,3,10,0) 0%,rgba(2,3,10,0) 48%,rgba(2,3,10,.38) 72%,rgba(2,3,10,.76) 100%),linear-gradient(180deg,rgba(2,3,10,.52),rgba(2,3,10,.04) 26%,rgba(2,3,10,.04) 70%,rgba(2,3,10,.56))!important;}
      body.osiris-globe-projection .maplibregl-canvas{background:#02030a;}
      @media(max-width:760px){.projection-toggle{left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 132px);width:48px;height:48px;border-radius:16px;}}
    `;
    document.head.appendChild(style);
  }

  function injectToggle() {
    if (document.getElementById('projectionToggle')) return document.getElementById('projectionToggle');
    const button = document.createElement('button');
    button.id = 'projectionToggle';
    button.type = 'button';
    button.className = 'projection-toggle';
    button.setAttribute('aria-label', 'Toggle 2D and globe map projection');
    button.innerHTML = '<span>2D</span>';
    document.body.appendChild(button);
    return button;
  }

  function setStatus(mode, ok = true) {
    const readout = document.getElementById('readout');
    const systemState = document.getElementById('systemState');
    const map = window.__osirisRealMap;
    if (systemState) systemState.textContent = ok ? (mode === 'globe' ? 'GLOBE' : 'MAP READY') : '2D ONLY';
    if (readout && map) readout.textContent = `${ok ? (mode === 'globe' ? 'GLOBE' : '2D MAP') : 'GLOBE UNSUPPORTED'} · Z ${map.getZoom().toFixed(2)}`;
  }

  function verifyProjection(map, expected) {
    try {
      const p = map.getProjection?.();
      const name = typeof p === 'string' ? p : (p?.type || p?.name);
      return !name || String(name).toLowerCase().includes(expected === 'globe' ? 'globe' : 'mercator');
    } catch {
      return true;
    }
  }

  function applyProjection(mode, remember = true) {
    const map = window.__osirisRealMap;
    const button = injectToggle();
    if (!map) return false;

    const target = mode === 'globe' ? 'globe' : '2d';
    const center = map.getCenter?.();
    const camera = center ? {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing?.() || 0,
      pitch: 0
    } : null;

    try {
      if (target === 'globe') {
        map.setProjection({ type: 'globe' });
        map.setRenderWorldCopies?.(false);
        document.body.classList.add('osiris-globe-projection');
        button.classList.add('active');
        button.querySelector('span').textContent = 'GLB';
      } else {
        map.setProjection({ type: 'mercator' });
        map.setRenderWorldCopies?.(true);
        document.body.classList.remove('osiris-globe-projection');
        button.classList.remove('active');
        button.querySelector('span').textContent = '2D';
      }
      if (camera) map.jumpTo(camera);
      map.resize?.();
      const ok = verifyProjection(map, target === 'globe' ? 'globe' : 'mercator');
      if (remember && ok) storeMode(target);
      setStatus(target, ok);
      return ok;
    } catch (error) {
      console.warn('[osiris-projection-toggle] projection unavailable', error);
      document.body.classList.remove('osiris-globe-projection');
      button.classList.remove('active');
      button.querySelector('span').textContent = '2D';
      try { map.setProjection?.({ type: 'mercator' }); map.setRenderWorldCopies?.(true); } catch {}
      storeMode('2d');
      setStatus('2d', false);
      return false;
    }
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

      button.addEventListener('click', () => {
        const next = document.body.classList.contains('osiris-globe-projection') ? '2d' : 'globe';
        applyProjection(next, true);
      });

      const initial = getInitialMode();
      if (initial === 'globe') applyProjection('globe', false);
      else applyProjection('2d', false);

      map.on?.('style.load', () => {
        const wanted = (() => { try { return localStorage.getItem(STORAGE_KEY) || '2d'; } catch { return '2d'; } })();
        if (wanted === 'globe') setTimeout(() => applyProjection('globe', false), 0);
      });
    };
    wait();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
