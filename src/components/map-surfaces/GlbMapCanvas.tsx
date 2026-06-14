'use client';

import { useMemo } from 'react';

type TacticalPoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  layer: string;
  tone: 'cyan' | 'gold' | 'red' | 'green';
};

type GlbMapCanvasProps = {
  activeLayers?: Record<string, boolean>;
  className?: string;
};

const tacticalPoints: TacticalPoint[] = [
  { id: 'sea-mesh', label: 'SEA MESH', lat: 36.5, lng: -40, layer: 'sdk_sea', tone: 'cyan' },
  { id: 'cctv-london', label: 'CCTV', lat: 51.5, lng: -0.1, layer: 'cctv', tone: 'green' },
  { id: 'sigint-black-sea', label: 'SIGINT', lat: 48.8, lng: 31.2, layer: 'global_incidents', tone: 'red' },
  { id: 'satcom-taiwan', label: 'SATCOM', lat: 24, lng: 119.5, layer: 'satellites', tone: 'gold' },
  { id: 'maritime-singapore', label: 'MARITIME', lat: 1.3, lng: 104, layer: 'maritime', tone: 'cyan' },
  { id: 'alert-gaza', label: 'ALERT', lat: 31.3, lng: 34.3, layer: 'war_alerts', tone: 'red' },
  { id: 'quake-pacific', label: 'SEISMIC', lat: 38, lng: 142, layer: 'earthquakes', tone: 'gold' },
  { id: 'news-europe', label: 'LIVE NEWS', lat: 48.8, lng: 2.3, layer: 'live_news', tone: 'green' },
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

export default function GlbMapCanvas({ activeLayers = {}, className = '' }: GlbMapCanvasProps) {
  const projected = useMemo(() => {
    const selected = tacticalPoints.filter(point => activeLayers[point.layer] !== false);
    return selected.map(point => ({ ...point, ...projectPoint(point.lat, point.lng) }));
  }, [activeLayers]);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-[#02040a] ${className}`}>
      <style>{`
        @keyframes osiris-glb-spin { from { transform: rotateY(0deg) rotateX(8deg); } to { transform: rotateY(360deg) rotateX(8deg); } }
        @keyframes osiris-glb-scan { 0% { transform: rotate(0deg); opacity: 0.2; } 50% { opacity: 0.75; } 100% { transform: rotate(360deg); opacity: 0.2; } }
        @keyframes osiris-glb-pulse { 0%, 100% { transform: scale(1); opacity: 0.75; } 50% { transform: scale(1.8); opacity: 0.15; } }
        @keyframes osiris-glb-grid { from { background-position: 0 0; } to { background-position: 44px 44px; } }
      `}</style>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,229,255,0.16),transparent_34%),linear-gradient(120deg,rgba(0,229,255,0.05),transparent_40%,rgba(212,175,55,0.04))]" />
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          animation: 'osiris-glb-grid 22s linear infinite',
          backgroundImage: 'linear-gradient(rgba(0,229,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,.35) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_46%,rgba(0,0,0,.68)_100%)]" />

      <div className="absolute inset-0 flex items-center justify-center pt-10">
        <div className="relative h-[min(76vw,690px)] w-[min(76vw,690px)] rounded-full border border-[#00e5ff]/20 bg-black/20 shadow-[0_0_90px_rgba(0,229,255,.16)]">
          <div className="absolute inset-[8%] rounded-full border border-[#d4af37]/20" style={{ animation: 'osiris-glb-scan 14s linear infinite' }} />
          <div className="absolute inset-[14%] rounded-full border border-[#00e5ff]/15" style={{ animation: 'osiris-glb-scan 22s linear infinite reverse' }} />
          <div className="absolute inset-[22%] rounded-full border border-white/10" />
          <div className="absolute left-1/2 top-1/2 h-[86%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d4af37]/10" />

          <div
            className="absolute inset-[15%] rounded-full border border-[#00e5ff]/30 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.24),transparent_18%),radial-gradient(circle_at_60%_60%,rgba(0,229,255,.22),transparent_42%),linear-gradient(140deg,#07101f,#02040a_52%,#0c1022)] shadow-[inset_-36px_-22px_70px_rgba(0,0,0,.72),inset_18px_12px_38px_rgba(0,229,255,.11),0_0_70px_rgba(0,229,255,.25)]"
            style={{ animation: 'osiris-glb-spin 48s linear infinite', transformStyle: 'preserve-3d' }}
          >
            <div className="absolute inset-0 rounded-full opacity-40" style={{ backgroundImage: 'linear-gradient(90deg, transparent 48%, rgba(0,229,255,.25) 49%, transparent 50%), repeating-linear-gradient(0deg, transparent 0 8%, rgba(212,175,55,.14) 8.3%, transparent 8.8%)' }} />
            <div className="absolute left-[18%] top-[28%] h-[28%] w-[22%] rounded-[55%_45%_58%_42%] bg-[#122c35]/70 blur-[1px]" />
            <div className="absolute left-[49%] top-[20%] h-[35%] w-[24%] rounded-[45%_55%_50%_50%] bg-[#17372e]/70 blur-[1px]" />
            <div className="absolute left-[40%] top-[58%] h-[18%] w-[36%] rounded-[50%] bg-[#2a2415]/60 blur-[1px]" />
          </div>

          {projected.map(point => (
            <div key={point.id} className="absolute z-10" style={{ left: `${point.x}%`, top: `${point.y}%`, color: toneColor[point.tone] }}>
              <span className="absolute -left-2 -top-2 block h-4 w-4 rounded-full border" style={{ borderColor: toneColor[point.tone], boxShadow: `0 0 18px ${toneColor[point.tone]}` }} />
              <span className="absolute -left-2 -top-2 block h-4 w-4 rounded-full bg-current" style={{ animation: 'osiris-glb-pulse 2.4s ease-in-out infinite' }} />
              <span className="absolute left-4 top-[-9px] whitespace-nowrap rounded border border-current/40 bg-black/70 px-2 py-1 text-[9px] uppercase tracking-[0.18em]">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-5 right-5 rounded-xl border border-[#00e5ff]/20 bg-black/60 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-[#8fb8c8] backdrop-blur-xl max-sm:hidden">
        GLB tactical surface · {projected.length} active nodes
      </div>
    </div>
  );
}
