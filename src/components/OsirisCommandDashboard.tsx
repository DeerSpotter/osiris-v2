'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Activity, Database, Globe2, Home, Layers, MapPinned, Moon, Radar, RefreshCcw, Satellite, X } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAerisFlightFeed } from '@/hooks/useAerisFlightFeed';
import { installOsirisMapRegistry } from '@/lib/osirisMapRegistry';

const OsirisMap = dynamic(() => import('@/components/OsirisMap'), { ssr: false });
const GlbMapCanvas = dynamic(() => import('@/components/map-surfaces/GlbMapCanvas'), { ssr: false });
const AerisDeckFlightOverlay = dynamic(() => import('@/components/aeris/AerisDeckFlightOverlay'), { ssr: false });

if (typeof window !== 'undefined') {
  installOsirisMapRegistry();
}

type CommandMapMode = 'mercator' | 'globe' | 'glb';
type CommandMapStyle = 'dark' | 'satellite';

type OsirisCommandDashboardProps = {
  routeLabel?: string;
};

const satelliteStyle = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const layerOrder = [
  ['aeris_deck', 'Aeris Deck.gl'],
  ['flights', 'Live flights'],
  ['private', 'Private aircraft'],
  ['jets', 'Business jets'],
  ['military', 'Military aircraft'],
  ['gps_jamming', 'GPS anomalies'],
  ['maritime', 'Maritime mesh'],
  ['cctv', 'CCTV nodes'],
  ['live_news', 'Live news'],
  ['earthquakes', 'Seismic'],
  ['global_incidents', 'Incidents'],
  ['satellites', 'Satcom'],
  ['war_alerts', 'War alerts'],
  ['sdk_sea', 'SDK sea'],
] as const;

export default function OsirisCommandDashboard({ routeLabel = '/' }: OsirisCommandDashboardProps) {
  const [mapMode, setMapMode] = useState<CommandMapMode>('globe');
  const [mapStyle, setMapStyle] = useState<CommandMapStyle>('dark');
  const [aerisMode, setAerisMode] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    aeris_deck: false,
    flights: true,
    private: true,
    jets: true,
    military: true,
    gps_jamming: true,
    maritime: true,
    cctv: true,
    live_news: true,
    earthquakes: true,
    global_incidents: true,
    satellites: false,
    war_alerts: false,
    sdk_sea: true,
  });

  const flightLayerEnabled = Boolean(activeLayers.flights || activeLayers.private || activeLayers.jets || activeLayers.military);
  const flightFeed = useAerisFlightFeed(flightLayerEnabled || aerisMode);
  const activeCount = useMemo(() => Object.values(activeLayers).filter(Boolean).length, [activeLayers]);
  const data = useMemo(() => flightFeed.data, [flightFeed.data]);
  const projection = mapMode === 'mercator' ? 'mercator' : 'globe';
  const deckOverlayEnabled = aerisMode && mapMode !== 'glb' && activeLayers.aeris_deck !== false && flightLayerEnabled;
  const mapLayerState = useMemo(
    () => deckOverlayEnabled
      ? { ...activeLayers, flights: false, private: false, jets: false, military: false }
      : activeLayers,
    [activeLayers, deckOverlayEnabled],
  );
  const flightStatus = flightFeed.error ? 'Feed error' : flightFeed.loading ? 'Updating' : 'Live';
  const flightUpdated = flightFeed.lastUpdated
    ? new Date(flightFeed.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'pending';

  const refreshAircraft = () => {
    void flightFeed.refresh();
  };

  const launchAerisMode = () => {
    if (mapMode === 'glb') setMapMode('globe');
    setAerisMode(true);
    setActiveLayers(prev => ({
      ...prev,
      aeris_deck: true,
      flights: true,
      private: true,
      jets: true,
      military: true,
    }));
  };

  const exitAerisMode = () => {
    setAerisMode(false);
    setActiveLayers(prev => ({ ...prev, aeris_deck: false }));
  };

  const toggleAerisMode = () => {
    if (aerisMode) {
      exitAerisMode();
    } else {
      launchAerisMode();
    }
  };

  const toggleAerisDeckOnly = () => {
    if (!aerisMode) launchAerisMode();
    setActiveLayers(prev => ({ ...prev, aeris_deck: !prev.aeris_deck }));
  };

  const goHome = () => {
    if (typeof window === 'undefined') return;

    const ghPagesBase = '/osiris-v2';
    const { origin, pathname } = window.location;
    const homePath = pathname === ghPagesBase || pathname.startsWith(`${ghPagesBase}/`)
      ? `${ghPagesBase}/`
      : '/';

    window.location.assign(`${origin}${homePath}`);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02040a] text-[#e8e6e0]">
      <ErrorBoundary name="OSIRIS map surface">
        {mapMode === 'glb' ? (
          <GlbMapCanvas activeLayers={activeLayers} />
        ) : (
          <OsirisMap
            data={data}
            activeLayers={mapLayerState}
            projection={projection}
            mapStyle={mapStyle === 'satellite' ? satelliteStyle : 'dark'}
            demoMode={false}
            theme="core"
          />
        )}
      </ErrorBoundary>

      {mapMode !== 'glb' && (
        <ErrorBoundary name="Aeris aircraft overlay">
          <AerisDeckFlightOverlay
            data={data}
            activeLayers={activeLayers}
            enabled={deckOverlayEnabled}
            projection={projection}
          />
        </ErrorBoundary>
      )}

      <div className="pointer-events-none absolute inset-0 z-[120] bg-[radial-gradient(circle_at_center,transparent_0%,transparent_52%,rgba(0,0,0,.72)_100%)]" />

      <header className="pointer-events-none absolute left-4 right-4 top-4 z-[220] flex items-center justify-between rounded-xl border border-[#d4af37]/25 bg-black/60 px-4 py-3 shadow-[0_0_28px_rgba(0,229,255,.08)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#d4af37]">
            <Globe2 size={22} />
          </div>
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.42em] text-[#d4af37]">OSIRIS</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#00e5ff]/80">Global intelligence command</div>
          </div>
        </div>
        <div className="hidden items-center gap-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8fb8c8] md:flex">
          <span>Mode: <b className="text-[#d4af37]">{aerisMode ? 'AERIS' : mapMode.toUpperCase()}</b></span>
          <span>Feeds: <b className="text-[#00e5ff]">{activeCount}</b></span>
          <span>Flights: <b className="text-[#00e676]">{flightFeed.total}</b></span>
          <span className={deckOverlayEnabled ? 'text-[#00e676]' : 'text-[#d4af37]'}>{deckOverlayEnabled ? 'Aeris deck' : 'Native map'}</span>
        </div>
      </header>

      <aside className="absolute left-4 top-24 z-[220] w-[285px] rounded-xl border border-[#00e5ff]/20 bg-black/55 p-4 backdrop-blur-xl max-md:hidden">
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[#00e5ff]">
          <Layers size={14} /> Layer stack
        </div>
        <div className="space-y-2">
          {layerOrder.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveLayers(prev => ({ ...prev, [key]: !prev[key] }))}
              className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-[#d7edf4] transition hover:border-[#00e5ff]/30"
            >
              <span>{label}</span>
              <span className={activeLayers[key] ? 'text-[#00e676]' : 'text-[#7a8790]'}>{activeLayers[key] ? 'ON' : 'OFF'}</span>
            </button>
          ))}
        </div>
      </aside>

      {!aerisMode && (
        <aside className="absolute right-4 top-24 z-[220] w-[305px] rounded-xl border border-[#d4af37]/20 bg-black/55 p-4 backdrop-blur-xl max-lg:hidden">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[#d4af37]">
            <Database size={14} /> Aeris standby
          </div>
          <p className="text-xs leading-5 text-[#b9cbd1]">
            Press Aeris to open the aircraft command view. The map stays online first, then Aeris Deck.gl can attach as an overlay.
          </p>
          <button
            onClick={launchAerisMode}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#d4af37]/25 bg-[#d4af37]/10 px-3 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#e8e6e0] transition hover:border-[#d4af37]/50"
          >
            <Database size={14} /> Launch Aeris
          </button>
        </aside>
      )}

      {aerisMode && (
        <section className="absolute left-3 right-3 top-20 z-[245] rounded-xl border border-[#d4af37]/25 bg-black/75 p-3 shadow-[0_0_34px_rgba(212,175,55,.12)] backdrop-blur-xl lg:left-auto lg:right-4 lg:top-24 lg:w-[330px] lg:p-4">
          <div className="mb-3 flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[#d4af37]">
            <span className="flex items-center gap-2"><Database size={14} /> Aeris mode</span>
            <button onClick={exitAerisMode} className="rounded-md border border-white/10 p-1 text-[#8fb8c8] transition hover:bg-white/10" title="Close Aeris mode">
              <X size={14} />
            </button>
          </div>
          <div className="mb-3 rounded-lg border border-[#00e676]/20 bg-[#00e676]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#00e676]">
            Aeris launched · {deckOverlayEnabled ? 'Deck overlay active' : 'Native aircraft fallback'}
          </div>
          <p className="text-xs leading-5 text-[#b9cbd1] max-lg:hidden">
            Live ADS-B aircraft view with altitude coloring, trails, labels, and click popups. If Deck.gl fails, this panel stays open and native aircraft rendering remains available.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8fb8c8] lg:mt-4">
            <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">Status: <b className={flightFeed.error ? 'text-[#ff3d3d]' : 'text-[#00e676]'}>{flightStatus}</b></span>
            <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">Updated: <b className="text-[#d4af37]">{flightUpdated}</b></span>
            <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">Aircraft: <b className="text-[#00e5ff]">{flightFeed.total}</b></span>
            <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">Render: <b className={deckOverlayEnabled ? 'text-[#00e676]' : 'text-[#d4af37]'}>{deckOverlayEnabled ? 'Deck.gl' : 'MapLibre'}</b></span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[9px] uppercase tracking-[0.16em]">
            <button
              onClick={toggleAerisDeckOnly}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 transition ${deckOverlayEnabled ? 'border-[#00e676]/30 bg-[#00e676]/10 text-[#00e676]' : 'border-[#d4af37]/25 bg-[#d4af37]/10 text-[#e8e6e0] hover:border-[#d4af37]/50'}`}
              title="Toggle Aeris Deck.gl aircraft overlay"
            >
              <Database size={13} /> Deck
            </button>
            <button
              onClick={refreshAircraft}
              disabled={!flightLayerEnabled}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#00e5ff]/20 bg-[#00e5ff]/10 px-3 py-2 text-[#d7edf4] transition hover:border-[#00e5ff]/45 disabled:cursor-not-allowed disabled:opacity-45"
              title="Refresh aircraft positions now"
            >
              <RefreshCcw size={13} className={flightFeed.loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              onClick={goHome}
              className="flex items-center justify-center gap-2 rounded-lg border border-[#d4af37]/25 bg-[#d4af37]/10 px-3 py-2 text-[#e8e6e0] transition hover:border-[#d4af37]/50"
              title="Exit to OSIRIS home"
            >
              <Home size={13} /> Home
            </button>
          </div>
          {flightFeed.error && (
            <p className="mt-3 rounded border border-[#ff3d3d]/30 bg-[#ff3d3d]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ff9a9a]">
              {flightFeed.error}
            </p>
          )}
        </section>
      )}

      <nav className="absolute bottom-[75px] left-3 z-[230] flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 p-2 backdrop-blur-xl md:bottom-6 md:left-[315px]">
        <button
          onClick={() => setMapMode('mercator')}
          className={`group relative rounded-lg p-3 transition ${mapMode === 'mercator' ? 'bg-[#00e5ff]/15 text-[#00e5ff]' : 'text-[#8fb8c8] hover:bg-white/10'}`}
          title="2D MapLibre map"
        >
          <MapPinned className="h-5 w-5" />
        </button>
        <button
          onClick={() => setMapMode('globe')}
          className={`group relative rounded-lg p-3 transition ${mapMode === 'globe' ? 'bg-[#d4af37]/15 text-[#d4af37]' : 'text-[#8fb8c8] hover:bg-white/10'}`}
          title="MapLibre globe"
        >
          <Globe2 className="h-5 w-5" />
        </button>
        <button
          onClick={() => setMapMode('glb')}
          className={`group relative rounded-lg p-3 transition ${mapMode === 'glb' ? 'bg-[#d4af37]/15 text-[#d4af37]' : 'text-[#8fb8c8] hover:bg-white/10'}`}
          title="GLB tactical view"
        >
          <Radar className="h-5 w-5" />
        </button>
        <div className="h-7 w-px bg-white/10" />
        <button
          onClick={toggleAerisMode}
          className={`rounded-lg p-3 transition ${aerisMode ? 'bg-[#00e676]/15 text-[#00e676]' : 'text-[#8fb8c8] hover:bg-white/10'}`}
          title={aerisMode ? 'Close Aeris mode' : 'Launch Aeris mode'}
        >
          <Database className="h-5 w-5" />
        </button>
        <button
          onClick={() => setMapStyle(style => (style === 'dark' ? 'satellite' : 'dark'))}
          className={`rounded-lg p-3 transition ${mapStyle === 'satellite' ? 'bg-[#00e676]/15 text-[#00e676]' : 'text-[#8fb8c8] hover:bg-white/10'}`}
          title={mapStyle === 'dark' ? 'Satellite view' : 'Night mode'}
        >
          {mapStyle === 'dark' ? <Satellite className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button
          onClick={refreshAircraft}
          disabled={!flightLayerEnabled}
          className={`rounded-lg p-3 transition ${flightFeed.loading ? 'bg-[#00e5ff]/15 text-[#00e5ff]' : 'text-[#8fb8c8] hover:bg-white/10'} disabled:cursor-not-allowed disabled:opacity-45`}
          title="Refresh aircraft positions"
        >
          <RefreshCcw className={`h-5 w-5 ${flightFeed.loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={goHome}
          className="rounded-lg p-3 text-[#8fb8c8] transition hover:bg-white/10"
          title="Exit to OSIRIS home"
        >
          <Home className="h-5 w-5" />
        </button>
      </nav>

      <footer className="absolute bottom-5 right-5 z-[220] flex items-center gap-2 rounded-xl border border-[#00e5ff]/20 bg-black/60 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8fb8c8] backdrop-blur-xl max-sm:hidden">
        <Activity size={14} className="text-[#00e676]" /> OSIRIS entry · {routeLabel}
      </footer>
    </main>
  );
}
