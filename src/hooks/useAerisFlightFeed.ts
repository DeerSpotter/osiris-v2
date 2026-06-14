'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

export function useAerisFlightFeed(enabled: boolean): AerisFlightFeedState {
  const [data, setData] = useState<AerisFlightData>(EMPTY_FLIGHT_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      inFlightRef.current?.abort();
      setLoading(false);
      setError(null);
      setData(EMPTY_FLIGHT_DATA);
      return;
    }

    let stopped = false;

    async function refresh() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/flights', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Flight feed ${response.status}: ${await readErrorMessage(response)}`);
        }

        const payload = normalizePayload(await response.json());
        if (stopped || controller.signal.aborted) return;

        setData(payload);
        setLastUpdated(payload.timestamp ?? new Date().toISOString());
      } catch (err) {
        if (stopped) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Flight feed failed');
      } finally {
        if (!stopped) setLoading(false);
      }
    }

    refresh();
    const interval = window.setInterval(refresh, 45_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      inFlightRef.current?.abort();
    };
  }, [enabled]);

  const total = useMemo(() => countFlights(data), [data]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    source: data.source ?? '/api/flights',
    total,
  };
}
