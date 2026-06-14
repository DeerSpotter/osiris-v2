import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'docs', 'data');
const layersDir = path.join(dataDir, 'layers');
const OSIRIS = 'https://osirisai.live';
const UA = 'osiris-v2-pages-video-cache/1.0 (+https://github.com/DeerSpotter/osiris-v2)';

async function fetchJson(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } catch (error) {
    console.warn(`[video-cache] ${error.message}`);
    return {};
  }
}

function pickArray(value, keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coordsOf(item) {
  const lat = num(item.lat ?? item.latitude ?? item.location?.lat ?? item.coords?.[0]);
  const lon = num(item.lon ?? item.lng ?? item.longitude ?? item.location?.lon ?? item.location?.lng ?? item.coords?.[1]);
  return lat === null || lon === null ? null : { lat, lon };
}

function firstUrl(item) {
  return String(
    item.embedUrl || item.embed_url || item.embed || item.streamUrl || item.stream_url ||
    item.videoUrl || item.video_url || item.watchUrl || item.watch_url || item.youtubeUrl ||
    item.youtube_url || item.url || item.link || item.href || ''
  ).trim();
}

function firstText(item, keys) {
  for (const key of keys) if (item?.[key]) return String(item[key]);
  return '';
}

function normalizeItem(item, layer) {
  const coords = coordsOf(item);
  const url = firstUrl(item);
  if (!coords || !url) return null;
  return {
    lat: coords.lat,
    lon: coords.lon,
    label: firstText(item, ['label', 'name', 'title', 'camera', 'city']) || '',
    source: layer === 'cctv' ? 'OSIRIS CCTV' : 'OSIRIS live news',
    url,
    embedAllowed: item.embed_allowed ?? item.embedAllowed ?? true
  };
}

function distance(a, b) {
  return Math.hypot(Number(a.lat) - Number(b.lat), Number(a.lon) - Number(b.lon));
}

function enrichNodes(nodes, refs) {
  let updated = 0;
  for (const node of nodes || []) {
    let best = null;
    let bestDist = 0.05;
    for (const ref of refs) {
      const d = distance(node, ref);
      if (d < bestDist) {
        best = ref;
        bestDist = d;
      }
    }
    if (!best) continue;
    if (!node.label && best.label) node.label = best.label;
    node.url = best.url;
    node.embedAllowed = best.embedAllowed;
    updated += 1;
  }
  return updated;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await writeFile(file, JSON.stringify(value));
}

const cctvRefs = pickArray(await fetchJson(`${OSIRIS}/api/cctv?region=all&v=2`), ['cameras', 'feeds'])
  .map((item) => normalizeItem(item, 'cctv'))
  .filter(Boolean);
const liveRefs = pickArray(await fetchJson(`${OSIRIS}/api/live-news`), ['feeds', 'items'])
  .map((item) => normalizeItem(item, 'live_news'))
  .filter(Boolean);

const layerSpecs = [
  { key: 'cctv', refs: cctvRefs },
  { key: 'live_news', refs: liveRefs }
];

for (const { key, refs } of layerSpecs) {
  const file = path.join(layersDir, `${key}.json`);
  const layer = await readJson(file, null);
  if (!layer) continue;
  const updated = enrichNodes(layer.nodes, refs);
  await writeJson(file, layer);
  console.log(`[video-cache] ${key}: enriched ${updated} nodes`);
}

for (const fileName of ['live-globe.json', 'live-globe-lite.json']) {
  const file = path.join(dataDir, fileName);
  const payload = await readJson(file, null);
  if (!payload?.nodes) continue;
  const c = enrichNodes(payload.nodes.filter((n) => n.layer === 'cctv' || String(n.source || '').toLowerCase().includes('cctv')), cctvRefs);
  const l = enrichNodes(payload.nodes.filter((n) => n.layer === 'live_news' || String(n.source || '').toLowerCase().includes('live news')), liveRefs);
  await writeJson(file, payload);
  console.log(`[video-cache] ${fileName}: enriched ${c + l} video nodes`);
}
