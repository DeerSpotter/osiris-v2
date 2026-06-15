'use strict';

(function () {
  const VERSION = '20260615-aeris-aircraft-silhouettes';
  const MODEL_LAYER_ID = 'osiris-aeris-aircraft-models';
  const ICONS = {
    commercial: ['aeris-aircraft-commercial', '#24dce9', '#c8fbff'],
    private: ['aeris-aircraft-private', '#f5d96b', '#fff3a3'],
    jet: ['aeris-aircraft-jet', '#ffd45f', '#fff0a0'],
    military: ['aeris-aircraft-military', '#e83b7f', '#ffb3d0'],
    helo: ['aeris-aircraft-helo', '#7af7ff', '#d8feff']
  };

  function map() {
    return window.__osirisRealMap || null;
  }

  function aircraftSvg(fill, stroke, variant) {
    const body = variant === 'helo'
      ? '<path d="M31 9h4v18h13v4H35v14h9v4H20v-4h9V31H16v-4h13z"/><path d="M8 25h48v4H8z"/><path d="M25 53h16l-4 5h-8z"/>'
      : variant === 'military'
        ? '<path d="M32 3l7 25 21 6-21 6-7 21-7-21-21-6 21-6z"/><path d="M21 41l-8 10 14-5z"/><path d="M43 41l8 10-14-5z"/>'
        : variant === 'jet'
          ? '<path d="M32 3l8 26 20 8-22 3-6 21-6-21-22-3 20-8z"/><path d="M25 41l-9 11 13-5z"/><path d="M39 41l9 11-13-5z"/>'
          : '<path d="M32 3l6 26 22 5-22 5-6 22-6-22-22-5 22-5z"/><path d="M25 41l-10 10 14-5z"/><path d="M39 41l10 10-14-5z"/>';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <filter id="glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g filter="url(#glow)" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
        ${body}
      </g>
    </svg>`;
  }

  function dataUri(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function loadIcon(m, id, fill, stroke, variant) {
    if (m.hasImage?.(id)) return;
    const uri = dataUri(aircraftSvg(fill, stroke, variant));
    m.loadImage(uri, (error, image) => {
      if (error || !image || m.hasImage?.(id)) return;
      try { m.addImage(id, image, { pixelRatio: 2 }); } catch {}
      window.setTimeout(applyAircraftAssets, 0);
    });
  }

  function ensureIcons(m) {
    loadIcon(m, ...ICONS.commercial, 'commercial');
    loadIcon(m, ...ICONS.private, 'commercial');
    loadIcon(m, ...ICONS.jet, 'jet');
    loadIcon(m, ...ICONS.military, 'military');
    loadIcon(m, ...ICONS.helo, 'helo');
  }

  function applyAircraftAssets() {
    const m = map();
    if (!m || !m.isStyleLoaded?.() || !m.getLayer?.(MODEL_LAYER_ID)) return false;
    ensureIcons(m);

    const iconImage = [
      'case',
      ['==', ['get', 'glyph'], '✚'], 'aeris-aircraft-helo',
      ['match', ['get', 'layer'],
        'military', 'aeris-aircraft-military',
        'jets', 'aeris-aircraft-jet',
        'private', 'aeris-aircraft-private',
        'aeris-aircraft-commercial'
      ]
    ];

    try { m.setLayoutProperty(MODEL_LAYER_ID, 'text-field', ''); } catch {}
    try { m.setPaintProperty(MODEL_LAYER_ID, 'text-opacity', 0); } catch {}
    try { m.setLayoutProperty(MODEL_LAYER_ID, 'icon-image', iconImage); } catch {}
    try {
      m.setLayoutProperty(MODEL_LAYER_ID, 'icon-size', [
        'interpolate', ['linear'], ['zoom'],
        1, 0.34,
        5, 0.46,
        8, 0.58,
        12, 0.78,
        16, 1.04,
        18, 1.28
      ]);
    } catch {}
    try { m.setLayoutProperty(MODEL_LAYER_ID, 'icon-rotate', ['get', 'heading']); } catch {}
    try { m.setLayoutProperty(MODEL_LAYER_ID, 'icon-rotation-alignment', 'map'); } catch {}
    try { m.setLayoutProperty(MODEL_LAYER_ID, 'icon-pitch-alignment', 'map'); } catch {}
    try { m.setLayoutProperty(MODEL_LAYER_ID, 'icon-allow-overlap', true); } catch {}
    try { m.setLayoutProperty(MODEL_LAYER_ID, 'icon-ignore-placement', true); } catch {}
    try { m.setPaintProperty(MODEL_LAYER_ID, 'icon-opacity', document.body.classList.contains('osiris-aeris-mode') ? 0.98 : 0); } catch {}
    return true;
  }

  function waitForLayer() {
    applyAircraftAssets();
    window.setTimeout(waitForLayer, document.body.classList.contains('osiris-aeris-mode') ? 900 : 2000);
  }

  function install() {
    window.__osirisAerisAircraftAssets = { version: VERSION, apply: applyAircraftAssets };
    window.addEventListener('osiris:aeris-mode', () => window.setTimeout(applyAircraftAssets, 50));
    window.addEventListener('osiris:flight-feed', () => window.setTimeout(applyAircraftAssets, 50));
    const bindStyleLoad = () => {
      const m = map();
      if (!m) return window.setTimeout(bindStyleLoad, 250);
      if (!m.__osirisAerisAssetsBound) {
        m.__osirisAerisAssetsBound = true;
        m.on('style.load', () => window.setTimeout(applyAircraftAssets, 160));
      }
      waitForLayer();
    };
    bindStyleLoad();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
