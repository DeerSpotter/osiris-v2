import dynamic from 'next/dynamic';

const GlbTacticalSurface = dynamic(() => import('@/components/map-surfaces/GlbTacticalSurface'), {
  ssr: false,
});

export default function GlbPage() {
  return <GlbTacticalSurface />;
}
