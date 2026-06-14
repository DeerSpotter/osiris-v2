'use strict';

(function () {
  const VERSION = '20260614-aeris-smooth-animation';
  const SOURCE_ID = 'osiris-aeris-aircraft';
  const FRAME_MS = 66;
  const DEFAULT_TWEEN_MS = 15_000;
  const MAX_TWEEN_MS = 25_000;
  const AIR_GROUPS = [
    ['commercial_flights', 'flights', 'Commercial'],
    ['private_flights', 'private', 'Private'],
    ['private_jets', 'jets', 'Private jet'],
    ['military_flights', 'military', 'Military']
  ];

  let previous = new Map();
  let current = new Map();
  let tweenStart = 0;
  let tweenDuration = DEFAULT_TWEEN_MS;
  let lastSequence = 0;
  let lastFrameAt = 0;
  let rafId = 0;
  let running = false;

  function active() {
    return document.body.classList.contains('osiris-aeris-mode');
  }

  function getMap() {
    return window.__osirisRealMap || null;
  }

  function hasModel() {
    return typeof model !== 'undefined' && !!model.activeLayers;
  }

  function layerVisible(layer) {
    if (!hasModel()) return true;
    return model.activeLayers[layer] !== false;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function callsign(flight) {
    return String(flight?.callsign || flight?.icao24 || flight?.registration || 'LIVE FLIGHT').trim();
  }

  function featureId(flight, layer, index) {
    return String(flight?.icao24 || flight?.hex || flight?.registration || `${layer}:${callsign(flight)}:${index}`).toLowerCase();
  }

  function colorForLayer(layer) {
    if (layer === 'military') return '#e83b7f';
    if (layer === 'jets' || layer === 'private') return '#f5d96b';
    return '#24dce9';
  }

  function glyphForFlight(flight) {
    const text = String(flight?.model || flight?.type || flight?.aircraft_category || '').toLowerCase();
    return /heli|h60|h47|ec|bell|r44/.test(text) ? '✚' : '✈';
  }

  function normalizeHeading(value) {
    return ((num(value, 0) % 360) + 360) % 360;
  }

  function shortestAngle(from, to) {
    return ((((to - from) + 540) % 360) - 180);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpLon(a, b, t) {
    let delta = b - a;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const lon = a + delta * t;
    return ((lon + 540) % 360) - 180;
  }

  function smoothStep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function allFlights(feedData) {
    const result = [];
    for (const [group, layer, category] of AIR_GROUPS) {
      for (const [index, flight] of asArray(feedData?.[group]).entries()) {
        const lat = num(flight?.lat, NaN);
        const lon = num(flight?.lng ?? flight?.lon, NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const heading = normalizeHeading(flight?.heading ?? flight?.track ?? flight?.trueTrack);
        const id = featureId(flight, layer, index);
        result.push({
          id,
          lat,
          lon,
          heading,
          alt: num(flight?.alt, 0),
          speed: num(flight?.speed_knots ?? flight?.velocity, 0),
          layer,
          category,
          color: colorForLayer(layer),
          glyph: glyphForFlight(flight),
          callsign: callsign(flight),
          model: String(flight?.model || flight?.typeCode || flight?.type || ''),
          registration: String(flight?.registration || '')
        });
      }
    }
    return result;
  }

  function mapFromFeed(feedData) {
    const next = new Map();
    for (const item of allFlights(feedData)) next.set(item.id, item);
    return next;
  }

  function snapshotFromCurrentPosition() {
    const nowFeatures = interpolatedFeatures(1, true).features;
    const next = new Map();
    for (const feature of nowFeatures) {
      const p = feature.properties || {};
      const [lon, lat] = feature.geometry?.coordinates || [0, 0];
      next.set(p.id, {
        id: p.id,
        lat,
        lon,
        heading: num(p.heading, 0),
        alt: num(p.alt, 0),
        speed: num(p.speed, 0),
        layer: p.layer,
        category: p.category,
        color: p.color,
        glyph: p.glyph,
        callsign: p.callsign,
        model: p.model,
        registration: p.registration
      });
    }
    return next;
  }

  function acceptFeed(feedSnapshot = window.__osirisLastFlightFeed) {
    const seq = Number(feedSnapshot?.sequence || 0);
    const stamp = seq || Date.parse(feedSnapshot?.updatedAt || '') || 0;
    if (!feedSnapshot?.data || stamp === lastSequence) return false;

    const now = performance.now();
    const next = mapFromFeed(feedSnapshot.data);
    previous = current.size ? snapshotFromCurrentPosition() : new Map(next);
    current = next;
    tweenStart = now;
    tweenDuration = Math.max(5_000, Math.min(MAX_TWEEN_MS, Number(feedSnapshot?.nextRefreshMs || DEFAULT_TWEEN_MS)));
    lastSequence = stamp;
    return true;
  }

  function featureFromAircraft(item) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.lon, item.lat] },
      properties: {
        id: item.id,
        layer: item.layer,
        callsign: item.callsign,
        model: item.model,
        registration: item.registration,
        category: item.category,
        color: item.color,
        glyph: item.glyph,
        heading: item.heading,
        alt: item.alt,
        speed: item.speed
      }
    };
  }

  function interpolateAircraft(id, next, t) {
    const start = previous.get(id);
    if (!start) return next;
    return {
      ...next,
      lat: lerp(start.lat, next.lat, t),
      lon: lerpLon(start.lon, next.lon, t),
      alt: lerp(num(start.alt, 0), num(next.alt, 0), t),
      speed: lerp(num(start.speed, 0), num(next.speed, 0), t),
      heading: normalizeHeading(num(start.heading, 0) + shortestAngle(num(start.heading, 0), num(next.heading, 0)) * t)
    };
  }

  function interpolatedFeatures(forceT = null, includeHidden = false) {
    const now = performance.now();
    const rawT = forceT === null ? (now - tweenStart) / Math.max(1, tweenDuration) : forceT;
    const t = smoothStep(rawT);
    const features = [];
    for (const [id, next] of current.entries()) {
      if (!includeHidden && !layerVisible(next.layer)) continue;
      features.push(featureFromAircraft(interpolateAircraft(id, next, t)));
    }
    return { type: 'FeatureCollection', features };
  }

  function ensureSource(map) {
    if (!map || !map.isStyleLoaded?.()) return false;
    if (!map.getSource(SOURCE_ID)) {
      try { map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }); }
      catch { return false; }
    }
    return true;
  }

  function publishFrame(force = false) {
    const map = getMap();
    if (!active() || document.hidden || !ensureSource(map)) return;
    const now = performance.now();
    if (!force && now - lastFrameAt < FRAME_MS) return;
    lastFrameAt = now;
    try { map.getSource(SOURCE_ID)?.setData(interpolatedFeatures()); } catch {}
  }

  function frame() {
    rafId = 0;
    if (!running) return;
    acceptFeed();
    publishFrame(false);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    window.__osirisAerisAnimationActive = true;
    acceptFeed();
    publishFrame(true);
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    window.__osirisAerisAnimationActive = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function applyMode() {
    if (active() && !document.hidden) start();
    else stop();
  }

  function install() {
    window.addEventListener('osiris:flight-feed', (event) => {
      acceptFeed(event.detail);
      publishFrame(true);
    });
    document.addEventListener('visibilitychange', applyMode);
    const observer = new MutationObserver(applyMode);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const bindMap = () => {
      const map = getMap();
      if (!map) return setTimeout(bindMap, 250);
      if (!map.__osirisAerisAnimationBound) {
        map.__osirisAerisAnimationBound = true;
        map.on('style.load', () => setTimeout(() => publishFrame(true), 150));
      }
      applyMode();
    };
    bindMap();
    window.__osirisAerisAnimation = { version: VERSION, start, stop, publishFrame };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
