'use strict';

const boot = document.getElementById('boot');
const bootSequence = document.getElementById('bootSequence');
const canvas = document.getElementById('globeCanvas');
const zulu = document.getElementById('zulu');
const readout = document.getElementById('readout');
const eventTitle = document.getElementById('eventTitle');
const eventMeta = document.getElementById('eventMeta');
const locateBtn = document.getElementById('locateBtn');
const orbitBtn = document.getElementById('orbitBtn');

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

const bootMessages = [
  'INITIALIZING GLOBAL INTELLIGENCE COMMAND...',
  'SYNCING ORBITAL LATTICE...',
  'PARSING OPEN SOURCE SIGNALS...',
  'RECON LAYER ONLINE'
];

let bootStep = 0;
const bootTimer = window.setInterval(() => {
  bootStep += 1;
  if (bootSequence) bootSequence.textContent = bootMessages[Math.min(bootStep, bootMessages.length - 1)];
  if (bootStep >= bootMessages.length - 1) {
    window.clearInterval(bootTimer);
    window.setTimeout(() => boot?.classList.add('hide'), 450);
  }
}, 340);

function pad(value) {
  return String(value).padStart(2, '0');
}

function updateZulu() {
  const now = new Date();
  if (zulu) zulu.textContent = `ZULU ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}
updateZulu();
window.setInterval(updateZulu, 1000);

const palette = {
  ocean: '#283640',
  oceanDark: '#111923',
  land: '#05080a',
  landEdge: 'rgba(176, 190, 198, 0.28)',
  boundary: 'rgba(44, 139, 205, 0.42)'
};

const continents = [
  { name: 'NORTH AMERICA', polygons: [ [[-168, 72], [-150, 70], [-135, 61], [-126, 52], [-123, 42], [-116, 33], [-106, 27], [-96, 22], [-86, 24], [-80, 30], [-73, 41], [-61, 49], [-56, 57], [-72, 64], [-94, 70], [-121, 73], [-148, 73], [-168, 72]], [[-118, 32], [-106, 24], [-98, 19], [-91, 16], [-87, 19], [-90, 24], [-99, 27], [-108, 31], [-118, 32]], [[-84, 22], [-78, 24], [-75, 20], [-80, 18], [-84, 22]] ] },
  { name: 'SOUTH AMERICA', polygons: [ [[-81, 12], [-71, 10], [-61, 2], [-51, -8], [-44, -18], [-45, -30], [-55, -43], [-67, -55], [-73, -45], [-76, -28], [-81, -10], [-81, 12]] ] },
  { name: 'GREENLAND', polygons: [ [[-73, 78], [-58, 83], [-32, 78], [-23, 69], [-38, 61], [-57, 60], [-70, 68], [-73, 78]] ] },
  { name: 'EUROPE', polygons: [ [[-11, 36], [-9, 51], [2, 59], [18, 69], [37, 62], [44, 49], [33, 39], [18, 36], [4, 41], [-11, 36]] ] },
  { name: 'AFRICA', polygons: [ [[-17, 35], [6, 37], [27, 31], [42, 16], [50, 2], [43, -20], [31, -34], [14, -35], [2, -24], [-9, -2], [-17, 18], [-17, 35]] ] },
  { name: 'ASIA', polygons: [ [[35, 32], [48, 47], [70, 56], [96, 70], [128, 62], [160, 49], [151, 31], [127, 23], [105, 8], [86, 7], [69, 18], [49, 25], [35, 32]], [[76, 8], [88, 21], [104, 14], [104, 2], [93, -7], [79, 2], [76, 8]], [[109, 21], [121, 18], [126, 8], [118, 2], [108, 9], [109, 21]] ] },
  { name: 'AUSTRALIA', polygons: [ [[113, -12], [133, -10], [153, -24], [147, -39], [122, -38], [112, -28], [113, -12]] ] }
];

const boundaries = [
  [[-125, 49], [-99, 49], [-95, 45], [-83, 42], [-68, 46]],
  [[-117, 32], [-108, 31], [-100, 26], [-92, 26], [-88, 30]],
  [[-75, 8], [-67, -8], [-60, -18], [-56, -30], [-70, -45]],
  [[-10, 50], [6, 48], [21, 51], [36, 55], [49, 53]],
  [[15, 35], [31, 28], [39, 14], [35, -2], [22, -17], [18, -32]],
  [[46, 30], [61, 30], [75, 23], [88, 24], [103, 31], [121, 36], [140, 42]]
];

const hubs = [
  { lat: 39.9, lon: -75.1 }, { lat: 40.7, lon: -74.0 }, { lat: 33.7, lon: -84.3 },
  { lat: -23.5, lon: -46.6 }, { lat: 51.5, lon: -0.1 }, { lat: 48.8, lon: 2.3 },
  { lat: 50.4, lon: 30.5 }, { lat: 24.7, lon: 46.7 }, { lat: 35.6, lon: 139.6 }, { lat: -33.8, lon: 151.2 }
];

const routePairs = [[0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [1, 4], [1, 5], [1, 7], [1, 9], [2, 3], [2, 4], [2, 7], [3, 4], [3, 5], [4, 7], [5, 8], [6, 7], [7, 8]];

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const random = lcg(424242);
const clusters = [
  { lat: 40.7, lon: -74.0, spreadLat: 10, spreadLon: 18, count: 42, tone: 'green' },
  { lat: 34.0, lon: -84.0, spreadLat: 12, spreadLon: 20, count: 22, tone: 'green' },
  { lat: -23.5, lon: -46.6, spreadLat: 10, spreadLon: 16, count: 26, tone: 'green' },
  { lat: 50.4, lon: 10.0, spreadLat: 14, spreadLon: 28, count: 34, tone: 'green' },
  { lat: 24.7, lon: 46.7, spreadLat: 18, spreadLon: 32, count: 22, tone: 'green' },
  { lat: 4.0, lon: 20.0, spreadLat: 26, spreadLon: 34, count: 18, tone: 'green' }
];

const sensorNodes = [];
for (const cluster of clusters) {
  for (let i = 0; i < cluster.count; i += 1) {
    sensorNodes.push({ lat: cluster.lat + (random() - 0.5) * cluster.spreadLat, lon: cluster.lon + (random() - 0.5) * cluster.spreadLon, tone: cluster.tone, size: 3.1 + random() * 2.3 });
  }
}

sensorNodes.push(
  { lat: 61.2, lon: -149.9, tone: 'orange', size: 7, label: 'M5.1' },
  { lat: 58.3, lon: -151.8, tone: 'orange', size: 5.5, label: 'M5' },
  { lat: 15.1, lon: -92.0, tone: 'orange', size: 7, label: 'M4.5' },
  { lat: -35.6, lon: -72.1, tone: 'orange', size: 6.2, label: 'M5.1' },
  { lat: 50.45, lon: 30.52, tone: 'red', size: 4.8, label: 'EUROPE ALERT' },
  { lat: 31.7, lon: 35.2, tone: 'magenta', size: 5.8 },
  { lat: 25.2, lon: 55.3, tone: 'cyan', size: 5.2 },
  { lat: 35.7, lon: 139.7, tone: 'magenta', size: 5.2 },
  { lat: 64.2, lon: -51.7, tone: 'gold', size: 4.2 },
  { lat: -33.9, lon: 151.2, tone: 'cyan', size: 4.9 }
);

const state = { ctx: null, dpr: 1, width: 0, height: 0, cx: 0, cy: 0, radius: 0, centerLon: -62, centerLat: 22, targetLon: -62, targetLat: 22, zoom: 1, dragging: false, pointerId: null, lastX: 0, lastY: 0, showRoutes: true, lastTime: 0, activeLayer: 'recon' };

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function toneColor(tone, alpha = 1) {
  const map = { green: `rgba(0, 240, 138, ${alpha})`, orange: `rgba(213, 106, 0, ${alpha})`, red: `rgba(221, 39, 49, ${alpha})`, magenta: `rgba(232, 59, 127, ${alpha})`, cyan: `rgba(36, 220, 233, ${alpha})`, gold: `rgba(215, 183, 57, ${alpha})` };
  return map[tone] || map.green;
}

function resize() {
  if (!canvas) return;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  state.ctx = canvas.getContext('2d');
  state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  const mobile = state.width < 760;
  state.cx = mobile ? state.width * 0.48 : state.width * 0.52;
  state.cy = mobile ? state.height * 0.50 : state.height * 0.53;
  const baseRadius = mobile ? state.width * 0.72 : Math.min(state.width, state.height) * 0.44;
  state.radius = clamp(baseRadius * state.zoom, 220, Math.min(state.width, state.height) * 0.92);
}

function project(lat, lon, lift = 1) {
  const phi = lat * DEG;
  const lambda = (lon - state.centerLon) * DEG;
  const cosPhi = Math.cos(phi);
  const x = cosPhi * Math.sin(lambda);
  const y = Math.sin(phi);
  const z = cosPhi * Math.cos(lambda);
  const tilt = state.centerLat * DEG;
  const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
  return { x: state.cx + state.radius * lift * x, y: state.cy - state.radius * lift * y2, z: z2, visible: z2 > -0.04 };
}

function drawPolyline(points, stroke, width = 1, fill = null, alpha = 1) {
  const ctx = state.ctx;
  let drawing = false;
  let visible = 0;
  ctx.beginPath();
  for (const [lon, lat] of points) {
    const p = project(lat, lon);
    if (!p.visible) { drawing = false; continue; }
    visible += 1;
    if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; } else { ctx.lineTo(p.x, p.y); }
  }
  if (visible < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (fill && visible > 3) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

function drawGrid() {
  for (let lat = -60; lat <= 75; lat += 15) {
    const points = [];
    for (let lon = -180; lon <= 180; lon += 3) points.push([lon, lat]);
    drawPolyline(points, 'rgba(38, 132, 198, 0.16)', 0.8);
  }
  for (let lon = -180; lon <= 180; lon += 15) {
    const points = [];
    for (let lat = -80; lat <= 80; lat += 3) points.push([lon, lat]);
    drawPolyline(points, 'rgba(38, 132, 198, 0.14)', 0.75);
  }
}

function slerp(a, b, steps = 80) {
  const toVec = point => {
    const phi = point.lat * DEG;
    const lambda = point.lon * DEG;
    return { x: Math.cos(phi) * Math.sin(lambda), y: Math.sin(phi), z: Math.cos(phi) * Math.cos(lambda) };
  };
  const va = toVec(a);
  const vb = toVec(b);
  const dot = clamp(va.x * vb.x + va.y * vb.y + va.z * vb.z, -1, 1);
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega) || 1;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const wa = Math.sin((1 - t) * omega) / sinOmega;
    const wb = Math.sin(t * omega) / sinOmega;
    const x = wa * va.x + wb * vb.x;
    const y = wa * va.y + wb * vb.y;
    const z = wa * va.z + wb * vb.z;
    out.push({ lat: Math.asin(y) / DEG, lon: Math.atan2(x, z) / DEG, lift: 1 + Math.sin(Math.PI * t) * 0.10 });
  }
  return out;
}

function drawRoute(from, to, time, index) {
  const ctx = state.ctx;
  const route = slerp(from, to);
  let drawing = false;
  ctx.beginPath();
  for (const point of route) {
    const p = project(point.lat, point.lon, point.lift);
    if (!p.visible) { drawing = false; continue; }
    if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; } else { ctx.lineTo(p.x, p.y); }
  }
  ctx.save();
  ctx.strokeStyle = `rgba(25, 124, 210, ${0.28 + (index % 3) * 0.07})`;
  ctx.lineWidth = 0.9;
  ctx.shadowColor = 'rgba(0, 120, 255, 0.26)';
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();
  const pulseIndex = Math.floor((time * 0.018 + index * 9) % route.length);
  const pulse = project(route[pulseIndex].lat, route[pulseIndex].lon, route[pulseIndex].lift);
  if (pulse.visible) {
    ctx.save(); ctx.beginPath(); ctx.arc(pulse.x, pulse.y, 1.7, 0, TWO_PI); ctx.fillStyle = 'rgba(47, 177, 255, 0.8)'; ctx.shadowColor = 'rgba(47, 177, 255, 0.8)'; ctx.shadowBlur = 8; ctx.fill(); ctx.restore();
  }
}

function drawLabel(text, lat, lon, size = 26) {
  const p = project(lat, lon, 1.004);
  if (!p.visible) return;
  const ctx = state.ctx;
  ctx.save();
  ctx.font = `800 ${size}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(205, 215, 222, 0.62)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 10;
  const lines = text.split(' ');
  if (lines.length > 1 && text.length > 9) {
    ctx.fillText(lines[0], p.x, p.y - size * 0.5);
    ctx.fillText(lines.slice(1).join(' '), p.x, p.y + size * 0.58);
  } else {
    ctx.fillText(text, p.x, p.y);
  }
  ctx.restore();
}

function drawNode(node, time) {
  const p = project(node.lat, node.lon, 1.018);
  if (!p.visible) return;
  const ctx = state.ctx;
  const pulse = 1 + Math.sin(time * 0.004 + node.lon) * 0.18;
  const size = (node.size || 4) * pulse;
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, p.y, size + 5, 0, TWO_PI); ctx.fillStyle = toneColor(node.tone, 0.13); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TWO_PI); ctx.fillStyle = toneColor(node.tone, 0.92); ctx.shadowColor = toneColor(node.tone, 0.82); ctx.shadowBlur = 13; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, size + 2.4, 0, TWO_PI); ctx.strokeStyle = 'rgba(2, 3, 10, 0.82)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  if (node.label) {
    ctx.save(); ctx.font = '700 12px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillStyle = toneColor(node.tone, 0.95); ctx.strokeStyle = 'rgba(0,0,0,0.82)'; ctx.lineWidth = 3; ctx.strokeText(node.label, p.x + 9, p.y + 5); ctx.fillText(node.label, p.x + 9, p.y + 5); ctx.restore();
  }
}

function drawBackground(time) {
  const ctx = state.ctx;
  const gradient = ctx.createRadialGradient(state.cx, state.cy, state.radius * 0.1, state.cx, state.cy, state.radius * 1.6);
  gradient.addColorStop(0, 'rgba(34, 51, 68, 0.18)');
  gradient.addColorStop(0.55, 'rgba(4, 8, 20, 0.22)');
  gradient.addColorStop(1, 'rgba(2, 3, 10, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.save();
  ctx.globalAlpha = 0.38;
  for (let i = 0; i < 70; i += 1) {
    const x = (Math.sin(i * 72.13) * 0.5 + 0.5) * state.width;
    const y = (Math.cos(i * 39.77) * 0.5 + 0.5) * state.height;
    const twinkle = 0.35 + Math.sin(time * 0.001 + i) * 0.2;
    ctx.fillStyle = `rgba(255,255,255,${0.08 * twinkle})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function drawGlobe(time = 0) {
  if (!state.ctx) return;
  const ctx = state.ctx;
  ctx.clearRect(0, 0, state.width, state.height);
  drawBackground(time);
  const sphere = ctx.createRadialGradient(state.cx - state.radius * 0.28, state.cy - state.radius * 0.36, state.radius * 0.05, state.cx, state.cy, state.radius);
  sphere.addColorStop(0, '#465760'); sphere.addColorStop(0.34, palette.ocean); sphere.addColorStop(0.72, palette.oceanDark); sphere.addColorStop(1, '#020309');
  ctx.save();
  ctx.beginPath(); ctx.arc(state.cx, state.cy, state.radius, 0, TWO_PI); ctx.fillStyle = sphere; ctx.shadowColor = 'rgba(0, 0, 0, 0.86)'; ctx.shadowBlur = 28; ctx.fill(); ctx.clip();
  drawGrid();
  for (const boundary of boundaries) drawPolyline(boundary, palette.boundary, 0.8, null, 0.74);
  for (const continent of continents) for (const polygon of continent.polygons) drawPolyline(polygon, palette.landEdge, 1.1, palette.land, 1);
  if (state.showRoutes) routePairs.forEach(([from, to], index) => drawRoute(hubs[from], hubs[to], time, index));
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(state.cx, state.cy, state.radius, 0, TWO_PI); ctx.strokeStyle = 'rgba(21, 96, 155, 0.52)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.beginPath(); ctx.arc(state.cx, state.cy, state.radius * 1.018, 0, TWO_PI); ctx.strokeStyle = 'rgba(215, 183, 57, 0.10)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  drawLabel('NORTH AMERICA', 40, -106, state.width < 760 ? 21 : 30);
  drawLabel('SOUTH AMERICA', -22, -61, state.width < 760 ? 17 : 24);
  drawLabel('EUROPE', 50, 17, state.width < 760 ? 19 : 28);
  drawLabel('AFRICA', 1, 21, state.width < 760 ? 17 : 24);
  for (const node of sensorNodes) drawNode(node, time);
}

function animate(time) {
  if (!state.lastTime) state.lastTime = time;
  const delta = time - state.lastTime;
  state.lastTime = time;
  if (!state.dragging && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) state.targetLon += delta * 0.0018;
  state.centerLon += (state.targetLon - state.centerLon) * 0.08;
  state.centerLat += (state.targetLat - state.centerLat) * 0.08;
  drawGlobe(time);
  window.requestAnimationFrame(animate);
}

function setView(lon, lat, title = 'GLOBAL TRACKS ONLINE', meta = 'DRAG TO ORBIT · PINCH OR WHEEL TO ZOOM') {
  state.targetLon = lon;
  state.targetLat = lat;
  if (eventTitle) eventTitle.textContent = title;
  if (eventMeta) eventMeta.textContent = meta;
  if (readout) readout.textContent = `${title.replace(' ONLINE', '')} · ${state.activeLayer.toUpperCase()}`;
}

function onPointerDown(event) { state.dragging = true; state.pointerId = event.pointerId; state.lastX = event.clientX; state.lastY = event.clientY; canvas.setPointerCapture?.(event.pointerId); }
function onPointerMove(event) { if (!state.dragging || state.pointerId !== event.pointerId) return; const dx = event.clientX - state.lastX; const dy = event.clientY - state.lastY; state.lastX = event.clientX; state.lastY = event.clientY; state.targetLon -= dx * 0.20; state.targetLat = clamp(state.targetLat + dy * 0.10, -38, 58); }
function onPointerUp(event) { if (state.pointerId !== event.pointerId) return; state.dragging = false; state.pointerId = null; canvas.releasePointerCapture?.(event.pointerId); }

resize();
window.addEventListener('resize', resize);
window.requestAnimationFrame(animate);
canvas?.addEventListener('pointerdown', onPointerDown);
canvas?.addEventListener('pointermove', onPointerMove);
canvas?.addEventListener('pointerup', onPointerUp);
canvas?.addEventListener('pointercancel', onPointerUp);
canvas?.addEventListener('wheel', event => { event.preventDefault(); state.zoom = clamp(state.zoom + (event.deltaY < 0 ? 0.08 : -0.08), 0.78, 1.28); resize(); }, { passive: false });
locateBtn?.addEventListener('click', () => { state.zoom = 1; resize(); setView(-62, 22, 'NORTH AMERICA ONLINE', 'OSINT CLUSTERS · ATLANTIC ROUTES'); });
orbitBtn?.addEventListener('click', () => { state.showRoutes = !state.showRoutes; orbitBtn.classList.toggle('muted', !state.showRoutes); if (eventTitle) eventTitle.textContent = state.showRoutes ? 'ORBITAL PATHS ONLINE' : 'ORBITAL PATHS MUTED'; });

document.querySelectorAll('.bottom-nav button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.bottom-nav button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    state.activeLayer = button.dataset.layer || 'recon';
    const label = state.activeLayer.toUpperCase();
    if (readout) readout.textContent = `GLOBAL · ${label}`;
    if (eventTitle) eventTitle.textContent = `${label} LAYER ONLINE`;
  });
});

document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (key === 'r') { state.zoom = 1; resize(); setView(-62, 22, 'GLOBAL TRACKS ONLINE'); }
  if (key === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  if (key === 's') { if (navigator.share) navigator.share({ title: 'OSIRIS', url: window.location.href }).catch(() => {}); else navigator.clipboard?.writeText(window.location.href); }
});
