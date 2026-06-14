import { NextRequest, NextResponse } from 'next/server';

/**
 * OSIRIS — Flight Data API
 *
 * Two modes:
 * 1. /api/flights
 *    Returns OSIRIS classified aircraft groups for the dashboard.
 * 2. /api/flights?path=/point/{lat}/{lon}/{radiusNm}&provider=airplanes|adsb
 *    Aeris/readsb-compatible proxy mode. This keeps the uploaded Aeris module usable
 *    without CORS problems and without rewriting its client contract.
 */

type FlightProvider = 'airplanes' | 'adsb';

type RegionPoint = {
  id: string;
  lat: number;
  lon: number;
  dist: number;
};

type RawAircraft = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  t?: string;
  r?: string;
  squawk?: string;
  nac_p?: number;
  dbFlags?: number;
  seen_pos?: number;
};

type ClassifiedFlight = {
  callsign: string;
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  speed_knots: number | null;
  model: string;
  icao24: string;
  registration: string;
  squawk: string;
  airline_code: string;
  aircraft_category: 'heli' | 'plane';
  category: 'commercial' | 'private' | 'jet' | 'military';
  grounded: boolean;
  nac_p?: number;
  type: 'flight';
};

const PROVIDERS: Record<FlightProvider, { label: string; baseUrl: string }> = {
  airplanes: { label: 'Airplanes.live', baseUrl: 'https://api.airplanes.live/v2' },
  adsb: { label: 'adsb.lol', baseUrl: 'https://api.adsb.lol/v2' },
};

const PROVIDER_ORDER: FlightProvider[] = ['airplanes', 'adsb'];
const MAX_RADIUS_NM = 250;
const FETCH_TIMEOUT_MS = 9000;
const CACHE_TTL = 45000;
const MAX_POSITION_AGE_S = 90;

/**
 * Regional defaults are deliberately 250 NM or smaller. The previous endpoint used
 * 2000+ NM requests, which readsb providers reject or answer inconsistently.
 */
const DEFAULT_POINTS: RegionPoint[] = [
  // Current OSIRIS default view / US east coast coverage
  { id: 'us-northeast', lat: 40.3, lon: -75.0, dist: 250 },
  { id: 'us-southeast', lat: 33.65, lon: -84.42, dist: 250 },
  { id: 'us-midwest', lat: 41.88, lon: -87.63, dist: 250 },
  { id: 'us-texas', lat: 32.78, lon: -97.04, dist: 250 },
  { id: 'us-west', lat: 34.05, lon: -118.25, dist: 250 },
  { id: 'us-pacific-nw', lat: 47.61, lon: -122.33, dist: 250 },

  // High traffic global hubs so the globe is not empty outside CONUS
  { id: 'europe-west', lat: 51.47, lon: -0.45, dist: 250 },
  { id: 'europe-central', lat: 50.04, lon: 8.57, dist: 250 },
  { id: 'middle-east', lat: 25.25, lon: 55.36, dist: 250 },
  { id: 'india', lat: 28.56, lon: 77.10, dist: 250 },
  { id: 'east-asia', lat: 35.55, lon: 139.78, dist: 250 },
  { id: 'australia-east', lat: -33.94, lon: 151.18, dist: 250 },
];

const HELI_TYPES = new Set([
  'R22','R44','R66','B06','B06T','B204','B205','B206','B212','B222','B230',
  'B407','B412','B427','B429','B430','B505','B525',
  'AS32','AS35','AS50','AS55','AS65',
  'EC20','EC25','EC30','EC35','EC45','EC55','EC75',
  'H125','H130','H135','H145','H155','H160','H175','H215','H225',
  'S55','S58','S61','S64','S70','S76','S92',
  'A109','A119','A139','A169','A189','AW09',
  'MD52','MD60','MDHI','MD90','NOTR',
  'B47G','HUEY','GAMA','CABR','EXE',
]);

const PRIVATE_JET_TYPES = new Set([
  'G150','G200','G280','GLEX','G500','G550','G600','G650','G700',
  'GLF2','GLF3','GLF4','GLF5','GLF6','GL5T','GL7T','GV','GIV',
  'CL30','CL35','CL60','BD70','BD10',
  'C25A','C25B','C25C','C500','C510','C525','C550','C560','C56X','C680','C700','C750',
  'E35L','E50P','E55P','E545','E550',
  'FA50','FA7X','FA8X','F900','F2TH',
  'LJ35','LJ40','LJ45','LJ60','LJ70','LJ75',
  'PC12','PC24','TBM7','TBM8','TBM9',
  'PRM1','SF50','EA50','VLJ',
]);

const AIRLINER_TYPES = new Set([
  'A319','A320','A321','A332','A333','A339','A343','A359','A388',
  'B737','B738','B739','B38M','B39M','B752','B753','B763','B764','B772','B77L','B77W','B788','B789','B78X',
  'E170','E175','E190','E195','CRJ7','CRJ9','AT43','AT72','DH8D',
]);

const MILITARY_INDICATORS = new Set([
  'C17','C5M','C130','C30J','KC10','KC46','KC35','E3CF','E3TF','E8A',
  'B1B','B2','B52','F16','F15','F18','F22','F35','A10','F117',
  'RC135','E6B','P8A','P3','MQ9','RQ4','U2','EP3','RC12',
  'V22','CH47','UH60','AH64','AH1Z','MV22',
  'EUFI','RFAL','TORD','TYP','GR4',
]);

const AIRLINE_CODE_RE = /^([A-Z]{3})\d/;
const MILITARY_CALLSIGN_RE = /^(RCH|KING|DUKE|EVAC|JAKE|REACH|CONVOY|PAT|VV|VM|CNV|HERKY|NACHO|ROPER|SHELL|LAGR|GOLD|QID)\d/i;

const cache = new Map<string, { data: unknown; fetchedAt: number }>();
let fetchPromise: Promise<unknown> | null = null;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': status === 200 ? 'public, s-maxage=30, stale-while-revalidate=60' : 'no-store',
    },
  });
}

function clampLat(value: number) {
  return Math.max(-90, Math.min(90, value));
}

function clampLon(value: number) {
  return Math.max(-180, Math.min(180, value));
}

function clampDist(value: number) {
  if (!Number.isFinite(value)) return MAX_RADIUS_NM;
  return Math.max(1, Math.min(MAX_RADIUS_NM, Math.round(value)));
}

function parseNumber(value: string | null) {
  if (value == null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) throw new Error('Proxy path must start with /');
  if (trimmed.includes('://') || trimmed.includes('..')) throw new Error('Unsafe proxy path');
  return trimmed;
}

async function fetchJsonWithTimeout(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OSIRIS/2.0 flight-feed',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') || contentType.includes('text/xml')) {
    throw new Error('Provider returned non-JSON response');
  }

  return response.json();
}

async function fetchProviderPath(path: string, provider: FlightProvider) {
  const normalizedPath = normalizePath(path);
  const url = `${PROVIDERS[provider].baseUrl}${normalizedPath}`;
  return fetchJsonWithTimeout(url);
}

async function fetchPoint(point: RegionPoint) {
  const path = `/point/${clampLat(point.lat).toFixed(4)}/${clampLon(point.lon).toFixed(4)}/${clampDist(point.dist)}`;
  const errors: string[] = [];

  for (const provider of PROVIDER_ORDER) {
    try {
      const payload = await fetchProviderPath(path, provider);
      const ac = Array.isArray(payload?.ac) ? payload.ac : [];
      return { ac, provider, point: point.id, error: null as string | null };
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { ac: [] as RawAircraft[], provider: null, point: point.id, error: errors.join('; ') };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function classifyFlight(f: RawAircraft): ClassifiedFlight | null {
  const modelUpper = (f.t || '').toUpperCase();
  const flightStr = (f.flight || '').trim().toUpperCase();
  const dbFlags = f.dbFlags || 0;

  if (modelUpper === 'TWR') return null;
  if (typeof f.seen_pos === 'number' && f.seen_pos > MAX_POSITION_AGE_S) return null;

  const lat = f.lat;
  const lon = f.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const callsign = flightStr || f.hex || 'UNKNOWN';
  const altitudeFeet = typeof f.alt_baro === 'number'
    ? f.alt_baro
    : typeof f.alt_geom === 'number'
      ? f.alt_geom
      : 0;
  const altMeters = altitudeFeet * 0.3048;
  const speedKnots = typeof f.gs === 'number' ? Math.round(f.gs * 10) / 10 : null;
  const heading = typeof f.track === 'number' ? f.track : 0;
  const isHeli = HELI_TYPES.has(modelUpper);
  const isGrounded = f.alt_baro === 'ground' || (typeof altitudeFeet === 'number' && altitudeFeet < 100);
  const airlineMatch = AIRLINE_CODE_RE.exec(callsign);
  const airlineCode = airlineMatch ? airlineMatch[1] : '';

  let category: ClassifiedFlight['category'] = 'commercial';
  if ((dbFlags & 1) || MILITARY_INDICATORS.has(modelUpper) || MILITARY_CALLSIGN_RE.test(flightStr)) {
    category = 'military';
  } else if (PRIVATE_JET_TYPES.has(modelUpper)) {
    category = 'jet';
  } else if (!airlineCode && modelUpper && !AIRLINER_TYPES.has(modelUpper)) {
    category = 'private';
  }

  return {
    callsign,
    lat: Math.round((lat as number) * 100000) / 100000,
    lng: Math.round((lon as number) * 100000) / 100000,
    alt: Math.round(altMeters),
    heading: Math.round(heading),
    speed_knots: speedKnots,
    model: f.t || 'Unknown',
    icao24: f.hex || '',
    registration: f.r || 'N/A',
    squawk: f.squawk || '',
    airline_code: airlineCode,
    aircraft_category: isHeli ? 'heli' : 'plane',
    category,
    grounded: isGrounded,
    nac_p: f.nac_p,
    type: 'flight',
  };
}

function aggregateJamming(points: ClassifiedFlight[], threshold: number) {
  if (points.length === 0) return [];
  const grid = new Map<string, { lat: number; lng: number; count: number; total_nac_p: number }>();
  const gridSize = 2;

  for (const p of points) {
    const gLat = Math.floor(p.lat / gridSize) * gridSize;
    const gLng = Math.floor(p.lng / gridSize) * gridSize;
    const key = `${gLat},${gLng}`;

    if (!grid.has(key)) {
      grid.set(key, { lat: gLat + gridSize / 2, lng: gLng + gridSize / 2, count: 0, total_nac_p: 0 });
    }

    const cell = grid.get(key)!;
    cell.count++;
    cell.total_nac_p += p.nac_p ?? threshold;
  }

  return Array.from(grid.values())
    .filter(z => z.count >= 3)
    .map(z => ({
      lat: z.lat,
      lng: z.lng,
      severity: Math.max(0, Math.round((1 - (z.total_nac_p / z.count) / threshold) * 100)),
      count: z.count,
    }));
}

function buildPointsFromRequest(request: NextRequest): RegionPoint[] {
  const params = request.nextUrl.searchParams;
  const lat = parseNumber(params.get('lat'));
  const lon = parseNumber(params.get('lon'));
  const dist = parseNumber(params.get('dist')) ?? parseNumber(params.get('radius'));

  if (lat !== undefined && lon !== undefined) {
    return [{ id: 'custom', lat: clampLat(lat), lon: clampLon(lon), dist: clampDist(dist ?? MAX_RADIUS_NM) }];
  }

  return DEFAULT_POINTS;
}

async function buildClassifiedFeed(request: NextRequest) {
  const points = buildPointsFromRequest(request);
  const results = await mapLimit(points, 3, fetchPoint);
  const allRaw: RawAircraft[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const ac of result.ac) {
      const key = (ac.hex || `${ac.flight || ''}:${ac.lat}:${ac.lon}`).toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      allRaw.push(ac);
    }
  }

  const commercial: ClassifiedFlight[] = [];
  const privateFl: ClassifiedFlight[] = [];
  const jets: ClassifiedFlight[] = [];
  const military: ClassifiedFlight[] = [];
  const gpsJammingCandidates: ClassifiedFlight[] = [];
  const jammingThreshold = 4;

  for (const raw of allRaw) {
    const flight = classifyFlight(raw);
    if (!flight) continue;

    if (typeof flight.nac_p === 'number' && flight.nac_p <= jammingThreshold && !flight.grounded) {
      gpsJammingCandidates.push(flight);
    }

    switch (flight.category) {
      case 'military':
        military.push(flight);
        break;
      case 'jet':
        jets.push(flight);
        break;
      case 'private':
        privateFl.push(flight);
        break;
      default:
        commercial.push(flight);
    }
  }

  return {
    commercial_flights: commercial,
    private_flights: privateFl,
    private_jets: jets,
    military_flights: military,
    gps_jamming: aggregateJamming(gpsJammingCandidates, jammingThreshold),
    total: allRaw.length,
    rendered_total: commercial.length + privateFl.length + jets.length + military.length,
    timestamp: new Date().toISOString(),
    source: 'airplanes.live/adsb.lol readsb /point feed',
    regions: results.map(r => ({ id: r.point, provider: r.provider, count: r.ac.length, error: r.error })),
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const proxyPath = params.get('path');
  const provider = (params.get('provider') || 'airplanes').toLowerCase() as FlightProvider;

  if (proxyPath) {
    if (!(provider in PROVIDERS)) {
      return json({ error: `Unknown flight provider: ${provider}` }, 400);
    }

    try {
      const cacheKey = `proxy:${provider}:${proxyPath}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return json(cached.data);

      const payload = await fetchProviderPath(proxyPath, provider);
      cache.set(cacheKey, { data: payload, fetchedAt: Date.now() });
      return json(payload);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Flight proxy failed' }, 502);
    }
  }

  const cacheKey = `classified:${params.get('lat') ?? 'default'}:${params.get('lon') ?? 'default'}:${params.get('dist') ?? params.get('radius') ?? 'default'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return json(cached.data);

  if (fetchPromise && cacheKey === 'classified:default:default:default') {
    try {
      return json(await fetchPromise);
    } catch {
      // continue to regular error path below
    }
  }

  const task = buildClassifiedFeed(request);
  if (cacheKey === 'classified:default:default:default') fetchPromise = task;

  try {
    const data = await task;
    cache.set(cacheKey, { data, fetchedAt: Date.now() });
    return json(data);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to fetch flight data' }, 502);
  } finally {
    if (cacheKey === 'classified:default:default:default') fetchPromise = null;
  }
}
