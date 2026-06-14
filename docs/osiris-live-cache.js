'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('globeCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const readout = $('readout');
const eventTitle = $('eventTitle');
const eventMeta = $('eventMeta');
const feedCount = $('feedCount');
const systemState = $('systemState');
const locateBtn = $('locateBtn');
const orbitBtn = $('orbitBtn');
const zulu = $('zulu');
const boot = $('boot');
const bootSequence = $('bootSequence');

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const VERSION = '20260613-pages-layer-controls';
const scriptBase = new URL('.', document.currentScript?.src || location.href);
const dataBase = new URL('data/', scriptBase);
const dataUrl = (name) => new URL(name, dataBase).href;
const urls = {
  world: dataUrl('countries-110m.json'),
  states: dataUrl('states-10m.json'),
  liveLite: dataUrl('live-globe-lite.json'),
  liveFull: dataUrl('live-globe.json'),
  worldCdn: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  statesCdn: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'
};

const palette = {
  ocean0: '#3b4d57', ocean1: '#283640', ocean2: '#111923', land: '#05080a',
  coast: 'rgba(176,190,198,.36)', country: 'rgba(73,159,219,.58)', state: 'rgba(218,184,55,.72)', route: 'rgba(25,128,205,.34)'
};

const layerDefs = [
  { key: 'cables', label: 'Cable mesh', tone: 'blue' },
  { key: 'cctv', label: 'CCTV feeds', tone: 'green' },
  { key: 'live_news', label: 'Live news', tone: 'green' },
  { key: 'maritime', label: 'Maritime', tone: 'cyan' },
  { key: 'earthquakes', label: 'Earthquakes', tone: 'orange' },
  { key: 'news_intel', label: 'News intel', tone: 'magenta' },
  { key: 'global_incidents', label: 'Global incidents', tone: 'magenta' }
];
const layerKeys = layerDefs.map((l) => l.key);
const layerLabels = Object.fromEntries(layerDefs.map((l) => [l.key, l.label]));
const presets = {
  layers: layerKeys,
  markets: ['maritime', 'cables'],
  intel: ['live_news', 'news_intel', 'global_incidents', 'earthquakes'],
  recon: ['cctv', 'maritime', 'earthquakes', 'cables'],
  search: ['cctv', 'live_news', 'news_intel', 'global_incidents', 'maritime', 'earthquakes']
};
const presetTitles = {
  layers: 'MANUAL LAYERS',
  markets: 'MARKETS / MARITIME VIEW',
  intel: 'INTEL FEED VIEW',
  recon: 'RECON SENSOR VIEW',
  search: 'SEARCH FOCUS VIEW',
  custom: 'CUSTOM LAYER VIEW'
};

const model = {
  world: [], states: [], nodes: [], routes: [], liveAt: null,
  fullLiveRequested: false, statesRequested: false, renderEveryMs: innerWidth < 760 ? 42 : 33, lastFrame: 0,
  ready: { world: false, states: false, live: false, fullLive: false }, showRoutes: true,
  activePreset: 'recon', drawerOpen: false,
  activeLayers: Object.fromEntries(layerKeys.map((k) => [k, presets.recon.includes(k)])),
  view: { lon: -62, lat: 22, targetLon: -62, targetLat: 22, zoom: 1 },
  pointer: { dragging: false, id: null, x: 0, y: 0, map: new Map(), pinchDistance: 1, pinchZoom: 1 },
  size: { w: 0, h: 0, dpr: 1, cx: 0, cy: 0, r: 0 }
};

const fallbackWorld = [
  { rings: [[[-168,72],[-135,61],[-123,42],[-106,27],[-86,24],[-73,41],[-56,57],[-94,70],[-148,73],[-168,72]]] },
  { rings: [[[-81,12],[-61,2],[-44,-18],[-55,-43],[-67,-55],[-76,-28],[-81,12]]] },
  { rings: [[[-17,35],[27,31],[50,2],[31,-34],[2,-24],[-17,18],[-17,35]]] },
  { rings: [[[-11,36],[2,59],[37,62],[44,49],[33,39],[18,36],[4,41],[-11,36]]] },
  { rings: [[[35,32],[70,56],[128,62],[160,49],[151,31],[105,8],[69,18],[35,32]]] },
  { rings: [[[113,-12],[133,-10],[153,-24],[147,-39],[122,-38],[112,-28],[113,-12]]] }
];
const fallbackNodes = [
  { lat: 39.9, lon: -75.1, tone: 'green', size: 4.2, label: 'CACHE PENDING', priority: true, layer: 'cctv' },
  { lat: 40.7, lon: -74.0, tone: 'green', size: 3.8, layer: 'cctv' },
  { lat: 51.5, lon: -0.1, tone: 'green', size: 3.8, layer: 'live_news' },
  { lat: -23.5, lon: -46.6, tone: 'magenta', size: 3.8, layer: 'news_intel' }
];
model.world = fallbackWorld;
model.nodes = fallbackNodes;

function pad(v) { return String(v).padStart(2, '0'); }
function tickZulu() { const now = new Date(); if (zulu) zulu.textContent = `ZULU ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`; }
tickZulu();
setInterval(tickZulu, 1000);

let bootStep = 0;
const bootLines = ['LOADING LOCAL CACHE...', 'FETCHING REPO DATA...', 'STAGING LAYER CONTROLS...', 'RECON ONLINE'];
const bootTimer = setInterval(() => {
  bootStep += 1;
  if (bootSequence) bootSequence.textContent = bootLines[Math.min(bootStep, bootLines.length - 1)];
  if (bootStep >= bootLines.length - 1) { clearInterval(bootTimer); setTimeout(() => boot?.classList.add('hide'), 250); }
}, 220);

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function normLon(lon) { return ((lon + 540) % 360) - 180; }
function tone(t, a = 1) {
  return ({ green: `rgba(0,240,138,${a})`, orange: `rgba(213,106,0,${a})`, red: `rgba(221,39,49,${a})`, magenta: `rgba(232,59,127,${a})`, cyan: `rgba(36,220,233,${a})`, gold: `rgba(215,183,57,${a})`, blue: `rgba(25,128,205,${a})` })[t] || `rgba(0,240,138,${a})`;
}
function inferLayer(item) {
  const s = String(item?.source || item?.label || '').toLowerCase();
  if (item?.layer) return item.layer;
  if (s.includes('submarine') || s.includes('cable')) return 'cables';
  if (s.includes('cctv') || s.includes('cam')) return 'cctv';
  if (s.includes('live news')) return 'live_news';
  if (s.includes('maritime') || s.includes('ais') || s.includes('ship') || s.includes('port') || s.includes('chokepoint')) return 'maritime';
  if (s.includes('earthquake') || /^m\d/.test(String(item?.label || '').toLowerCase())) return 'earthquakes';
  if (s.includes('gdelt') || s.includes('incident')) return 'global_incidents';
  if (s.includes('news')) return 'news_intel';
  if (item?.tone === 'orange') return 'earthquakes';
  if (item?.tone === 'cyan' || item?.tone === 'gold') return 'maritime';
  if (item?.tone === 'magenta') return 'news_intel';
  return 'cctv';
}
function isLayerOn(key) { return model.activeLayers[key] !== false; }
function nodeVisible(n) { return isLayerOn(inferLayer(n)); }
function routeVisible(r) { return model.showRoutes && isLayerOn(inferLayer(r) || 'cables'); }
function layerSummary() {
  const active = layerKeys.filter((k) => model.activeLayers[k]);
  if (active.length === layerKeys.length) return 'ALL LAYERS';
  if (!active.length) return 'NO DATA LAYERS';
  if (active.length <= 2) return active.map((k) => layerLabels[k].toUpperCase()).join(' + ');
  return `${active.length} LAYERS ACTIVE`;
}
function countVisible() {
  let nodes = 0, routes = 0;
  for (const n of model.nodes) if (nodeVisible(n)) nodes += 1;
  for (const r of model.routes) if (routeVisible(r)) routes += 1;
  return { nodes, routes };
}

async function loadJson(primary, fallback) {
  for (const candidate of [primary, fallback].filter(Boolean)) {
    try {
      const res = await fetch(candidate, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`${res.status} ${candidate}`);
      return await res.json();
    } catch {}
  }
  throw new Error(`Failed to load ${primary}`);
}
function idle(fn, timeout = 1800) { if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout }); else setTimeout(fn, 400); }

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.5 : 2);
  model.size.w = innerWidth; model.size.h = innerHeight; model.size.dpr = dpr;
  canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mobile = innerWidth < 760;
  model.size.cx = mobile ? innerWidth * .48 : innerWidth * .52;
  model.size.cy = mobile ? innerHeight * .50 : innerHeight * .53;
  const base = mobile ? innerWidth * .72 : Math.min(innerWidth, innerHeight) * .44;
  const max = Math.max(innerWidth, innerHeight) * (mobile ? 1.62 : 1.34);
  model.size.r = clamp(base * model.view.zoom, 220, max);
  model.renderEveryMs = mobile ? 42 : 33;
}
function project(lat, lon, lift = 1) {
  const phi = lat * DEG;
  const lam = normLon(lon - model.view.lon) * DEG;
  const c = Math.cos(phi);
  const x = c * Math.sin(lam), y = Math.sin(phi), z = c * Math.cos(lam);
  const tilt = model.view.lat * DEG;
  const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
  return { x: model.size.cx + model.size.r * lift * x, y: model.size.cy - model.size.r * lift * y2, z: z2, visible: z2 > -.04 };
}
function pathRing(ring) {
  let drawing = false, visible = 0;
  const skip = model.view.zoom > 2.2 ? 1 : 2;
  for (let i = 0; i < ring.length; i += skip) {
    const [lon, lat] = ring[i];
    const p = project(lat, lon);
    if (!p.visible) { drawing = false; continue; }
    visible += 1;
    if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; } else ctx.lineTo(p.x, p.y);
  }
  return visible;
}
function drawRings(features, stroke, width, fill, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.strokeStyle = stroke;
  for (const f of features) {
    ctx.beginPath();
    let visible = 0;
    for (const ring of f.rings) visible += pathRing(ring);
    if (visible > 2) { if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); } ctx.stroke(); }
  }
  ctx.restore();
}
function lod() {
  const z = model.view.zoom;
  return { country: clamp((z - 1.04) / .48, 0, .72), state: model.ready.states ? clamp((z - 1.68) / .72, 0, .82) : 0, route: clamp(1.12 - (z - 1) * .22, .16, 1), node: clamp(1.16 - (z - 1) * .12, .72, 1.14), grid: clamp((z - 1.55) / .62, 0, .28) };
}
function drawGrid() {
  for (let lat = -60; lat <= 75; lat += 30) { const pts = []; for (let lon = -180; lon <= 180; lon += 6) pts.push([lon, lat]); drawLine(pts, 'rgba(38,132,198,.12)', .65); }
  for (let lon = -180; lon <= 180; lon += 30) { const pts = []; for (let lat = -80; lat <= 80; lat += 6) pts.push([lon, lat]); drawLine(pts, 'rgba(38,132,198,.12)', .65); }
  const d = lod();
  if (d.grid > 0) for (let lon = -180; lon <= 180; lon += 10) { const pts = []; for (let lat = -80; lat <= 80; lat += 4) pts.push([lon, lat]); drawLine(pts, `rgba(38,132,198,${d.grid})`, .34); }
}
function drawLine(coords, color, width = 1, alpha = 1, lift = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  let drawing = false, visible = 0;
  for (const [lon, lat] of coords) {
    const p = project(lat, lon, lift);
    if (!p.visible) { drawing = false; continue; }
    visible += 1;
    if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; } else ctx.lineTo(p.x, p.y);
  }
  if (visible > 1) ctx.stroke();
  ctx.restore();
}
function drawRoutes() {
  const d = lod();
  const max = model.ready.fullLive ? (model.view.zoom > 2.4 ? 1000 : model.view.zoom > 1.5 ? 760 : 520) : model.routes.length;
  let drawn = 0;
  for (let i = 0; i < model.routes.length && drawn < max; i += 1) {
    const r = model.routes[i];
    if (!routeVisible(r)) continue;
    drawLine(r.coordinates, r.color || palette.route, r.width || .65, (r.alpha ?? .32) * d.route, 1.006);
    drawn += 1;
  }
}
function drawNodes() {
  const d = lod();
  const max = model.view.zoom > 2.2 ? 1200 : model.view.zoom > 1.4 ? 720 : 420;
  let drawn = 0;
  for (let i = 0; i < model.nodes.length && drawn < max; i += 1) {
    const n = model.nodes[i];
    if (!nodeVisible(n)) continue;
    const p = project(n.lat, n.lon, 1.015);
    if (!p.visible) continue;
    const c = tone(n.tone, 1); const s = (n.size || 3.6) * d.node;
    ctx.save(); ctx.fillStyle = c; ctx.strokeStyle = 'rgba(4,7,10,.88)'; ctx.lineWidth = 2; ctx.shadowColor = c; ctx.shadowBlur = s > 5 ? 16 : 7;
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TWO_PI); ctx.fill(); ctx.stroke();
    if (n.label && (model.view.zoom < 2.55 || n.priority)) {
      ctx.shadowBlur = 6; ctx.font = '600 13px ui-monospace,SFMono-Regular,Menlo,monospace'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(n.label, p.x + 8, p.y + 13); ctx.fillStyle = c; ctx.fillText(n.label, p.x + 8, p.y + 13);
    }
    ctx.restore();
    drawn += 1;
  }
}
function drawLabels() {
  if (model.view.zoom < .92) return;
  const alpha = clamp((model.view.zoom - .92) / .36, 0, .68);
  const labels = [['NORTH\nAMERICA', 38, -103, 28], ['EUROPE', 50, 14, 24], ['SOUTH\nAMERICA', -18, -58, 20], ['AFRICA', 5, 20, 22], ['ASIA', 43, 88, 24]];
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = 'rgba(221,232,239,.68)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 8;
  for (const [text, lat, lon, size0] of labels) {
    const p = project(lat, lon, 1.018); if (!p.visible) continue;
    const size = size0 * clamp(1.14 - (model.view.zoom - 1) * .16, .72, 1.12);
    ctx.font = `800 ${size}px ui-monospace,SFMono-Regular,Menlo,monospace`;
    text.split('\n').forEach((line, i, arr) => ctx.fillText(line, p.x, p.y + (i - (arr.length - 1) / 2) * (size + 2)));
  }
  ctx.restore();
}
function drawGlobe(time) {
  const g = ctx.createRadialGradient(model.size.cx - model.size.r * .35, model.size.cy - model.size.r * .55, model.size.r * .15, model.size.cx, model.size.cy, model.size.r);
  g.addColorStop(0, palette.ocean0); g.addColorStop(.54, palette.ocean1); g.addColorStop(1, palette.ocean2);
  ctx.save(); ctx.beginPath(); ctx.arc(model.size.cx, model.size.cy, model.size.r, 0, TWO_PI); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(42,117,168,.42)'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.clip(); drawGrid(); drawRings(model.world, palette.coast, .82, palette.land);
  const d = lod();
  if (d.country) drawRings(model.world, palette.country, .35 + model.view.zoom * .1, null, d.country);
  if (d.state) drawRings(model.states, palette.state, .42 + model.view.zoom * .12, null, d.state);
  drawRoutes(); drawNodes(); drawLabels();
  const shade = ctx.createRadialGradient(model.size.cx + model.size.r * .35, model.size.cy + model.size.r * .05, model.size.r * .15, model.size.cx + model.size.r * .45, model.size.cy + model.size.r * .08, model.size.r * 1.1);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(.52, 'rgba(0,0,0,.1)'); shade.addColorStop(1, 'rgba(0,0,0,.64)');
  ctx.fillStyle = shade; ctx.fillRect(model.size.cx - model.size.r, model.size.cy - model.size.r, model.size.r * 2, model.size.r * 2); ctx.restore();
  ctx.save(); ctx.translate(model.size.cx, model.size.cy); ctx.rotate(time * .00008);
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(0, 0, model.size.r * (1.05 + i * .028), model.size.r * (.78 + i * .016), i * .18, 0, TWO_PI); ctx.strokeStyle = `rgba(21,124,203,${.14 - i * .014})`; ctx.lineWidth = .8; ctx.stroke(); }
  ctx.restore();
}
function frame(time = 0) {
  requestAnimationFrame(frame);
  if (time - model.lastFrame < model.renderEveryMs) return;
  model.lastFrame = time;
  model.view.lon += (model.view.targetLon - model.view.lon) * .08;
  model.view.lat += (model.view.targetLat - model.view.lat) * .08;
  if (!model.pointer.dragging && model.pointer.map.size === 0 && model.view.zoom < 1.45) model.view.targetLon = normLon(model.view.targetLon + .012);
  if (model.view.zoom > 1.48) ensureStates();
  if (model.view.zoom > 1.8) ensureFullLive();
  ctx.clearRect(0, 0, model.size.w, model.size.h); drawGlobe(time);
  if (readout) {
    const detail = model.view.zoom >= 1.68 && model.ready.states ? 'STATE OUTLINES' : model.view.zoom >= 1.04 && model.ready.world ? 'COUNTRY OUTLINES' : 'CONTINENT COASTLINES';
    const cache = model.ready.fullLive ? 'FULL CACHE' : model.ready.live ? 'FAST CABLE MESH' : 'CACHE MISS';
    readout.textContent = `${detail} · ${cache} · ${layerSummary()} · Z ${model.view.zoom.toFixed(2)}`;
  }
}

function decodeTopo(topology) {
  const scale = topology.transform?.scale || [1, 1], translate = topology.transform?.translate || [0, 0], cache = new Map();
  function arc(raw) {
    const id = raw < 0 ? ~raw : raw, key = `${id}:${raw < 0 ? 'r' : 'f'}`;
    if (cache.has(key)) return cache.get(key);
    let x = 0, y = 0;
    let pts = topology.arcs[id].map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
    if (raw < 0) pts = pts.reverse(); cache.set(key, pts); return pts;
  }
  function ring(indexes) { const out = []; for (const raw of indexes) for (const [i, p] of arc(raw).entries()) if (!out.length || i) out.push(p); return out; }
  function geom(g) { if (!g) return []; if (g.type === 'Polygon') return g.arcs.map(ring); if (g.type === 'MultiPolygon') return g.arcs.flatMap((poly) => poly.map(ring)); return []; }
  return { geom };
}
function topoFeatures(topology, objectName) {
  const object = topology.objects?.[objectName] || Object.values(topology.objects || {})[0];
  if (!object?.geometries) return [];
  const decoder = decodeTopo(topology);
  return object.geometries.map((g, i) => ({ id: g.id || i, rings: decoder.geom(g) })).filter((f) => f.rings.length);
}
function goodNode(n) {
  const lat = Number(n.lat ?? n.latitude), lon = Number(n.lon ?? n.lng ?? n.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const node = { lat, lon, tone: n.tone || 'green', size: clamp(Number(n.size) || 3.6, 2.4, 9), label: n.label || n.name || '', source: n.source || '', layer: n.layer || '', priority: !!n.priority };
  node.layer = inferLayer(node);
  return node;
}
function goodRoute(r) {
  const coords = r.coordinates || r.path || [];
  const out = coords.map((p) => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.lon ?? p.lng), Number(p.lat)]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (out.length <= 1) return null;
  const route = { coordinates: out, color: r.color || palette.route, width: Number(r.width) || .65, alpha: Number(r.alpha) || .32, source: r.source || 'OSIRIS submarine cable data', layer: r.layer || 'cables' };
  route.layer = inferLayer(route);
  return route;
}
function updateLayerStatus() {
  const counts = countVisible();
  if (feedCount) feedCount.textContent = String(counts.nodes);
  if (eventTitle) eventTitle.textContent = presetTitles[model.activePreset] || presetTitles.custom;
  if (eventMeta) eventMeta.textContent = `${counts.nodes.toLocaleString()} visible nodes · ${counts.routes.toLocaleString()} visible routes · ${layerSummary()}`;
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.layer === model.activePreset));
  document.querySelectorAll('[data-toggle-layer]').forEach((b) => {
    const key = b.getAttribute('data-toggle-layer');
    b.classList.toggle('active', !!model.activeLayers[key]);
    b.setAttribute('aria-pressed', String(!!model.activeLayers[key]));
  });
}
function applyLayerSet(keys, preset = 'custom') {
  const wanted = new Set(keys);
  for (const key of layerKeys) model.activeLayers[key] = wanted.has(key);
  model.activePreset = preset;
  model.showRoutes = model.activeLayers.cables;
  orbitBtn?.classList.toggle('disabled', !model.showRoutes);
  updateLayerStatus();
}
function toggleLayer(key) {
  model.activeLayers[key] = !model.activeLayers[key];
  model.activePreset = 'custom';
  model.showRoutes = model.activeLayers.cables;
  orbitBtn?.classList.toggle('disabled', !model.showRoutes);
  updateLayerStatus();
}
function applyLive(live, full = false) {
  const nodes = Array.isArray(live.nodes) ? live.nodes.map(goodNode).filter(Boolean) : [];
  const routes = Array.isArray(live.routes) ? live.routes.map(goodRoute).filter(Boolean) : [];
  if (!nodes.length && !routes.length) return false;
  model.nodes = nodes; model.routes = routes; model.liveAt = live.generatedAt; model.ready.live = true; model.ready.fullLive = full;
  if (systemState) systemState.textContent = full ? 'FULL CACHE' : 'CABLE MESH';
  updateLayerStatus();
  return true;
}
async function ensureFullLive() { if (model.fullLiveRequested || model.ready.fullLive) return; model.fullLiveRequested = true; try { applyLive(await loadJson(urls.liveFull), true); } catch {} }
async function ensureStates() { if (model.statesRequested || model.ready.states) return; model.statesRequested = true; try { model.states = topoFeatures(await loadJson(urls.states, urls.statesCdn), 'states'); model.ready.states = true; } catch {} }
async function hydrate() {
  try { model.world = topoFeatures(await loadJson(urls.world, urls.worldCdn), 'countries'); model.ready.world = true; } catch { model.world = fallbackWorld; }
  try { applyLive(await loadJson(urls.liveLite, urls.liveFull), false); }
  catch {
    if (feedCount) feedCount.textContent = String(model.nodes.length);
    if (systemState) systemState.textContent = 'CACHE MISS';
    if (eventTitle) eventTitle.textContent = 'WAITING FOR REPO DATA CACHE';
    if (eventMeta) eventMeta.textContent = 'Run the Pages data cache workflow to populate live nodes and cable routes.';
  }
  idle(ensureFullLive, 2600);
}
function setZoom(z) { model.view.zoom = clamp(z, .74, 4.2); resize(); if (model.view.zoom > 1.48) ensureStates(); if (model.view.zoom > 1.8) ensureFullLive(); }
function resetView() { model.view.targetLon = -62; model.view.targetLat = 22; setZoom(1); }
function installLayerDrawer() {
  const style = document.createElement('style');
  style.textContent = `.layer-drawer{position:fixed;left:10px;right:10px;bottom:72px;z-index:420;background:rgba(3,6,10,.88);border:1px solid rgba(212,175,55,.28);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 30px rgba(23,126,203,.16);backdrop-filter:blur(16px);border-radius:18px;padding:12px;transform:translateY(18px);opacity:0;pointer-events:none;transition:.18s ease;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.layer-drawer.open{transform:translateY(0);opacity:1;pointer-events:auto}.layer-drawer__head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#d4af37;font-size:10px;letter-spacing:.18em}.layer-drawer__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.layer-chip{display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:9px 10px;background:rgba(255,255,255,.04);color:rgba(230,238,242,.56);font-size:10px;text-align:left}.layer-chip.active{border-color:rgba(212,175,55,.55);background:rgba(212,175,55,.12);color:#f5d96b}.layer-dot{width:7px;height:7px;border-radius:999px;box-shadow:0 0 12px currentColor}.layer-actions{display:flex;gap:8px;margin-top:10px}.layer-actions button{flex:1;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px;color:rgba(230,238,242,.7);font-size:9px;letter-spacing:.12em;background:rgba(255,255,255,.04)}@media(min-width:760px){.layer-drawer{left:auto;right:86px;bottom:96px;width:340px}}`;
  document.head.appendChild(style);
  const drawer = document.createElement('section');
  drawer.className = 'layer-drawer';
  drawer.id = 'layerDrawer';
  drawer.innerHTML = `<div class="layer-drawer__head"><span>LIVE MAP LAYERS</span><button type="button" data-close-layers aria-label="Close layers">×</button></div><div class="layer-drawer__grid">${layerDefs.map((l) => `<button type="button" class="layer-chip" data-toggle-layer="${l.key}" aria-pressed="false"><span class="layer-dot" style="color:${tone(l.tone, 1)};background:currentColor"></span><span>${l.label}</span></button>`).join('')}</div><div class="layer-actions"><button type="button" data-layer-all>ALL ON</button><button type="button" data-layer-clear>ALL OFF</button></div>`;
  document.body.appendChild(drawer);
  drawer.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-layer]');
    if (toggle) { toggleLayer(toggle.getAttribute('data-toggle-layer')); return; }
    if (e.target.closest('[data-close-layers]')) { model.drawerOpen = false; drawer.classList.remove('open'); return; }
    if (e.target.closest('[data-layer-all]')) applyLayerSet(layerKeys, 'layers');
    if (e.target.closest('[data-layer-clear]')) applyLayerSet([], 'custom');
  });
  return drawer;
}
function bind() {
  const drawer = installLayerDrawer();
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); model.pointer.map.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); if (model.pointer.map.size > 1) { const [a,b] = [...model.pointer.map.values()]; model.pointer.pinchDistance = Math.hypot(a.x-b.x,a.y-b.y) || 1; model.pointer.pinchZoom = model.view.zoom; model.pointer.dragging = false; } else { model.pointer.dragging = true; model.pointer.id = e.pointerId; model.pointer.x = e.clientX; model.pointer.y = e.clientY; } });
  canvas.addEventListener('pointermove', (e) => { if (!model.pointer.map.has(e.pointerId)) return; e.preventDefault(); model.pointer.map.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (model.pointer.map.size > 1) { const [a,b] = [...model.pointer.map.values()]; setZoom(model.pointer.pinchZoom * ((Math.hypot(a.x-b.x,a.y-b.y) || 1) / model.pointer.pinchDistance)); return; } if (!model.pointer.dragging || model.pointer.id !== e.pointerId) return; const dx = e.clientX - model.pointer.x, dy = e.clientY - model.pointer.y, dragScale = clamp(.24 / Math.sqrt(model.view.zoom), .08, .24); model.view.targetLon = normLon(model.view.targetLon - dx * dragScale); model.view.targetLat = clamp(model.view.targetLat + dy * dragScale * .82, -72, 78); model.pointer.x = e.clientX; model.pointer.y = e.clientY; });
  const end = (e) => { model.pointer.map.delete(e.pointerId); model.pointer.dragging = false; model.pointer.id = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(model.view.zoom + (e.deltaY > 0 ? -.12 : .12) * Math.max(1, model.view.zoom * .62)); }, { passive: false });
  locateBtn?.addEventListener('click', resetView);
  orbitBtn?.addEventListener('click', () => { model.activeLayers.cables = !model.activeLayers.cables; model.showRoutes = model.activeLayers.cables; orbitBtn.classList.toggle('disabled', !model.showRoutes); model.activePreset = 'custom'; updateLayerStatus(); });
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.addEventListener('click', () => {
    const layer = b.dataset.layer || 'recon';
    if (layer === 'layers') {
      model.drawerOpen = !model.drawerOpen;
      drawer.classList.toggle('open', model.drawerOpen);
      model.activePreset = 'layers';
      updateLayerStatus();
      return;
    }
    model.drawerOpen = false;
    drawer.classList.remove('open');
    applyLayerSet(presets[layer] || presets.recon, layer);
  }));
  addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') resetView(); if (e.key.toLowerCase() === 'o') orbitBtn?.click(); if (e.key === '+' || e.key === '=') setZoom(model.view.zoom + .18); if (e.key === '-' || e.key === '_') setZoom(model.view.zoom - .18); });
  addEventListener('resize', resize);
  updateLayerStatus();
}

resize(); bind(); hydrate(); requestAnimationFrame(frame);
