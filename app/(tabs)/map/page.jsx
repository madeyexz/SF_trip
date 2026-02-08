'use client';

import MapPanel from '@/components/MapPanel';

export default function MapPage() {
  return (
    <section className="min-h-0 flex-1 grid grid-cols-1 items-stretch">
      <MapPanel />
    </section>
  );
}
