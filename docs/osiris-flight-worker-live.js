'use strict';

(function () {
  const FLIGHT_PROXY_URL = 'https://osiris-v2.spotterdeer.workers.dev';
  const REFRESH_MS = 45_000;
  const AIR_LAYER_KEYS = ['flights', 'private', 'jets', 'military'];

  function asArray(value) {
    return Array.isArray(value) ? value : [];
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

  async function refreshFlights() {
    if (typeof model === 'undefined') return;

    const response = await fetch(`${FLIGHT_PROXY_URL}/flights`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error(`Flight Worker ${response.status}`);

    const data = await response.json();
    const commercial = asArray(data.commercial_flights);
    const privateFlights = asArray(data.private_flights);
    const jets = asArray(data.private_jets);
    const military = asArray(data.military_flights);

    const rendered =
      publishLayer('flights', commercial, 'cyan', 'Commercial') +
      publishLayer('private', privateFlights, 'gold', 'Private') +
      publishLayer('jets', jets, 'gold', 'Private jet') +
      publishLayer('military', military, 'red', 'Military');

    enableAviationLayersOnce();

    if (model.ready) model.ready.live = true;
    if (typeof systemState !== 'undefined' && systemState) systemState.textContent = 'LIVE ADS-B';
    if (typeof feedCount !== 'undefined' && feedCount) feedCount.textContent = String(rendered);
    if (typeof readout !== 'undefined' && readout) readout.textContent = `LIVE ADS-B · ${rendered.toLocaleString()} FLIGHTS · CLOUDFLARE WORKER`;

    if (typeof updateLayerStatus === 'function') updateLayerStatus();
  }

  async function safeRefreshFlights() {
    try {
      await refreshFlights();
    } catch (error) {
      console.warn('[OSIRIS] live flight worker refresh failed', error);
    }
  }

  window.addEventListener('load', () => {
    safeRefreshFlights();
    window.setInterval(safeRefreshFlights, REFRESH_MS);
  });
})();
