'use strict';

(function () {
  const FLIGHT_PROXY_URL = 'https://osiris-v2.spotterdeer.workers.dev';
  const ACTIVE_REFRESH_MS = 15_000;
  const NORMAL_REFRESH_MS = 30_000;
  const HIDDEN_REFRESH_MS = 90_000;
  const MIN_REFRESH_MS = 10_000;
  const MAX_BACKOFF_MS = 120_000;
  const LOCAL_DIST_NM = 250;
  const AIR_LAYER_KEYS = ['flights', 'private', 'jets', 'military'];

  let timer = 0;
  let inFlight = false;
  let lastRequestAt = 0;
  let failureCount = 0;
  let sequence = 0;
  let lastQueryKey = '';

  function activeAeris() {
    return document.body.classList.contains('osiris-aeris-mode');
  }

  function map() {
    return window.__osirisRealMap || null;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function groupedFlights(data) {
    return {
      commercial_flights: asArray(data?.commercial_flights),
      private_flights: asArray(data?.private_flights),
      private_jets: asArray(data?.private_jets),
      military_flights: asArray(data?.military_flights)
    };
  }

  function groupedTotal(data) {
    const groups = groupedFlights(data);
    return groups.commercial_flights.length + groups.private_flights.length + groups.private_jets.length + groups.military_flights.length;
  }

  function flightKey(flight) {
    return String(flight?.icao24 || flight?.hex || flight?.registration || `${flight?.callsign || ''}:${flight?.lat}:${flight?.lng ?? flight?.lon}`).toLowerCase();
  }

  function buildLocalQuery() {
    const center = map()?.getCenter?.();
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return '';
    const lat = Math.max(-85, Math.min(85, Number(center.lat))).toFixed(3);
    const lon = ((((Number(center.lng) + 540) % 360) - 180)).toFixed(3);
    return `lat=${lat}&lon=${lon}&dist=${LOCAL_DIST_NM}`;
  }

  function feedUrl() {
    const query = activeAeris() ? buildLocalQuery() : '';
    lastQueryKey = query || 'global';
    return query ? `${FLIGHT_PROXY_URL}/flights?${query}` : `${FLIGHT_PROXY_URL}/flights`;
  }

  function nextDelay() {
    if (document.hidden) return HIDDEN_REFRESH_MS;
    const base = activeAeris() ? ACTIVE_REFRESH_MS : NORMAL_REFRESH_MS;
    if (!failureCount) return base;
    return Math.min(MAX_BACKOFF_MS, base * (2 ** Math.min(failureCount, 3)));
  }

  function scheduleNext(delay = nextDelay()) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => safeRefreshFlights(), delay);
  }

  async function fetchJson(url, timeoutMs = 14_000) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Flight Worker ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function flightLabel(flight) {
    return String(flight?.callsign || flight?.icao24 || flight?.registration || 'LIVE FLIGHT').trim();
  }

  function flightMeta(flight, categoryLabel) {
    const parts = ['Live ADS-B', categoryLabel];
    if (flight?.model) parts.push(String(flight.model));
    if (typeof flight?.alt === 'number') parts.push(`${Math.round(flight.alt)} m`);
    if (typeof flight?.speed_knots === 'number') parts.push(`${Math.round(flight.speed_knots)} kt`);
    return parts.filter(Boolean).join(' · ');
  }

  function toNode(flight, layer, toneName, categoryLabel) {
    const lat = Number(flight?.lat);
    const lon = Number(flight?.lng ?? flight?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      label: flightLabel(flight),
      source: flightMeta(flight, categoryLabel),
      layer,
      tone: toneName,
      size: layer === 'military' ? 6.4 : layer === 'jets' ? 5.4 : 4.3,
      priority: layer === 'military' || layer === 'jets',
      heading: Number(flight?.heading ?? flight?.track ?? 0) || 0,
      alt: Number(flight?.alt || 0),
      url: ''
    };
  }

  function toPanelItem(flight, layer, categoryLabel) {
    return {
      title: flightLabel(flight),
      meta: flightMeta(flight, categoryLabel),
      value: flight?.registration || flight?.icao24 || '',
      layer,
      url: ''
    };
  }

  function publishLayer(key, flights, toneName, categoryLabel) {
    const nodes = flights.map((flight) => toNode(flight, key, toneName, categoryLabel)).filter(Boolean);
    const panel = flights.slice(0, 80).map((flight) => toPanelItem(flight, key, categoryLabel));
    if (typeof addToLayer === 'function') {
      addToLayer(key, nodes, [], panel, true);
      return nodes.length;
    }
    if (typeof model !== 'undefined' && model.layers?.[key]) {
      model.layers[key].nodes = nodes;
      model.layers[key].routes = [];
      model.layers[key].panel = panel;
      model.layers[key].loaded = true;
      return nodes.length;
    }
    return 0;
  }

  function enableAviationLayersOnce() {
    if (window.__osirisFlightLayersEnabled) return;
    window.__osirisFlightLayersEnabled = true;
    if (typeof model === 'undefined' || !model.activeLayers) return;
    for (const key of AIR_LAYER_KEYS) model.activeLayers[key] = true;
    model.activePreset = 'custom';
  }

  function setFlightStatus(text) {
    if (typeof systemState !== 'undefined' && systemState) systemState.textContent = text;
  }

  function publishSnapshot(data, requestUrl) {
    const groups = groupedFlights(data);
    const rendered =
      publishLayer('flights', groups.commercial_flights, 'cyan', 'Commercial') +
      publishLayer('private', groups.private_flights, 'gold', 'Private') +
      publishLayer('jets', groups.private_jets, 'gold', 'Private jet') +
      publishLayer('military', groups.military_flights, 'red', 'Military');

    enableAviationLayersOnce();
    if (typeof model !== 'undefined' && model.ready) model.ready.live = true;
    setFlightStatus(rendered > 0 ? 'LIVE ADS-B' : 'ADS-B 0');
    if (typeof feedCount !== 'undefined' && feedCount) feedCount.textContent = String(rendered);
    if (typeof readout !== 'undefined' && readout) {
      const source = data?.source || 'cloudflare worker';
      readout.textContent = `LIVE ADS-B · ${rendered.toLocaleString()} FLIGHTS · ${source.toUpperCase()}`;
    }

    sequence += 1;
    window.__osirisLastFlightFeed = {
      rendered,
      data,
      updatedAt: new Date().toISOString(),
      sequence,
      queryKey: lastQueryKey,
      requestUrl,
      nextRefreshMs: nextDelay()
    };
    window.dispatchEvent(new CustomEvent('osiris:flight-feed', { detail: window.__osirisLastFlightFeed }));
    if (typeof updateLayerStatus === 'function') updateLayerStatus();
  }

  async function refreshFlights(options = {}) {
    if (typeof model === 'undefined') return;
    const now = Date.now();
    if (!options.force && now - lastRequestAt < MIN_REFRESH_MS) return;
    if (inFlight) return;
    if (document.hidden && !options.force) return;

    inFlight = true;
    lastRequestAt = now;
    const url = feedUrl();
    try {
      const data = await fetchJson(url, activeAeris() ? 12_000 : 14_000);
      failureCount = 0;
      publishSnapshot(data, url);
    } finally {
      inFlight = false;
    }
  }

  async function safeRefreshFlights(options = {}) {
    try {
      await refreshFlights(options);
    } catch (error) {
      failureCount += 1;
      window.__osirisLastFlightFeed = {
        ...(window.__osirisLastFlightFeed || {}),
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
        nextRefreshMs: nextDelay()
      };
      setFlightStatus('ADS-B ERR');
      if (typeof readout !== 'undefined' && readout) readout.textContent = `LIVE ADS-B ERROR · ${window.__osirisLastFlightFeed.error}`;
      console.warn('[OSIRIS] live flight worker refresh failed', error);
    } finally {
      scheduleNext();
    }
  }

  function startFlightFeed() {
    window.clearTimeout(timer);
    window.osirisRefreshFlights = (options = {}) => safeRefreshFlights({ ...options, force: true });
    safeRefreshFlights({ force: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scheduleNext(HIDDEN_REFRESH_MS);
    else safeRefreshFlights({ force: true });
  });

  window.addEventListener('osiris:aeris-mode', () => safeRefreshFlights({ force: true }));

  if (document.readyState === 'complete') startFlightFeed();
  else window.addEventListener('load', startFlightFeed, { once: true });
})();
