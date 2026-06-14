'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Activity, Database, Globe2, Layers, MapPinned, Moon, Radar, Satellite } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';

const OsirisMap = dynamic(() => import('@/components/OsirisMap'), { ssr: false });
const GlbMapCanvas = dynamic(() => import('@/components/map-surfaces/GlbMapCanvas'), { ssr: false });

type CommandMapMode = 'mercator' | 'globe' | 'glb';
type CommandMapStyle = 'dark' | 'satellite';

type OsirisCommandDashboardProps = {
  routeLabel?: string;
};

const satelliteStyle = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const layerOrder = [
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
  const [mapMode, setMapMode] = useState<CommandMapMode>('glb');
  const [mapStyle, setMapStyle] = useState<CommandMapStyle>('dark');
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    maritime: true,
    cctv: true,
    live_news: true,
    earthquakes: true,
    global_incidents: true,
    satellites: false,
    war_alerts: false,
    sdk_sea: true,
  });

  const activeCount = useMemo(() => Object.values(activeLayers).filter(Boolean).length, [activeLayers]);
  const data = useMemo(() => ({}), []);
  const projection = mapMode === 'mercator' ? 'mercator' : 'globe';

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02040a] text-[#e8e6e0]">
      <ErrorBoundary name="OSIRIS map surface">
        {mapMode === 'glb' ? (
          <GlbMapCanvas activeLayers={activeLayers} />
        ) : (
          <OsirisMap
            data={data}
            activeLayers={activeLayers}
            projection={projection}
            mapStyle={mapStyle === 'satellite' ? satelliteStyle : 'dark'}
            demoMode={false}
            theme="core"
          />
        )}
      </ErrorBoundary>

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
          <span>Mode: <b className="text-[#d4af37]">{mapMode.toUpperCase()}</b></span>
          <span>Feeds: <b className="text-[#00e5ff]">{activeCount}</b></span>
          <span className="text-[#00e676]">Stable entry</span>
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

      <aside className="absolute right-4 top-24 z-[220] w-[305px] rounded-xl border border-[#d4af37]/20 bg-black/55 p-4 backdrop-blur-xl max-lg:hidden">
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[#d4af37]">
          <Database size={14} /> Fixed load path
        </div>
        <p className="text-xs leading-5 text-[#b9cbd1]">
          OSIRIS now starts on the stable GLB tactical surface instead of the old heavy global MapLibre load path. The 2D, globe, and satellite engines are still available from the bottom control stack.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#8fb8c8]">
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">No IP fly-to</span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">No API preload</span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">Stable shell</span>
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">GLB default</span>
        </div>
      </aside>

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
          onClick={() => setMapStyle(style => (style === 'dark' ? 'satellite' : 'dark'))}
          className={`rounded-lg p-3 transition ${mapStyle === 'satellite' ? 'bg-[#00e676]/15 text-[#00e676]' : 'text-[#8fb8c8] hover:bg-white/10'}`}
          title={mapStyle === 'dark' ? 'Satellite view' : 'Night mode'}
        >
          {mapStyle === 'dark' ? <Satellite className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </nav>

      <footer className="absolute bottom-5 right-5 z-[220] flex items-center gap-2 rounded-xl border border-[#00e5ff]/20 bg-black/60 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8fb8c8] backdrop-blur-xl max-sm:hidden">
        <Activity size={14} className="text-[#00e676]" /> OSIRIS entry · {routeLabel}
      </footer>
    </main>
  );
}
