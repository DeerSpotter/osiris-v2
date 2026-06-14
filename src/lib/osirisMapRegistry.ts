'use client';

import maplibregl from 'maplibre-gl';

type MapListener = (map: maplibregl.Map | null) => void;

let installed = false;
let activeMap: maplibregl.Map | null = null;
const listeners = new Set<MapListener>();
const capturedMaps = new WeakSet<maplibregl.Map>();

function notify() {
  for (const listener of listeners) {
    listener(activeMap);
  }
}

function captureMap(map: maplibregl.Map) {
  if (capturedMaps.has(map)) return;

  capturedMaps.add(map);
  activeMap = map;
  notify();

  map.once('remove', () => {
    if (activeMap === map) {
      activeMap = null;
      notify();
    }
  });
}

/**
 * Captures the MapLibre instance created by the existing OSIRIS map without
 * changing the large OsirisMap component. The Deck.gl Aeris overlay subscribes
 * to this registry and mounts itself as a normal MapLibre control.
 */
export function installOsirisMapRegistry() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const proto = (maplibregl.Map as unknown as { prototype?: any }).prototype;
  if (!proto || proto.__osirisRegistryPatched) return;

  const originalOn = proto.on;
  proto.on = function osirisPatchedOn(this: maplibregl.Map, ...args: any[]) {
    captureMap(this);
    return originalOn.apply(this, args);
  };

  Object.defineProperty(proto, '__osirisRegistryPatched', {
    value: true,
    configurable: false,
    enumerable: false,
  });
}

export function subscribeOsirisMap(listener: MapListener) {
  listeners.add(listener);
  listener(activeMap);
  return () => {
    listeners.delete(listener);
  };
}

export function getOsirisMap() {
  return activeMap;
}
