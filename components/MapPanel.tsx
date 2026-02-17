'use client';

import { Calendar, House, Siren } from 'lucide-react';
import { useTrip, TAG_COLORS, getTagIconComponent } from '@/components/providers/TripProvider';
import { formatTag } from '@/lib/helpers';
import StatusBar from '@/components/StatusBar';

const EVENT_COLOR = '#ea580c';
const HOME_COLOR = '#111827';
const CRIME_COLOR = '#be123c';

function FilterChip({ active, color, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[0.76rem] font-medium rounded-full px-2.5 py-1 transition-all duration-150 cursor-pointer border"
      style={
        active
          ? {
              background: `${color}14`,
              borderColor: `${color}50`,
              color: color,
              boxShadow: `0 0 0 2px ${color}18`,
            }
          : {
              background: 'transparent',
              borderColor: 'var(--color-border)',
              color: 'var(--color-muted)',
              opacity: 0.45,
            }
      }
    >
      <Icon className="w-[14px] h-[14px]" size={14} strokeWidth={2.2} />
      <span className={active ? '' : 'line-through decoration-1'}>{label}</span>
    </button>
  );
}

export default function MapPanel() {
  const { mapPanelRef, mapElementRef, hiddenCategories, toggleCategory } = useTrip();

  return (
    <section className="flex flex-col min-h-0 h-full" ref={mapPanelRef}>
      <div className="flex flex-wrap items-center gap-1.5 bg-card border-b border-border px-4 py-1.5">
        <FilterChip
          active={!hiddenCategories.has('event')}
          color={EVENT_COLOR}
          icon={Calendar}
          label="Event"
          onClick={() => toggleCategory('event')}
        />
        <FilterChip
          active={!hiddenCategories.has('home')}
          color={HOME_COLOR}
          icon={House}
          label="Home"
          onClick={() => toggleCategory('home')}
        />
        <FilterChip
          active={!hiddenCategories.has('crime')}
          color={CRIME_COLOR}
          icon={Siren}
          label="Crime Live"
          onClick={() => toggleCategory('crime')}
        />
        {Object.keys(TAG_COLORS).map((tag) => (
          <FilterChip
            key={tag}
            active={!hiddenCategories.has(tag)}
            color={TAG_COLORS[tag]}
            icon={getTagIconComponent(tag)}
            label={formatTag(tag)}
            onClick={() => toggleCategory(tag)}
          />
        ))}
      </div>
      <div className="relative flex-1 min-h-0 map-container-responsive">
        <div id="map" ref={mapElementRef} />
        <StatusBar />
      </div>
    </section>
  );
}
