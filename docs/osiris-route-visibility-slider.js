(() => {
  const PATCH_VERSION = '20260614-route-visibility-slider';
  const STORAGE_KEY = 'osiris.routeLineVisibility';
  const ROUTE_LAYERS = [
    'osiris-maritime-routes-lowzoom-line',
    'osiris-routes-line',
    'osiris-cables-line'
  ];

  let value = readStoredValue();
  let lastInjectedDeck = null;
  let observerTimer = 0;

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function readStoredValue() {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved)) return clamp(saved, 0, 1);
    } catch {}
    return 1;
  }

  function storeValue(next) {
    value = clamp(next, 0, 1);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
    applyToMap();
    updateControls();
  }

  function lowZoomOpacityExpression() {
    if (value <= 0.001) return 0;
    return ['*', value, ['interpolate', ['linear'], ['zoom'], 2.15, 0.0, 2.55, 0.10, 4.4, 0.20, 5.75, 0.02]];
  }

  function routeOpacityExpression() {
    if (value <= 0.001) return 0;
    return ['*', value, ['interpolate', ['linear'], ['zoom'], 5.4, 0.0, 6.5, 0.22, 10, 0.42, 14, 0.66]];
  }

  function cableOpacityExpression() {
    if (value <= 0.001) return 0;
    const showSea = !!(window.model?.activeLayers?.sdk_sea || window.model?.activeLayers?.cables);
    return ['*', value, ['case', ['boolean', ['literal', showSea], false], ['interpolate', ['linear'], ['zoom'], 3.6, 0.0, 5, 0.18, 8, 0.36, 13, 0.66], 0]];
  }

  function setLayerVisibility(map, id) {
    if (!map?.getLayer?.(id)) return;
    try { map.setLayoutProperty(id, 'visibility', value <= 0.001 ? 'none' : 'visible'); } catch {}
  }

  function applyToMap() {
    const map = window.__osirisRealMap;
    if (!map?.isStyleLoaded?.()) return false;

    if (map.getLayer('osiris-maritime-routes-lowzoom-line')) {
      try { map.setPaintProperty('osiris-maritime-routes-lowzoom-line', 'line-opacity', lowZoomOpacityExpression()); } catch {}
      setLayerVisibility(map, 'osiris-maritime-routes-lowzoom-line');
    }

    if (map.getLayer('osiris-routes-line')) {
      try { map.setPaintProperty('osiris-routes-line', 'line-opacity', routeOpacityExpression()); } catch {}
      setLayerVisibility(map, 'osiris-routes-line');
    }

    if (map.getLayer('osiris-cables-line')) {
      try { map.setPaintProperty('osiris-cables-line', 'line-opacity', cableOpacityExpression()); } catch {}
      setLayerVisibility(map, 'osiris-cables-line');
    }

    return ROUTE_LAYERS.some((id) => map.getLayer(id));
  }

  function updateControls() {
    const percent = Math.round(value * 100);
    document.querySelectorAll('[data-route-visibility-slider]').forEach((input) => {
      if (Number(input.value) !== percent) input.value = String(percent);
    });
    document.querySelectorAll('[data-route-visibility-value]').forEach((label) => {
      label.textContent = `${percent}%`;
    });
  }

  function controlMarkup() {
    const percent = Math.round(value * 100);
    return `
      <section class="route-visibility-control" data-route-visibility-control>
        <div class="route-visibility-head">
          <span>LINE VISIBILITY</span>
          <strong data-route-visibility-value>${percent}%</strong>
        </div>
        <input type="range" min="0" max="100" step="1" value="${percent}" aria-label="Maritime and route line visibility" data-route-visibility-slider>
        <div class="route-visibility-scale"><span>HIDE</span><span>FULL</span></div>
      </section>`;
  }

  function shouldInjectInto(deck) {
    if (!deck || deck.querySelector('[data-route-visibility-control]')) return false;
    const text = String(deck.textContent || '').toUpperCase();
    if (deck.classList.contains('layers') || text.includes('LAYER CONTROL') || text.includes('SDK SEA MESH')) return true;
    return !!deck.querySelector('[data-toggle-layer="sdk_sea"], [data-toggle-layer="maritime"], [data-toggle-layer="cables"]');
  }

  function injectControl() {
    const deck = document.getElementById('panelDeck') || document.querySelector('.panel-deck,.layer-drawer');
    if (!shouldInjectInto(deck)) return;

    lastInjectedDeck = deck;
    const anchor = deck.querySelector('.stat-grid') || deck.querySelector('.feed-list') || deck.firstElementChild;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = controlMarkup().trim();
    const control = wrapper.firstElementChild;

    if (anchor && anchor.parentNode === deck) deck.insertBefore(control, anchor);
    else deck.appendChild(control);

    const slider = control.querySelector('[data-route-visibility-slider]');
    slider?.addEventListener('input', (event) => storeValue(Number(event.target.value) / 100), { passive: true });
    updateControls();
  }

  function installStyles() {
    if (document.getElementById('routeVisibilitySliderStyles')) return;
    const style = document.createElement('style');
    style.id = 'routeVisibilitySliderStyles';
    style.textContent = `
      .route-visibility-control{margin:10px 0 12px;padding:12px;border:1px solid rgba(245,217,107,.26);border-radius:16px;background:linear-gradient(180deg,rgba(215,183,57,.10),rgba(5,7,17,.40));box-shadow:inset 0 0 20px rgba(215,183,57,.035);}
      .route-visibility-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px;font:800 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;color:#f5d96b;}
      .route-visibility-head strong{color:#00dff7;font-size:11px;letter-spacing:.1em;}
      .route-visibility-control input[type="range"]{width:100%;accent-color:#d7b739;touch-action:pan-y;}
      .route-visibility-scale{display:flex;justify-content:space-between;margin-top:4px;color:rgba(230,238,242,.42);font:700 8px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyles();
    injectControl();
    applyToMap();

    const tryApply = () => {
      applyToMap();
      injectControl();
    };

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target?.closest?.('[data-layer="layers"], [data-toggle-layer], .bottom-nav button')) {
        setTimeout(tryApply, 60);
        setTimeout(tryApply, 220);
      }
    }, true);

    document.addEventListener('input', (event) => {
      if (event.target?.matches?.('[data-route-visibility-slider]')) {
        storeValue(Number(event.target.value) / 100);
      }
    }, true);

    const observer = new MutationObserver(() => {
      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        if (!lastInjectedDeck?.isConnected) lastInjectedDeck = null;
        tryApply();
      }, 70);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const waitForMap = () => {
      const map = window.__osirisRealMap;
      if (!map) return setTimeout(waitForMap, 120);
      map.on?.('style.load', () => setTimeout(applyToMap, 100));
      map.on?.('idle', () => setTimeout(applyToMap, 80));
      map.on?.('moveend', () => setTimeout(applyToMap, 90));
      applyToMap();
    };
    waitForMap();

    window.__osirisRouteVisibilitySlider = { version: PATCH_VERSION, get value() { return value; }, set: storeValue, apply: applyToMap };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
