'use strict';

(function () {
  const FLIGHT_PROXY_URL = 'https://osiris-v2.spotterdeer.workers.dev';
  const REFRESH_MS = 30_000;
  const AIR_LAYER_KEYS = ['flights', 'private', 'jets', 'military'];
  const REGION_QUERIES = [
    'lat=40.3&lon=-75.0&dist=250',
    'lat=33.65&lon=-84.42&dist=250',
    'lat=41.88&lon=-87.63&dist=250',
    'lat=32.78&lon=-97.04&dist=250',
    'lat=34.05&lon=-118.25&dist=250',
    'lat=47.61&lon=-122.33&dist=250',
    'lat=51.47&lon=-0.45&dist=250',
    'lat=50.04&lon=8.57&dist=250'
  ];

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

  function pushUnique(target, source, seen) {
    for (const flight of source) {
      const key = flightKey(flight);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      target.push(flight);
    }
  }

  function mergeFeeds(feeds) {
    const merged = {
      commercial_flights: [],
      private_flights: [],
      private_jets: [],
      military_flights: [],
      gps_jamming: [],
      total: 0,
      rendered_total: 0,
      timestamp: new Date().toISOString(),
      source: 'cloudflare worker regional merge',
      regions: []
    };
    const seen = new Set();

    for (const feed of feeds) {
      const groups = groupedFlights(feed);
      pushUnique(merged.commercial_flights, groups.commercial_flights, seen);
      pushUnique(merged.private_flights, groups.private_flights, seen);
      pushUnique(merged.private_jets, groups.private_jets, seen);
      pushUnique(merged.military_flights, groups.military_flights, seen);
      merged.total += Number(feed?.total || 0);
      merged.regions.push(...asArray(feed?.regions));
    }

    merged.rendered_total = groupedTotal(merged);
    return merged;
  }

  async function fetchJson(url, timeoutMs = 16_000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Flight Worker ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchRegionalFeeds() {
    const settled = await Promise.allSettled(
      REGION_QUERIES.map((query) => fetchJson(`${FLIGHT_PROXY_URL}/flights?${query}`, 12_000))
    );
    return settled
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((feed) => groupedTotal(feed) > 0);
  }

  async function fetchFlightFeed() {
    const defaultFeed = await fetchJson(`${FLIGHT_PROXY_URL}/flights`, 18_000);
    if (groupedTotal(defaultFeed) > 0) return defaultFeed;

    const regionalFeeds = await fetchRegionalFeeds();
    if (regionalFeeds.length > 0) return mergeFeeds(regionalFeeds);

    return defaultFeed;
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

  async function refreshFlights() {
    if (typeof model === 'undefined') return;

    const data = await fetchFlightFeed();
    const groups = groupedFlights(data);

    const rendered =
      publishLayer('flights', groups.commercial_flights, 'cyan', 'Commercial') +
      publishLayer('private', groups.private_flights, 'gold', 'Private') +
      publishLayer('jets', groups.private_jets, 'gold', 'Private jet') +
      publishLayer('military', groups.military_flights, 'red', 'Military');

    enableAviationLayersOnce();

    if (model.ready) model.ready.live = true;
    setFlightStatus(rendered > 0 ? 'LIVE ADS-B' : 'ADS-B 0');
    if (typeof feedCount !== 'undefined' && feedCount) feedCount.textContent = String(rendered);
    if (typeof readout !== 'undefined' && readout) {
      const source = data?.source || 'cloudflare worker';
      readout.textContent = `LIVE ADS-B · ${rendered.toLocaleString()} FLIGHTS · ${source.toUpperCase()}`;
    }

    window.__osirisLastFlightFeed = { rendered, data, updatedAt: new Date().toISOString() };
    if (typeof updateLayerStatus === 'function') updateLayerStatus();
  }

  async function safeRefreshFlights() {
    try {
      await refreshFlights();
    } catch (error) {
      window.__osirisLastFlightFeed = { error: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() };
      setFlightStatus('ADS-B ERR');
      if (typeof readout !== 'undefined' && readout) readout.textContent = `LIVE ADS-B ERROR · ${window.__osirisLastFlightFeed.error}`;
      console.warn('[OSIRIS] live flight worker refresh failed', error);
    }
  }

  function startFlightFeed() {
    window.osirisRefreshFlights = safeRefreshFlights;
    safeRefreshFlights();
    for (const delay of [1_200, 4_000, 9_000, 16_000, 28_000]) window.setTimeout(safeRefreshFlights, delay);
    window.setInterval(safeRefreshFlights, REFRESH_MS);
  }

  if (document.readyState === 'complete') startFlightFeed();
  else window.addEventListener('load', startFlightFeed, { once: true });
})();
