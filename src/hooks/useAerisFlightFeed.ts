'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type OsirisFlight = {
  callsign?: string;
  lat: number;
  lng: number;
  alt?: number;
  heading?: number;
  speed_knots?: number | null;
  model?: string;
  icao24?: string;
  registration?: string;
  category?: string;
};

export type AerisFlightData = {
  commercial_flights: OsirisFlight[];
  private_flights: OsirisFlight[];
  private_jets: OsirisFlight[];
  military_flights: OsirisFlight[];
  gps_jamming?: any[];
  total?: number;
  rendered_total?: number;
  timestamp?: string;
  source?: string;
  regions?: Array<{ id: string; provider: string | null; count: number; error: string | null }>;
};

type AerisFlightFeedState = {
  data: AerisFlightData;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  source: string;
  total: number;
  refresh: () => Promise<void>;
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

type DirectPoint = {
  id: string;
  lat: number;
  lon: number;
  dist: number;
};

const EMPTY_FLIGHT_DATA: AerisFlightData = {
  commercial_flights: [],
  private_flights: [],
  private_jets: [],
  military_flights: [],
  gps_jamming: [],
  total: 0,
  rendered_total: 0,
};

const OSIRIS_FLIGHT_PROXY_URL = (
  process.env.NEXT_PUBLIC_OSIRIS_FLIGHT_PROXY_URL || 'https://osiris-v2.spotterdeer.workers.dev'
).replace(/\/$/, '');

const DIRECT_PROVIDER_ORDER = [
  { id: 'airplanes.live', baseUrl: 'https://api.airplanes.live/v2' },
  { id: 'adsb.lol', baseUrl: 'https://api.adsb.lol/v2' },
] as const;

const DIRECT_POINTS: DirectPoint[] = [
  { id: 'us-northeast', lat: 40.3, lon: -75.0, dist: 250 },
  { id: 'us-southeast', lat: 33.65, lon: -84.42, dist: 250 },
  { id: 'us-midwest', lat: 41.88, lon: -87.63, dist: 250 },
  { id: 'us-texas', lat: 32.78, lon: -97.04, dist: 250 },
  { id: 'us-west', lat: 34.05, lon: -118.25, dist: 250 },
  { id: 'us-pacific-nw', lat: 47.61, lon: -122.33, dist: 250 },
  { id: 'europe-west', lat: 51.47, lon: -0.45, dist: 250 },
  { id: 'europe-central', lat: 50.04, lon: 8.57, dist: 250 },
  { id: 'middle-east', lat: 25.25, lon: 55.36, dist: 250 },
  { id: 'india', lat: 28.56, lon: 77.1, dist: 250 },
  { id: 'east-asia', lat: 35.55, lon: 139.78, dist: 250 },
  { id: 'australia-east', lat: -33.94, lon: 151.18, dist: 250 },
];

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
const MAX_POSITION_AGE_S = 90;

function normalizePayload(payload: Partial<AerisFlightData>): AerisFlightData {
  return {
    commercial_flights: Array.isArray(payload.commercial_flights) ? payload.commercial_flights : [],
    private_flights: Array.isArray(payload.private_flights) ? payload.private_flights : [],
    private_jets: Array.isArray(payload.private_jets) ? payload.private_jets : [],
    military_flights: Array.isArray(payload.military_flights) ? payload.military_flights : [],
    gps_jamming: Array.isArray(payload.gps_jamming) ? payload.gps_jamming : [],
    total: typeof payload.total === 'number' ? payload.total : undefined,
    rendered_total: typeof payload.rendered_total === 'number' ? payload.rendered_total : undefined,
    timestamp: payload.timestamp,
    source: payload.source,
    regions: Array.isArray(payload.regions) ? payload.regions : undefined,
  };
}

function countFlights(data: AerisFlightData): number {
  return (
    data.commercial_flights.length +
    data.private_flights.length +
    data.private_jets.length +
    data.military_flights.length
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload?.error) return String(payload.error);
  } catch {
    // Fall through to status text below.
  }
  return response.statusText || `HTTP ${response.status}`;
}

function classifyRawAircraft(raw: RawAircraft): OsirisFlight | null {
  const modelUpper = (raw.t || '').toUpperCase();
  const flightStr = (raw.flight || '').trim().toUpperCase();

  if (modelUpper === 'TWR') return null;
  if (typeof raw.seen_pos === 'number' && raw.seen_pos > MAX_POSITION_AGE_S) return null;
  if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return null;

  const altitudeFeet = typeof raw.alt_baro === 'number'
    ? raw.alt_baro
    : typeof raw.alt_geom === 'number'
      ? raw.alt_geom
      : 0;
  const altitudeMeters = Math.round(altitudeFeet * 0.3048);
  const callsign = flightStr || raw.hex || 'UNKNOWN';
  const airlineMatch = AIRLINE_CODE_RE.exec(callsign);
  const airlineCode = airlineMatch ? airlineMatch[1] : '';

  let category: OsirisFlight['category'] = 'commercial';
  if ((raw.dbFlags || 0) & 1 || MILITARY_INDICATORS.has(modelUpper) || MILITARY_CALLSIGN_RE.test(flightStr)) {
    category = 'military';
  } else if (PRIVATE_JET_TYPES.has(modelUpper)) {
    category = 'jet';
  } else if (!airlineCode && modelUpper && !AIRLINER_TYPES.has(modelUpper)) {
    category = 'private';
  }

  return {
    callsign,
    lat: Math.round((raw.lat as number) * 100000) / 100000,
    lng: Math.round((raw.lon as number) * 100000) / 100000,
    alt: altitudeMeters,
    heading: typeof raw.track === 'number' ? Math.round(raw.track) : 0,
    speed_knots: typeof raw.gs === 'number' ? Math.round(raw.gs * 10) / 10 : null,
    model: raw.t || 'Unknown',
    icao24: raw.hex || '',
    registration: raw.r || 'N/A',
    category,
  };
}

async function fetchDirectPoint(point: DirectPoint, signal: AbortSignal) {
  const path = `/point/${point.lat.toFixed(4)}/${point.lon.toFixed(4)}/${point.dist}`;
  const errors: string[] = [];

  for (const provider of DIRECT_PROVIDER_ORDER) {
    try {
      const response = await fetch(`${provider.baseUrl}${path}`, {
        cache: 'no-store',
        signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      const payload = await response.json();
      const ac = Array.isArray(payload?.ac) ? payload.ac as RawAircraft[] : [];
      return { id: point.id, provider: provider.id, ac, error: null as string | null };
    } catch (error) {
      if (signal.aborted) throw error;
      errors.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { id: point.id, provider: null, ac: [] as RawAircraft[], error: errors.join('; ') };
}

async function fetchDirectPagesFallback(signal: AbortSignal): Promise<AerisFlightData> {
  const results = await Promise.all(DIRECT_POINTS.map(point => fetchDirectPoint(point, signal)));
  const commercial_flights: OsirisFlight[] = [];
  const private_flights: OsirisFlight[] = [];
  const private_jets: OsirisFlight[] = [];
  const military_flights: OsirisFlight[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (const result of results) {
    for (const raw of result.ac) {
      total++;
      const key = (raw.hex || `${raw.flight || ''}:${raw.lat}:${raw.lon}`).toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const flight = classifyRawAircraft(raw);
      if (!flight) continue;

      switch (flight.category) {
        case 'military':
          military_flights.push(flight);
          break;
        case 'jet':
          private_jets.push(flight);
          break;
        case 'private':
          private_flights.push(flight);
          break;
        default:
          commercial_flights.push(flight);
      }
    }
  }

  return {
    commercial_flights,
    private_flights,
    private_jets,
    military_flights,
    gps_jamming: [],
    total,
    rendered_total: commercial_flights.length + private_flights.length + private_jets.length + military_flights.length,
    timestamp: new Date().toISOString(),
    source: 'browser direct airplanes.live/adsb.lol fallback',
    regions: results.map(r => ({ id: r.id, provider: r.provider, count: r.ac.length, error: r.error })),
  };
}

async function fetchWorkerProxyFeed(signal: AbortSignal): Promise<AerisFlightData> {
  const response = await fetch(`${OSIRIS_FLIGHT_PROXY_URL}/flights`, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Worker feed ${response.status}: ${await readErrorMessage(response)}`);
  }

  return normalizePayload(await response.json());
}

async function fetchNextRouteFeed(signal: AbortSignal): Promise<AerisFlightData> {
  const response = await fetch('/api/flights', {
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Flight feed ${response.status}: ${await readErrorMessage(response)}`);
  }

  return normalizePayload(await response.json());
}

async function fetchFlightFeed(signal: AbortSignal): Promise<AerisFlightData> {
  const errors: string[] = [];

  try {
    return await fetchWorkerProxyFeed(signal);
  } catch (error) {
    if (signal.aborted) throw error;
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    return await fetchNextRouteFeed(signal);
  } catch (error) {
    if (signal.aborted) throw error;
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    return await fetchDirectPagesFallback(signal);
  } catch (error) {
    const direct = error instanceof Error ? error.message : String(error);
    throw new Error(`${errors.join('; ')}; direct fallback failed: ${direct}`);
  }
}

export function useAerisFlightFeed(enabled: boolean): AerisFlightFeedState {
  const [data, setData] = useState<AerisFlightData>(EMPTY_FLIGHT_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      inFlightRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const payload = await fetchFlightFeed(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;

      setData(payload);
      setLastUpdated(payload.timestamp ?? new Date().toISOString());
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Flight feed failed');
    } finally {
      if (mountedRef.current && inFlightRef.current === controller) {
        inFlightRef.current = null;
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      inFlightRef.current?.abort();
      setLoading(false);
      setError(null);
      setData(EMPTY_FLIGHT_DATA);
      return;
    }

    refresh();
    const interval = window.setInterval(refresh, 45_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      inFlightRef.current?.abort();
    };
  }, [enabled, refresh]);

  const total = useMemo(() => countFlights(data), [data]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    source: data.source ?? OSIRIS_FLIGHT_PROXY_URL,
    total,
    refresh,
  };
}
