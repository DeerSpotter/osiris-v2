// ── readsb API Client ────────────────────────────────────────────────
//
// 3-tier fallback: adsb.lol proxy → airplanes.live proxy → OpenSky.
// Dev/override: ?provider=airplanes|adsb|opensky in the URL.
// Static Pages builds use the OSIRIS Cloudflare Worker for the readsb proxy.
// ────────────────────────────────────────────────────────────────────────

import type { FlightState } from "./opensky-types";
import type { ReadsbApiResponse } from "./flight-api-types";
import { MAX_RADIUS_NM, NM_PER_DEG_LAT } from "./flight-api-types";
import { parseAircraftList, type ParseOptions } from "./flight-api-parsing";
import {
  bboxFromCenter,
  fetchFlightsByBbox,
  fetchFlightByIcao24 as openskyFetchByIcao24,
} from "./opensky-flights";

// ── Types ──────────────────────────────────────────────────────────────

export type ProviderName = "airplanes" | "adsb" | "opensky" | "auto";

export interface FlightApiFetchResult {
  flights: FlightState[];
  rateLimited: boolean;
  source?: string;
}

export type CircuitState = "closed" | "open" | "half-open";

interface TierCircuit {
  state: CircuitState;
  failures: number;
  openUntil: number;
}

interface NamedTier {
  id: string;
  fn: () => Promise<FlightState[]>;
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_BASE_COOLDOWN_MS = 60_000;
const CIRCUIT_MAX_COOLDOWN_MS = 300_000;
const PROXY_TIMEOUT_MS = 8_000;
const STICKY_WINDOW_MS = 60_000;
const WORKER_PROXY_BASE =
  process.env.NEXT_PUBLIC_OSIRIS_FLIGHT_PROXY ||
  "https://osiris-v2.spotterdeer.workers.dev";

const circuits = new Map<string, TierCircuit>();
let stickySource: string | null = null;
let stickyUntil = 0;
let onlineListenerRegistered = false;

if (typeof window !== "undefined" && !onlineListenerRegistered) {
  onlineListenerRegistered = true;
  window.addEventListener("online", resetAllCircuits);
}

function shouldSkipTier(tierId: string): boolean {
  const circuit = circuits.get(tierId);
  if (!circuit || circuit.state === "closed") return false;
  if (circuit.state === "open" && Date.now() >= circuit.openUntil) {
    circuit.state = "half-open";
    return false;
  }
  return circuit.state === "open";
}

function recordSuccess(tierId: string): void {
  circuits.set(tierId, { state: "closed", failures: 0, openUntil: 0 });
}

function recordFailure(tierId: string): void {
  const circuit = circuits.get(tierId) ?? {
    state: "closed" as CircuitState,
    failures: 0,
    openUntil: 0,
  };

  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    const exponent = circuit.failures - CIRCUIT_FAILURE_THRESHOLD;
    const cooldown = Math.min(
      CIRCUIT_BASE_COOLDOWN_MS * Math.pow(2, exponent),
      CIRCUIT_MAX_COOLDOWN_MS,
    );
    circuit.state = "open";
    circuit.openUntil = Date.now() + cooldown;
  }

  circuits.set(tierId, circuit);
}

function recordStickySuccess(tierId: string): void {
  stickySource = tierId;
  stickyUntil = Date.now() + STICKY_WINDOW_MS;
}

function isNonCircuitError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("429") || msg.includes("rate limit");
}

export function getCircuitState(tierId: string): {
  state: CircuitState;
  failures: number;
  cooldownRemaining: number;
} {
  const circuit = circuits.get(tierId);
  if (!circuit || circuit.state === "closed") {
    return { state: "closed", failures: 0, cooldownRemaining: 0 };
  }
  return {
    state: circuit.state,
    failures: circuit.failures,
    cooldownRemaining: Math.max(0, circuit.openUntil - Date.now()),
  };
}

export function resetAllCircuits(): void {
  circuits.clear();
}

export function getProviderOverride(): ProviderName {
  if (typeof window === "undefined") return "auto";
  const provider = new URLSearchParams(window.location.search)
    .get("provider")
    ?.toLowerCase();
  if (provider === "airplanes" || provider === "adsb" || provider === "opensky") {
    return provider;
  }
  return "auto";
}

function degreesToNm(degrees: number): number {
  if (!Number.isFinite(degrees) || degrees <= 0) return 150;
  const nm = Math.round(degrees * NM_PER_DEG_LAT);
  return Math.min(Math.max(nm, 1), MAX_RADIUS_NM);
}

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (externalSignal?.aborted) throw new DOMException("Aborted", "AbortError");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort);

  try {
    return await fn(controller.signal);
  } catch (err) {
    if (externalSignal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

function validateReadsb(payload: unknown): ReadsbApiResponse {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as ReadsbApiResponse).ac)
  ) {
    throw new Error("Invalid readsb response shape");
  }
  return payload as ReadsbApiResponse;
}

async function fetchViaProxy(
  path: string,
  provider: "adsb" | "airplanes" = "adsb",
  signal?: AbortSignal,
): Promise<ReadsbApiResponse> {
  return withTimeout(
    async (innerSignal) => {
      const url = `${WORKER_PROXY_BASE.replace(/\/$/, "")}/flights?path=${encodeURIComponent(path)}&provider=${provider}`;
      const res = await fetch(url, { cache: "no-store", signal: innerSignal });

      if (!res.ok) throw new Error(`${provider} proxy ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html") || contentType.includes("text/xml")) {
        throw new Error(`${provider} proxy returned non-JSON response`);
      }

      return validateReadsb(await res.json());
    },
    PROXY_TIMEOUT_MS,
    signal,
  );
}

async function fetchFromOpenSkyPoint(
  lat: number,
  lon: number,
  radiusDeg: number,
  signal?: AbortSignal,
): Promise<FlightState[]> {
  const [lamin, lamax, lomin, lomax] = bboxFromCenter(lon, lat, radiusDeg);
  const result = await fetchFlightsByBbox(lamin, lamax, lomin, lomax, signal);
  if (result.rateLimited) throw new Error("OpenSky rate limited (429)");
  return result.flights;
}

async function fetchFromOpenSkyHex(
  icao24: string,
  signal?: AbortSignal,
): Promise<FlightState[]> {
  const result = await openskyFetchByIcao24(icao24, signal);
  return result.flight ? [result.flight] : [];
}

async function runFallbackChain(
  tiers: NamedTier[],
  signal?: AbortSignal,
): Promise<FlightApiFetchResult> {
  let lastError: Error | null = null;
  let allSkipped = true;
  let lastTriedId: string | undefined;

  const orderedTiers =
    stickySource && Date.now() < stickyUntil
      ? [
          ...tiers.filter((tier) => tier.id === stickySource),
          ...tiers.filter((tier) => tier.id !== stickySource),
        ]
      : tiers;

  for (const { id, fn } of orderedTiers) {
    if (shouldSkipTier(id)) continue;
    allSkipped = false;
    lastTriedId = id;

    try {
      const flights = await fn();
      recordSuccess(id);
      recordStickySuccess(id);
      return { flights, rateLimited: false, source: id };
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (!isNonCircuitError(err)) recordFailure(id);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (allSkipped) return { flights: [], rateLimited: false, source: "none" };

  const msg = lastError?.message?.toLowerCase() ?? "";
  if (msg.includes("429") || msg.includes("rate limit")) {
    return { flights: [], rateLimited: true, source: lastTriedId };
  }

  throw lastError ?? new Error("All flight providers failed");
}

export async function fetchFlightsByPoint(
  lat: number,
  lon: number,
  radiusDeg: number,
  signal?: AbortSignal,
  options?: ParseOptions,
): Promise<FlightApiFetchResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { flights: [], rateLimited: false };
  }

  const radiusNm = degreesToNm(radiusDeg);
  const cLat = Math.max(-90, Math.min(90, lat));
  const cLon = Math.max(-180, Math.min(180, lon));
  const readsbPath = `/point/${cLat.toFixed(4)}/${cLon.toFixed(4)}/${radiusNm}`;
  const override = getProviderOverride();
  const tiers: NamedTier[] = [];

  if (override === "adsb" || override === "auto") {
    tiers.push({
      id: "adsb",
      fn: async () => parseAircraftList((await fetchViaProxy(readsbPath, "adsb", signal)).ac, options),
    });
  }

  if (override === "airplanes" || override === "auto") {
    tiers.push({
      id: "airplanes",
      fn: async () =>
        parseAircraftList((await fetchViaProxy(readsbPath, "airplanes", signal)).ac, options),
    });
  }

  if (override === "auto" || override === "opensky") {
    tiers.push({
      id: "opensky",
      fn: () => fetchFromOpenSkyPoint(cLat, cLon, radiusDeg, signal),
    });
  }

  return runFallbackChain(tiers, signal);
}

export async function fetchFlightByHex(
  icao24: string,
  signal?: AbortSignal,
): Promise<{ flight: FlightState | null }> {
  const normalized = icao24.trim().toLowerCase();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return { flight: null };

  const parseOpts: ParseOptions = {
    includeGround: true,
    requireBaroAltitude: false,
  };
  const readsbPath = `/hex/${encodeURIComponent(normalized)}`;
  const override = getProviderOverride();
  const tiers: NamedTier[] = [];

  if (override === "adsb" || override === "auto") {
    tiers.push({
      id: "adsb",
      fn: async () => parseAircraftList((await fetchViaProxy(readsbPath, "adsb", signal)).ac, parseOpts),
    });
  }

  if (override === "airplanes" || override === "auto") {
    tiers.push({
      id: "airplanes",
      fn: async () =>
        parseAircraftList((await fetchViaProxy(readsbPath, "airplanes", signal)).ac, parseOpts),
    });
  }

  if (override === "auto" || override === "opensky") {
    tiers.push({
      id: "opensky",
      fn: () => fetchFromOpenSkyHex(normalized, signal),
    });
  }

  const result = await runFallbackChain(tiers, signal);
  return { flight: result.flights[0] ?? null };
}

export async function fetchFlightByCallsign(
  callsign: string,
  signal?: AbortSignal,
): Promise<{ flight: FlightState | null }> {
  const normalized = callsign.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{1,8}$/.test(normalized)) return { flight: null };

  const parseOpts: ParseOptions = {
    includeGround: true,
    requireBaroAltitude: false,
  };
  const readsbPath = `/callsign/${encodeURIComponent(normalized)}`;
  const override = getProviderOverride();
  const tiers: NamedTier[] = [];

  if (override === "adsb" || override === "auto") {
    tiers.push({
      id: "adsb",
      fn: async () => parseAircraftList((await fetchViaProxy(readsbPath, "adsb", signal)).ac, parseOpts),
    });
  }

  if (override === "airplanes" || override === "auto") {
    tiers.push({
      id: "airplanes",
      fn: async () =>
        parseAircraftList((await fetchViaProxy(readsbPath, "airplanes", signal)).ac, parseOpts),
    });
  }

  const result = await runFallbackChain(tiers, signal);
  return { flight: result.flights[0] ?? null };
}
