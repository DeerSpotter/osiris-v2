'use strict';

(function () {
  const FLIGHT_PROXY_URL = 'https://osiris-v2.spotterdeer.workers.dev';
  const ACTIVE_REFRESH_MS = 15_000;
  const NORMAL_REFRESH_MS = 30_000;
  const HIDDEN_REFRESH_MS = 90_000;
  const MIN_REFRESH_MS = 10_000;
  const MAX_BACKOFF_MS = 120_000;
  const LOCAL_DIST_NM = 250;
  const FALLBACK_COOLDOWN_MS = 60_000;
  const AIR_LAYER_KEYS = ['flights', 'private', 'jets', 'military'];
  const FALLBACK_REGIONS = [
    { name: 'NORTHEAST', lat: 40.3, lon: -75.0, dist: 300 },
    { name: 'ATLANTA', lat: 33.65, lon: -84.42, dist: 300 },
    { name: 'CHICAGO', lat: 41.88, lon: -87.63, dist: 300 },
    { name: 'DALLAS', lat: 32.78, lon: -97.04, dist: 300 },
    { name: 'LOS ANGELES', lat: 34.05, lon: -118.25, dist: 300 },
    { name: 'SEATTLE', lat: 47.61, lon: -122.33, dist: 300 },
    { name: 'LONDON', lat: 51.47, lon: -0.45, dist: 300 },
    { name: 'FRANKFURT', lat: 50.04, lon: 8.57, dist: 300 }
  ];

  let timer = 0;
  let inFlight = false;
  let lastRequestAt = 0;
  let failureCount = 0;
  let sequence = 0;
  let lastQueryKey = '';
  let lastFallbackAt = 0;
  let lastCenterKey = '';

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

  function feedQueryFor(lat, lon, dist = LOCAL_DIST_NM) {
    const qLat = Math.max(-85, Math.min(85, Number(lat))).toFixed(3);
    const qLon = ((((Number(lon) + 540) % 360) - 180)).toFixed(3);
    return `lat=${qLat}&lon=${qLon}&dist=${dist}`;
  }

  function buildLocalQuery() {
    const center = map()?.getCenter?.();
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return '';
    return feedQueryFor(center.lat, center.lng, LOCAL_DIST_NM);
  }

  function regionDistance(region, center) {
    if (!center) return 0;
    const dLat = Number(center.lat) - region.lat;
    const dLon = Number(center.lng) - region.lon;
    return dLat * dLat + dLon * dLon;
  }

  function nearestFallbackQuery() {
    const center = map()?.getCenter?.();
    const region = [...FALLBACK_REGIONS].sort((a, b) => regionDistance(a, center) - regionDistance(b, center))[0] || FALLBACK_REGIONS[0];
    return { query: feedQueryFor(region.lat, region.lon, region.dist), name: region.name };
  }

  function feedUrl(query = null) {
    const q = query ?? (activeAeris() ? buildLocalQuery() : '');
    lastQueryKey = q || 'global';
    return q ? `${FLIGHT_PROXY_URL}/flights?${q}` : `${FLIGHT_PROXY_URL}/flights`;
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

  async function fetchFlightFeed() {
    const primaryQuery = activeAeris() ? buildLocalQuery() : '';
    const primaryUrl = feedUrl(primaryQuery);
    const primary = await fetchJson(primaryUrl, activeAeris() ? 12_000 : 14_000);
    if (!activeAeris() || groupedTotal(primary) > 0) return { data: primary, requestUrl: primaryUrl, queryKey: lastQueryKey };

    const now = Date.now();
    const fallback = nearestFallbackQuery();
    const allowFallback = now - lastFallbackAt > FALLBACK_COOLDOWN_MS || lastCenterKey !== primaryQuery;
    if (!allowFallback || fallback.query === primaryQuery) return { data: primary, requestUrl: primaryUrl, queryKey: lastQueryKey };

    lastFallbackAt = now;
    lastCenterKey = primaryQuery;
    const fallbackUrl = feedUrl(fallback.query);
    const fallbackData = await fetchJson(fallbackUrl, 12_000);
    if (groupedTotal(fallbackData) > 0) {
      fallbackData.source = `${fallbackData.source || 'cloudflare worker'} · fallback ${fallback.name}`;
      return { data: fallbackData, requestUrl: fallbackUrl, queryKey: fallback.query };
    }
    return { data: primary, requestUrl: primaryUrl, queryKey: primaryQuery || 'global' };
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

  function publishSnapshot(data, requestUrl, queryKey) {
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
      queryKey: queryKey || lastQueryKey,
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
    try {
      const { data, requestUrl, queryKey } = await fetchFlightFeed();
      failureCount = 0;
      publishSnapshot(data, requestUrl, queryKey);
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
  window.addEventListener('moveend', () => {
    if (activeAeris()) scheduleNext(Math.max(MIN_REFRESH_MS, 12_000));
  });

  if (document.readyState === 'complete') startFlightFeed();
  else window.addEventListener('load', startFlightFeed, { once: true });
})();
