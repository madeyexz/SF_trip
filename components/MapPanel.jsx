'use client';

import { Calendar, House } from 'lucide-react';
import { useTrip, TAG_COLORS, getTagIconComponent } from '@/components/providers/TripProvider';
import { formatTag } from '@/lib/helpers';
import StatusBar from '@/components/StatusBar';

export default function MapPanel() {
  const { mapPanelRef, mapElementRef } = useTrip();

  return (
    <section className="flex flex-col min-h-0 h-full" ref={mapPanelRef}>
      <div className="flex flex-wrap gap-x-3 gap-y-1 bg-card border-b border-border px-4 py-1.5">
        <span className="inline-flex items-center gap-1 text-[0.76rem] font-medium text-muted">
          <Calendar className="w-[18px] h-[18px]" size={14} strokeWidth={2} /> Event
        </span>
        <span className="inline-flex items-center gap-1 text-[0.76rem] font-medium text-muted">
          <House className="w-[18px] h-[18px]" size={14} strokeWidth={2} /> Origin
        </span>
        {Object.keys(TAG_COLORS).map((tag) => {
          const TagIcon = getTagIconComponent(tag);
          return (
            <span className="inline-flex items-center gap-1 text-[0.76rem] font-medium text-muted" key={tag}>
              <TagIcon className="w-[18px] h-[18px]" size={14} strokeWidth={2} /> {formatTag(tag)}
            </span>
          );
        })}
      </div>
      <div className="relative flex-1 min-h-0 map-container-responsive">
        <div id="map" ref={mapElementRef} />
        <StatusBar />
      </div>
    </section>
  );
}
