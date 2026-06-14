'use client';

import { useMemo, useState } from 'react';
import { Globe2, Layers, Radar, Satellite, ShieldAlert } from 'lucide-react';

type TacticalPoint = {
  label: string;
  lat: number;
  lng: number;
  tone: 'cyan' | 'gold' | 'red' | 'green';
};

const points: TacticalPoint[] = [
  { label: 'SEA MESH', lat: 36.5, lng: -40, tone: 'cyan' },
  { label: 'CCTV', lat: 51.5, lng: -0.1, tone: 'green' },
  { label: 'SIGINT', lat: 48.8, lng: 31.2, tone: 'red' },
  { label: 'SATCOM', lat: 24, lng: 119.5, tone: 'gold' },
  { label: 'MARITIME', lat: 1.3, lng: 104, tone: 'cyan' },
  { label: 'ALERT', lat: 31.3, lng: 34.3, tone: 'red' },
];

const toneColor: Record<TacticalPoint['tone'], string> = {
  cyan: '#00e5ff',
  gold: '#d4af37',
  red: '#ff3d3d',
  green: '#00e676',
};

function projectPoint(lat: number, lng: number) {
  const x = 50 + (lng / 180) * 33;
  const y = 50 - (lat / 90) * 31;
  return { x, y };
}

export default function GlbTacticalSurface() {
  const [mode, setMode] = useState<'glb' | 'map'>('glb');
  const projected = useMemo(() => points.map(point => ({ ...point, ...projectPoint(point.lat, point.lng) })), []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02040a] text-[#e8e6e0]">
      <style>{`
        @keyframes osiris-globe-spin { from { transform: rotateY(0deg) rotateX(8deg); } to { transform: rotateY(360deg) rotateX(8deg); } }
        @keyframes osiris-scan { 0% { transform: rotate(0deg); opacity: 0.2; } 50% { opacity: 0.75; } 100% { transform: rotate(360deg); opacity: 0.2; } }
        @keyframes osiris-pulse { 0%, 100% { transform: scale(1); opacity: 0.75; } 50% { transform: scale(1.8); opacity: 0.15; } }
      `}</style>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,229,255,0.12),transparent_34%),linear-gradient(120deg,rgba(0,229,255,0.05),transparent_40%,rgba(212,175,55,0.04))]" />
      <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(rgba(0,229,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.35) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

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
          <span>Nodes: {projected.length}</span>
          <span className="text-[#00e676]">Static Pages Safe</span>
        </div>
      </header>

      <section className="absolute left-4 top-24 z-20 w-[280px] rounded-xl border border-[#00e5ff]/20 bg-black/55 p-4 backdrop-blur-xl max-md:hidden">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.26em] text-[#00e5ff]">
          <Layers size={14} /> Layer stack
        </div>
        {['Base GLB shell', 'OSIRIS data nodes', 'Orbit rings', 'Threat pulses', 'Live shell controls'].map((item, index) => (
          <div key={item} className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[#d7edf4]">
            <span>{item}</span>
            <span className={index < 4 ? 'text-[#00e676]' : 'text-[#d4af37]'}>{index < 4 ? 'ON' : 'READY'}</span>
          </div>
        ))}
      </section>

      <section className="absolute right-4 top-24 z-20 w-[300px] rounded-xl border border-[#d4af37]/20 bg-black/55 p-4 backdrop-blur-xl max-lg:hidden">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.26em] text-[#d4af37]">
          <ShieldAlert size={14} /> Live site parity target
        </div>
        <p className="text-xs leading-5 text-[#b9cbd1]">
          This surface keeps the OSIRIS live shell feel while isolating the map engine. The next step is wiring this behind the existing 2D/globe control so MapLibre and GLB can switch without replacing the dashboard.
        </p>
      </section>

      <div className="absolute inset-0 flex items-center justify-center pt-10">
        <div className="relative h-[min(76vw,680px)] w-[min(76vw,680px)] rounded-full border border-[#00e5ff]/20 bg-black/20 shadow-[0_0_90px_rgba(0,229,255,.16)]">
          <div className="absolute inset-[8%] rounded-full border border-[#d4af37]/20" style={{ animation: 'osiris-scan 14s linear infinite' }} />
          <div className="absolute inset-[14%] rounded-full border border-[#00e5ff]/15" style={{ animation: 'osiris-scan 22s linear infinite reverse' }} />
          <div className="absolute inset-[22%] rounded-full border border-white/10" />

          <div className="absolute inset-[15%] rounded-full border border-[#00e5ff]/30 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.24),transparent_18%),radial-gradient(circle_at_60%_60%,rgba(0,229,255,.22),transparent_42%),linear-gradient(140deg,#07101f,#02040a_52%,#0c1022)] shadow-[inset_-36px_-22px_70px_rgba(0,0,0,.72),inset_18px_12px_38px_rgba(0,229,255,.11),0_0_70px_rgba(0,229,255,.25)]" style={{ animation: 'osiris-globe-spin 48s linear infinite', transformStyle: 'preserve-3d' }}>
            <div className="absolute inset-0 rounded-full opacity-40" style={{ backgroundImage: 'linear-gradient(90deg, transparent 48%, rgba(0,229,255,.25) 49%, transparent 50%), repeating-linear-gradient(0deg, transparent 0 8%, rgba(212,175,55,.14) 8.3%, transparent 8.8%)' }} />
            <div className="absolute left-[18%] top-[28%] h-[28%] w-[22%] rounded-[55%_45%_58%_42%] bg-[#122c35]/70 blur-[1px]" />
            <div className="absolute left-[49%] top-[20%] h-[35%] w-[24%] rounded-[45%_55%_50%_50%] bg-[#17372e]/70 blur-[1px]" />
            <div className="absolute left-[40%] top-[58%] h-[18%] w-[36%] rounded-[50%] bg-[#2a2415]/60 blur-[1px]" />
          </div>

          {projected.map(point => (
            <div key={point.label} className="absolute z-10" style={{ left: `${point.x}%`, top: `${point.y}%`, color: toneColor[point.tone] }}>
              <span className="absolute -left-2 -top-2 block h-4 w-4 rounded-full border" style={{ borderColor: toneColor[point.tone], boxShadow: `0 0 18px ${toneColor[point.tone]}` }} />
              <span className="absolute -left-2 -top-2 block h-4 w-4 rounded-full bg-current" style={{ animation: 'osiris-pulse 2.4s ease-in-out infinite' }} />
              <span className="absolute left-4 top-[-9px] whitespace-nowrap rounded border border-current/40 bg-black/70 px-2 py-1 text-[9px] uppercase tracking-[0.18em]">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </div>

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
