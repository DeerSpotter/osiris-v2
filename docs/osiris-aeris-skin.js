'use strict';

(function () {
  const AIR_LAYER_IDS = [
    'osiris-aeris-aircraft-halo',
    'osiris-aeris-aircraft-models',
    'osiris-aeris-aircraft-labels'
  ];
  const PRESETS = [
    ['Philadelphia', 39.9526, -75.1652, 8.2],
    ['New York', 40.7128, -74.0060, 8.0],
    ['Washington', 38.9072, -77.0369, 8.0],
    ['Atlanta', 33.65, -84.42, 8.3],
    ['Chicago', 41.88, -87.63, 8.0],
    ['Dallas', 32.78, -97.04, 8.1],
    ['Los Angeles', 34.05, -118.25, 8.0],
    ['San Francisco', 37.7749, -122.4194, 8.2],
    ['Seattle', 47.61, -122.33, 8.1],
    ['London', 51.47, -0.45, 8.0],
    ['Frankfurt', 50.04, 8.57, 8.2]
  ];
  const HOME = PRESETS[0];
  const ALT_FEET_EXPR = [
    'case',
    ['<=', ['coalesce', ['get', 'alt'], 0], 20000],
    ['*', ['coalesce', ['get', 'alt'], 0], 3.28084],
    ['coalesce', ['get', 'alt'], 0]
  ];
  const ALT_COLOR = [
    'interpolate', ['linear'], ALT_FEET_EXPR,
    0, '#7af7ff',
    499, '#61f5ff',
    2001, '#42e7f2',
    5000, '#35d0ec',
    10000, '#57aae9',
    20000, '#a98fe1',
    42651, '#ffd45f'
  ];

  let installed = false;
  let observer = null;
  let wasActive = false;

  function map() { return window.__osirisRealMap || null; }
  function active() { return document.body.classList.contains('osiris-aeris-mode'); }
  function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
  function feed() { return window.__osirisLastFlightFeed || {}; }
  function data() { return feed().data || {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }

  function injectCss() {
    if (document.getElementById('osirisAerisSkinStyles')) return;
    const style = document.createElement('style');
    style.id = 'osirisAerisSkinStyles';
    style.textContent = `
      body.osiris-aeris-mode .live-header,body.osiris-aeris-mode .telemetry-card,body.osiris-aeris-mode .event-card,body.osiris-aeris-mode .bottom-nav,body.osiris-aeris-mode .projection-toggle{display:none!important;}
      body.osiris-aeris-mode .aeris-panel{display:none!important;}
      body.osiris-aeris-mode .aeris-toggle{display:none!important;}
      body.osiris-aeris-mode .space-vignette{background:radial-gradient(circle at 50% 50%,transparent 44%,rgba(0,0,0,.20) 68%,rgba(0,0,0,.72) 100%),linear-gradient(180deg,rgba(0,2,8,.38),transparent 28%,transparent 72%,rgba(0,2,8,.46))!important;}
      body.osiris-aeris-mode .scan-lines{opacity:.018!important;}
      .aeris-skin{position:fixed;inset:0;z-index:526;display:none;pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#eafcff;}
      body.osiris-aeris-mode .aeris-skin{display:block;}
      .aeris-card{position:absolute;top:max(14px,env(safe-area-inset-top));left:max(14px,env(safe-area-inset-left));width:min(232px,calc(100vw - 28px));padding:11px 12px 10px;border:1px solid rgba(122,247,255,.18);border-radius:18px;background:linear-gradient(180deg,rgba(3,9,18,.70),rgba(3,7,15,.48));box-shadow:0 18px 50px rgba(0,0,0,.42),inset 0 0 26px rgba(122,247,255,.035);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);pointer-events:auto;}
      .aeris-brand{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
      .aeris-brand strong{color:#f8ffff;font-size:20px;line-height:1;font-weight:850;letter-spacing:-.05em;text-transform:lowercase;text-shadow:0 0 18px rgba(122,247,255,.26);}
      .aeris-close{width:28px;height:28px;border:1px solid rgba(122,247,255,.24);border-radius:10px;background:rgba(0,0,0,.22);color:rgba(234,252,255,.74);font:900 16px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer;}
      .aeris-metrics{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:baseline;}
      .aeris-metrics b{font-size:16px;line-height:1;color:#f9fdff;font-weight:800;letter-spacing:-.03em;}
      .aeris-metrics span{font-size:11px;line-height:1.1;color:rgba(234,252,255,.66);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .aeris-actions{display:flex;gap:7px;margin-top:10px;}
      .aeris-action{border:1px solid rgba(122,247,255,.20);border-radius:11px;background:rgba(0,0,0,.20);color:rgba(234,252,255,.82);padding:7px 10px;font-size:11px;line-height:1;font-weight:750;cursor:pointer;touch-action:manipulation;}
      .aeris-action:hover,.aeris-action:focus-visible,.aeris-close:hover,.aeris-close:focus-visible{border-color:rgba(122,247,255,.58);color:#fff;outline:none;}
      .aeris-action:active,.aeris-close:active{transform:scale(.96);}
      .aeris-legend{position:absolute;right:max(14px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);display:grid;grid-template-columns:auto auto;gap:7px 9px;align-items:center;padding:10px 11px;border-radius:16px;border:1px solid rgba(122,247,255,.13);background:linear-gradient(180deg,rgba(2,8,16,.52),rgba(2,6,12,.32));box-shadow:0 18px 50px rgba(0,0,0,.30);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);pointer-events:none;}
      .aeris-legend-title{grid-column:1/-1;color:rgba(234,252,255,.72);font-size:10px;text-transform:uppercase;letter-spacing:.16em;margin-bottom:2px;}
      .aeris-dot{width:8px;height:8px;border-radius:99px;background:var(--c);box-shadow:0 0 14px var(--c);}
      .aeris-alt{font-size:11px;color:rgba(234,252,255,.72);white-space:nowrap;}
      @media(max-width:760px){.aeris-card{top:max(10px,env(safe-area-inset-top));left:max(10px,env(safe-area-inset-left));width:min(218px,calc(100vw - 20px));padding:10px 11px;}.aeris-brand strong{font-size:19px;}.aeris-legend{right:max(8px,env(safe-area-inset-right));padding:8px 9px;gap:6px 7px;}.aeris-alt{font-size:10px;}}
      @media(max-width:390px){.aeris-card{width:202px;}.aeris-metrics b{font-size:14px;}.aeris-metrics span{font-size:10px;}.aeris-legend{top:auto;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 12px);transform:none;}.aeris-legend-title{display:none;}}
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    if (document.getElementById('aerisSkin')) return;
    const shell = document.createElement('aside');
    shell.id = 'aerisSkin';
    shell.className = 'aeris-skin';
    shell.setAttribute('aria-label', 'AERIS flight radar view');
    shell.innerHTML = `
      <section class="aeris-card">
        <div class="aeris-brand"><strong>aeris</strong><button type="button" class="aeris-close" aria-label="Close AERIS mode">×</button></div>
        <div class="aeris-metrics">
          <b id="aerisSkinTotal">0</b><span id="aerisSkinSource">adsb.lol</span>
          <b id="aerisSkinVisible">0</b><span id="aerisSkinLocation">Local view</span>
        </div>
        <div class="aeris-actions">
          <button type="button" class="aeris-action" id="aerisSkinReset">Reset</button>
          <button type="button" class="aeris-action" id="aerisSkinRandom">Random</button>
        </div>
      </section>
      <section class="aeris-legend" aria-label="Altitude legend">
        <div class="aeris-legend-title">Altitude</div>
        <span class="aeris-dot" style="--c:#ffd45f"></span><span class="aeris-alt">42,651 ft</span>
        <span class="aeris-dot" style="--c:#a98fe1"></span><span class="aeris-alt">20,000 ft</span>
        <span class="aeris-dot" style="--c:#57aae9"></span><span class="aeris-alt">10,000 ft</span>
        <span class="aeris-dot" style="--c:#35d0ec"></span><span class="aeris-alt">5,000 ft</span>
        <span class="aeris-dot" style="--c:#42e7f2"></span><span class="aeris-alt">2,001 ft</span>
        <span class="aeris-dot" style="--c:#61f5ff"></span><span class="aeris-alt">499 ft</span>
        <span class="aeris-dot" style="--c:#7af7ff"></span><span class="aeris-alt">0 ft</span>
      </section>
    `;
    shell.querySelector('.aeris-close')?.addEventListener('click', () => window.__osirisSetAerisMode?.(false));
    shell.querySelector('#aerisSkinReset')?.addEventListener('click', () => flyTo(HOME));
    shell.querySelector('#aerisSkinRandom')?.addEventListener('click', () => flyTo(PRESETS[Math.floor(Math.random() * PRESETS.length)]));
    document.body.appendChild(shell);
  }

  function sourceLabel() {
    const source = String(data().source || '').toLowerCase();
    if (source.includes('adsb')) return 'adsb.lol';
    if (source.includes('opensky')) return 'OpenSky';
    if (source.includes('airplanes')) return 'Airplanes.live';
    if (source.includes('worker')) return 'ADS-B merge';
    return data().source ? String(data().source).slice(0, 18) : 'adsb.lol';
  }

  function flightGroups() {
    return [
      ...asArray(data().commercial_flights),
      ...asArray(data().private_flights),
      ...asArray(data().private_jets),
      ...asArray(data().military_flights)
    ];
  }

  function visibleCount() {
    if (typeof model === 'undefined' || !model.activeLayers) return flightGroups().length;
    let count = 0;
    if (model.activeLayers.flights) count += asArray(data().commercial_flights).length;
    if (model.activeLayers.private) count += asArray(data().private_flights).length;
    if (model.activeLayers.jets) count += asArray(data().private_jets).length;
    if (model.activeLayers.military) count += asArray(data().military_flights).length;
    return count;
  }

  function updateHud() {
    const total = document.getElementById('aerisSkinTotal');
    const visible = document.getElementById('aerisSkinVisible');
    const source = document.getElementById('aerisSkinSource');
    const loc = document.getElementById('aerisSkinLocation');
    const center = map()?.getCenter?.();
    const rendered = num(feed().rendered ?? data().rendered_total ?? data().total, flightGroups().length);
    if (total) total.textContent = rendered.toLocaleString();
    if (visible) visible.textContent = visibleCount().toLocaleString();
    if (source) source.textContent = sourceLabel();
    if (loc && center) loc.textContent = nearestName(center.lat, center.lng);
  }

  function distanceNm(aLat, aLon, bLat, bLon) {
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
    return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function nearestName(lat, lon) {
    let best = null;
    for (const [name, pLat, pLon] of PRESETS) {
      const d = distanceNm(lat, lon, pLat, pLon);
      if (!best || d < best.d) best = { name, d };
    }
    return best && best.d < 220 ? best.name : 'Local view';
  }

  function flyTo(preset) {
    const m = map();
    if (!m || !preset) return;
    const [, lat, lon, zoom] = preset;
    m.easeTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), zoom), pitch: 62, bearing: -18, duration: 620 });
  }

  function styleAircraftLayers() {
    const m = map();
    if (!m || !m.isStyleLoaded?.()) return;
    const visibility = active() ? 'visible' : 'none';
    for (const id of AIR_LAYER_IDS) {
      if (!m.getLayer(id)) continue;
      try { m.setLayoutProperty(id, 'visibility', visibility); } catch {}
    }
    if (m.getLayer('osiris-aeris-aircraft-halo')) {
      try { m.setPaintProperty('osiris-aeris-aircraft-halo', 'circle-color', ALT_COLOR); } catch {}
      try { m.setPaintProperty('osiris-aeris-aircraft-halo', 'circle-opacity', active() ? ['interpolate', ['linear'], ['zoom'], 1, 0.10, 8, 0.20, 14, 0.30, 19, 0.40] : 0); } catch {}
    }
    if (m.getLayer('osiris-aeris-aircraft-models')) {
      try { m.setPaintProperty('osiris-aeris-aircraft-models', 'text-color', ALT_COLOR); } catch {}
      try { m.setPaintProperty('osiris-aeris-aircraft-models', 'text-opacity', active() ? 0.98 : 0); } catch {}
    }
    if (m.getLayer('osiris-aeris-aircraft-labels')) {
      try { m.setPaintProperty('osiris-aeris-aircraft-labels', 'text-color', '#f8ffff'); } catch {}
      try { m.setPaintProperty('osiris-aeris-aircraft-labels', 'text-opacity', active() ? ['interpolate', ['linear'], ['zoom'], 7.2, 0.0, 9, 0.82, 14, 1] : 0); } catch {}
    }
  }

  function applyAerisView() {
    const isActive = active();
    updateHud();
    styleAircraftLayers();
    const m = map();
    if (!m) {
      wasActive = isActive;
      return;
    }
    if (isActive && !wasActive) {
      window.__osirisSetBasemap?.('dark');
      window.__osirisSetProjection?.('mercator');
      try { m.dragRotate?.enable?.(); } catch {}
      try { m.touchPitch?.enable?.(); } catch {}
    }
    wasActive = isActive;
  }

  function install() {
    if (installed) return;
    installed = true;
    injectCss();
    buildUi();
    observer = new MutationObserver(applyAerisView);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const tick = () => { applyAerisView(); window.setTimeout(tick, active() ? 1000 : 2500); };
    tick();
    const bindMap = () => {
      const m = map();
      if (!m || m.__osirisAerisSkinBound) return window.setTimeout(bindMap, 250);
      m.__osirisAerisSkinBound = true;
      m.on('style.load', () => window.setTimeout(styleAircraftLayers, 150));
      m.on('moveend', updateHud);
      styleAircraftLayers();
    };
    bindMap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
