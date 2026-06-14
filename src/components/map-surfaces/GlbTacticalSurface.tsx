'use client';

import { useMemo, useState } from 'react';
import { Globe2, Layers, Radar, Satellite, ShieldAlert } from 'lucide-react';
import GlbMapCanvas from './GlbMapCanvas';

const previewLayers = [
  ['sdk_sea', 'Base GLB shell'],
  ['maritime', 'OSIRIS data nodes'],
  ['earthquakes', 'Orbit rings'],
  ['global_incidents', 'Threat pulses'],
  ['live_news', 'Live shell controls'],
] as const;

export default function GlbTacticalSurface() {
  const [mode, setMode] = useState<'glb' | 'map'>('glb');
  const activeLayers = useMemo(() => ({
    sdk_sea: true,
    maritime: true,
    cctv: true,
    live_news: true,
    earthquakes: true,
    global_incidents: true,
    satellites: true,
    war_alerts: true,
  }), []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02040a] text-[#e8e6e0]">
      <GlbMapCanvas activeLayers={activeLayers} />

      <header className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between rounded-xl border border-[#d4af37]/25 bg-black/60 px-4 py-3 shadow-[0_0_28px_rgba(0,229,255,.08)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#d4af37]">
            <Globe2 size={22} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.42em] text-[#d4af37]">OSIRIS</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#00e5ff]/80">3D tactical surface · GLB ready</div>
          </div>
        </div>
        <div className="hidden items-center gap-4 text-[10px] uppercase tracking-[0.22em] text-[#8fb8c8] md:flex">
          <span>Projection: 3D</span>
          <span>Nodes: 8</span>
          <span className="text-[#00e676]">Static Pages Safe</span>
        </div>
      </header>

      <section className="absolute left-4 top-24 z-20 w-[280px] rounded-xl border border-[#00e5ff]/20 bg-black/55 p-4 backdrop-blur-xl max-md:hidden">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.26em] text-[#00e5ff]">
          <Layers size={14} /> Layer stack
        </div>
        {previewLayers.map(([key, label], index) => (
          <div key={key} className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[#d7edf4]">
            <span>{label}</span>
            <span className={index < 4 ? 'text-[#00e676]' : 'text-[#d4af37]'}>{index < 4 ? 'ON' : 'READY'}</span>
          </div>
        ))}
      </section>

      <section className="absolute right-4 top-24 z-20 w-[300px] rounded-xl border border-[#d4af37]/20 bg-black/55 p-4 backdrop-blur-xl max-lg:hidden">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.26em] text-[#d4af37]">
          <ShieldAlert size={14} /> Live site parity target
        </div>
        <p className="text-xs leading-5 text-[#b9cbd1]">
          This surface keeps the OSIRIS live shell feel while isolating the map engine. The shared GLB canvas can now sit under either this preview page or the new command shell.
        </p>
      </section>

      <div className="absolute bottom-5 left-5 z-20 flex gap-2 rounded-xl border border-white/10 bg-black/60 p-2 backdrop-blur-xl">
        <button onClick={() => setMode('map')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.18em] ${mode === 'map' ? 'bg-[#00e5ff]/15 text-[#00e5ff]' : 'text-[#8fb8c8]'}`}>
          <Radar size={14} /> 2D
        </button>
        <button onClick={() => setMode('glb')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.18em] ${mode === 'glb' ? 'bg-[#d4af37]/15 text-[#d4af37]' : 'text-[#8fb8c8]'}`}>
          <Satellite size={14} /> 3D
        </button>
      </div>

      <footer className="absolute bottom-5 right-5 z-20 rounded-xl border border-[#00e5ff]/20 bg-black/60 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-[#8fb8c8] backdrop-blur-xl max-sm:hidden">
        Engine split ready · GLB asset hook next
      </footer>
    </main>
  );
}
