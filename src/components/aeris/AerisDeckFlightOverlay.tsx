'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { PickingInfo } from '@deck.gl/core';
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { AerisFlightData, OsirisFlight } from '@/hooks/useAerisFlightFeed';
import { subscribeOsirisMap } from '@/lib/osirisMapRegistry';

type FlightCategory = 'commercial' | 'private' | 'jet' | 'military';

type DeckFlight = OsirisFlight & {
  key: string;
  deckCategory: FlightCategory;
  altitudeMeters: number;
  color: [number, number, number, number];
};

type TrailRecord = {
  key: string;
  callsign: string;
  deckCategory: FlightCategory;
  path: [number, number, number][];
  color: [number, number, number, number];
  updatedAt: number;
};

type AerisDeckFlightOverlayProps = {
  data: AerisFlightData;
  activeLayers: Record<string, boolean>;
  enabled: boolean;
  projection: 'mercator' | 'globe';
};

const AIRCRAFT_ATLAS = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <path fill="white" d="M32 3c2 0 3.8 1.9 3.8 4.2v18.6l22.6 13.4v6.1L35.8 38v12.6l7.5 5.2v5.1L32 57.6 20.7 61v-5.1l7.5-5.2V38L5.6 45.3v-6.1l22.6-13.4V7.2C28.2 4.9 30 3 32 3Z"/>
  </svg>`,
)}`;

const ICON_MAPPING = {
  plane: { x: 0, y: 0, width: 64, height: 64, anchorX: 32, anchorY: 32, mask: true },
};

function isUsableFlight(f: OsirisFlight) {
  return Number.isFinite(f.lat) && Number.isFinite(f.lng) && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180;
}

function categoryBaseColor(category: FlightCategory): [number, number, number, number] {
  switch (category) {
    case 'military': return [255, 61, 61, 235];
    case 'jet': return [255, 105, 180, 225];
    case 'private': return [212, 175, 55, 225];
    default: return [0, 229, 255, 220];
  }
}

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function altitudeColor(altitudeMeters: number, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!Number.isFinite(altitudeMeters) || altitudeMeters <= 0) return fallback;

  const low = [0, 229, 255];
  const mid = [212, 175, 55];
  const high = [255, 61, 61];

  if (altitudeMeters <= 6000) {
    const t = Math.max(0, Math.min(1, altitudeMeters / 6000));
    return [mix(low[0], mid[0], t), mix(low[1], mid[1], t), mix(low[2], mid[2], t), fallback[3]];
  }

  const t = Math.max(0, Math.min(1, (altitudeMeters - 6000) / 7000));
  return [mix(mid[0], high[0], t), mix(mid[1], high[1], t), mix(mid[2], high[2], t), fallback[3]];
}

function makeDeckFlight(f: OsirisFlight, deckCategory: FlightCategory): DeckFlight | null {
  if (!isUsableFlight(f)) return null;

  const altitudeMeters = typeof f.alt === 'number' && Number.isFinite(f.alt) ? Math.max(0, f.alt) : 0;
  const base = categoryBaseColor(deckCategory);
  const key = (f.icao24 || f.callsign || `${deckCategory}-${f.lat}-${f.lng}`).toString().trim().toLowerCase();

  return {
    ...f,
    key,
    deckCategory,
    altitudeMeters,
    color: altitudeColor(altitudeMeters, base),
  };
}

function collectFlights(data: AerisFlightData, activeLayers: Record<string, boolean>): DeckFlight[] {
  const flights: DeckFlight[] = [];
  const push = (items: OsirisFlight[] | undefined, category: FlightCategory) => {
    for (const item of items ?? []) {
      const flight = makeDeckFlight(item, category);
      if (flight) flights.push(flight);
    }
  };

  if (activeLayers.flights) push(data.commercial_flights, 'commercial');
  if (activeLayers.private) push(data.private_flights, 'private');
  if (activeLayers.jets) push(data.private_jets, 'jet');
  if (activeLayers.military) push(data.military_flights, 'military');

  return flights;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatAltitude(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return '—';
  return `${Math.round(meters)} m / ${Math.round(meters * 3.28084)} ft`;
}

function popupHtml(f: DeckFlight) {
  const callsign = escapeHtml((f.callsign || '').trim() || 'UNKNOWN');
  const icao = escapeHtml(f.icao24 || '');
  const model = escapeHtml(f.model || '—');
  const reg = escapeHtml(f.registration || '—');
  const category = escapeHtml(f.deckCategory.toUpperCase());
  const speed = f.speed_knots == null ? '—' : `${escapeHtml(f.speed_knots)} kt`;
  const heading = Number.isFinite(f.heading) ? `${Math.round(f.heading ?? 0)}°` : '—';
  const accent = f.deckCategory === 'military' ? '#ff3d3d' : f.deckCategory === 'jet' ? '#ff69b4' : f.deckCategory === 'private' ? '#d4af37' : '#00e5ff';

  return `<div style="background:rgba(12,14,26,0.96);backdrop-filter:blur(16px);border:1px solid ${accent}66;border-radius:10px;padding:14px;font-family:'JetBrains Mono',monospace;min-width:280px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:12px;">
      <span style="color:${accent};font-size:15px;font-weight:800;letter-spacing:0.12em;">${callsign}</span>
      <span style="color:#8fb8c8;font-size:9px;">${category}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px;line-height:1.35;">
      <div><span style="color:#5c7180;font-size:8px;">ICAO</span><br/><span style="color:#e8e6e0;">${icao || '—'}</span></div>
      <div><span style="color:#5c7180;font-size:8px;">MODEL</span><br/><span style="color:#e8e6e0;">${model}</span></div>
      <div><span style="color:#5c7180;font-size:8px;">ALTITUDE</span><br/><span style="color:#00e5ff;">${formatAltitude(f.altitudeMeters)}</span></div>
      <div><span style="color:#5c7180;font-size:8px;">SPEED</span><br/><span style="color:#e8e6e0;">${speed}</span></div>
      <div><span style="color:#5c7180;font-size:8px;">HEADING</span><br/><span style="color:#e8e6e0;">${heading}</span></div>
      <div><span style="color:#5c7180;font-size:8px;">REG</span><br/><span style="color:#e8e6e0;">${reg}</span></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
      <button onclick="window.osirisFocusFlight && window.osirisFocusFlight(${Number(f.lng)}, ${Number(f.lat)})" style="flex:1;padding:6px 10px;background:${accent}22;border:1px solid ${accent}80;color:${accent};font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;letter-spacing:0.12em;border-radius:5px;cursor:pointer;">⌖ CENTER</button>
      <a href="https://globe.adsbexchange.com/?icao=${encodeURIComponent(String(f.icao24 || ''))}" target="_blank" style="flex:1;text-align:center;padding:6px 10px;background:rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.45);color:#00e5ff;text-decoration:none;font-size:10px;font-weight:800;letter-spacing:0.12em;border-radius:5px;">ADS-B ↗</a>
    </div>
  </div>`;
}

function isOverlaySafeMap(map: maplibregl.Map) {
  try {
    return typeof map.isStyleLoaded === 'function' ? map.isStyleLoaded() : true;
  } catch {
    return false;
  }
}

export default function AerisDeckFlightOverlay({ data, activeLayers, enabled, projection }: AerisDeckFlightOverlayProps) {
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [trailVersion, setTrailVersion] = useState(0);
  const [overlayFailed, setOverlayFailed] = useState(false);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const trailsRef = useRef<Map<string, TrailRecord>>(new Map());
  const aerisActive = enabled && activeLayers.aeris_deck !== false;

  useEffect(() => subscribeOsirisMap(setMap), []);

  useEffect(() => {
    if (aerisActive) setOverlayFailed(false);
  }, [aerisActive, map]);

  const deckFlights = useMemo(() => {
    if (!aerisActive || overlayFailed) return [];
    try {
      return collectFlights(data, activeLayers);
    } catch (error) {
      console.warn('[OSIRIS] Aeris flight collection failed:', error);
      return [];
    }
  }, [data, activeLayers, aerisActive, overlayFailed]);

  useEffect(() => {
    if (!aerisActive || overlayFailed) {
      trailsRef.current.clear();
      setTrailVersion(v => v + 1);
      return;
    }

    const now = Date.now();
    for (const flight of deckFlights) {
      const coord: [number, number, number] = [flight.lng, flight.lat, flight.altitudeMeters];
      const existing = trailsRef.current.get(flight.key) ?? {
        key: flight.key,
        callsign: flight.callsign || flight.icao24 || flight.key,
        deckCategory: flight.deckCategory,
        path: [],
        color: flight.color,
        updatedAt: now,
      };

      const last = existing.path[existing.path.length - 1];
      const movedEnough = !last || Math.abs(last[0] - coord[0]) > 0.01 || Math.abs(last[1] - coord[1]) > 0.01 || Math.abs(last[2] - coord[2]) > 250;
      if (movedEnough) existing.path.push(coord);

      existing.path = existing.path.slice(-22);
      existing.color = flight.color;
      existing.deckCategory = flight.deckCategory;
      existing.updatedAt = now;
      trailsRef.current.set(flight.key, existing);
    }

    for (const [key, trail] of trailsRef.current) {
      if (now - trail.updatedAt > 8 * 60_000) trailsRef.current.delete(key);
    }

    setTrailVersion(v => v + 1);
  }, [deckFlights, aerisActive, overlayFailed]);

  const trailData = useMemo(
    () => Array.from(trailsRef.current.values()).filter(trail => trail.path.length > 1),
    [trailVersion],
  );

  useEffect(() => {
    if (!map) return;

    const focus = (lng: number, lat: number) => {
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), projection === 'globe' ? 7.5 : 9),
        pitch: projection === 'globe' ? 45 : 55,
        duration: 1200,
        essential: true,
      });
    };

    (window as any).osirisFocusFlight = focus;
    return () => {
      if ((window as any).osirisFocusFlight === focus) delete (window as any).osirisFocusFlight;
    };
  }, [map, projection]);

  useEffect(() => {
    if (!map || !aerisActive || overlayFailed) return;
    if (!isOverlaySafeMap(map)) return;

    let overlay: MapboxOverlay | null = null;

    try {
      overlay = new MapboxOverlay({
        interleaved: false,
        layers: [],
        onError: (error: Error) => {
          console.warn('[OSIRIS] Aeris Deck.gl runtime error:', error);
          setOverlayFailed(true);
          return true;
        },
      } as any);
      (map as any).addControl(overlay as any);
      overlayRef.current = overlay;
    } catch (error) {
      console.warn('[OSIRIS] Aeris Deck.gl overlay disabled:', error);
      overlayRef.current = null;
      overlay?.finalize();
      setOverlayFailed(true);
      return;
    }

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      try {
        overlay?.setProps({ layers: [] });
        if (overlay) (map as any).removeControl(overlay as any);
      } catch {
        overlay?.finalize();
      }
      overlayRef.current = null;
    };
  }, [map, aerisActive, overlayFailed]);

  const layers = useMemo(() => {
    if (!aerisActive || overlayFailed) return [];

    try {
      const labelFlights = deckFlights
        .filter(f => f.deckCategory === 'military' || f.deckCategory === 'jet')
        .slice(0, 350);

      return [
        new PathLayer<TrailRecord>({
          id: 'aeris-flight-trails',
          data: trailData,
          getPath: d => d.path,
          getColor: d => [d.color[0], d.color[1], d.color[2], 145],
          getWidth: d => (d.deckCategory === 'military' ? 2.4 : 1.4),
          widthMinPixels: 1,
          widthMaxPixels: 5,
          jointRounded: true,
          capRounded: true,
          parameters: { depthTest: false },
        }),
        new ScatterplotLayer<DeckFlight>({
          id: 'aeris-flight-shadows',
          data: deckFlights,
          getPosition: d => [d.lng, d.lat, 0],
          getRadius: d => (d.deckCategory === 'military' ? 9000 : 6000),
          radiusUnits: 'meters',
          radiusMinPixels: 1.5,
          radiusMaxPixels: 10,
          getFillColor: [0, 0, 0, 95],
          stroked: false,
          filled: true,
          parameters: { depthTest: false },
        }),
        new IconLayer<DeckFlight>({
          id: 'aeris-aircraft-icons',
          data: deckFlights,
          pickable: true,
          iconAtlas: AIRCRAFT_ATLAS,
          iconMapping: ICON_MAPPING,
          getIcon: () => 'plane',
          getPosition: d => [d.lng, d.lat, d.altitudeMeters],
          getAngle: d => 360 - (d.heading ?? 0),
          getSize: d => (d.deckCategory === 'military' ? 34 : d.deckCategory === 'jet' ? 31 : 27),
          sizeUnits: 'pixels',
          getColor: d => d.color,
          onClick: (info: PickingInfo<DeckFlight>) => {
            if (!info.object || !map) return false;
            popupRef.current?.remove();
            popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '360px', offset: 16 })
              .setLngLat([info.object.lng, info.object.lat])
              .setHTML(popupHtml(info.object))
              .addTo(map);
            return true;
          },
          parameters: { depthTest: false },
        }),
        new TextLayer<DeckFlight>({
          id: 'aeris-aircraft-labels',
          data: labelFlights,
          getPosition: d => [d.lng, d.lat, d.altitudeMeters],
          getText: d => (d.callsign || d.icao24 || '').toString().trim(),
          getSize: 10,
          getColor: d => [d.color[0], d.color[1], d.color[2], 210],
          getPixelOffset: [0, -24],
          background: true,
          getBackgroundColor: [0, 0, 0, 150],
          backgroundPadding: [4, 2],
          fontFamily: 'JetBrains Mono, monospace',
          parameters: { depthTest: false },
        }),
      ];
    } catch (error) {
      console.warn('[OSIRIS] Aeris layer creation failed:', error);
      return [];
    }
  }, [aerisActive, deckFlights, map, overlayFailed, trailData]);

  useEffect(() => {
    if (!overlayRef.current) return;

    try {
      overlayRef.current.setProps({ layers });
    } catch (error) {
      console.warn('[OSIRIS] Aeris layer update failed:', error);
      setOverlayFailed(true);
    }
  }, [layers]);

  return null;
}
