'use client';

import { Calendar, House, Siren } from 'lucide-react';
import { useTrip, TAG_COLORS, getTagIconComponent } from '@/components/providers/TripProvider';
import { formatTag } from '@/lib/helpers';
import StatusBar from '@/components/StatusBar';

const EVENT_COLOR = '#ea580c';
const HOME_COLOR = '#111827';
const CRIME_COLOR = '#be123c';

function formatCrimeUpdatedAt(isoTimestamp) {
  if (!isoTimestamp) return 'waiting for first update';
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return 'waiting for first update';
  const deltaMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (deltaMinutes < 1) return 'updated just now';
  if (deltaMinutes < 60) return `updated ${deltaMinutes}m ago`;
  const h = Math.floor(deltaMinutes / 60);
  const m = deltaMinutes % 60;
  return `updated ${h}h ${m}m ago`;
}

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
  const {
    mapPanelRef,
    mapElementRef,
    hiddenCategories,
    toggleCategory,
    crimeLayerMeta,
    crimeHeatmapStrength,
    setCrimeHeatmapStrength,
  } = useTrip();
  const isCrimeVisible = !hiddenCategories.has('crime');
  const crimeStatusText = crimeLayerMeta.loading
    ? 'Updating live crime feed...'
    : crimeLayerMeta.error
      ? `Update failed: ${crimeLayerMeta.error}`
      : `${crimeLayerMeta.count.toLocaleString()} incidents in last 72h · ${formatCrimeUpdatedAt(crimeLayerMeta.generatedAt)}`;

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
          label={isCrimeVisible ? 'Crime Live • ON' : 'Crime Live'}
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
        {isCrimeVisible ? (
          <div className="absolute top-3 right-3 z-20 w-[196px] rounded-lg border border-rose-300/80 bg-white/92 backdrop-blur-sm px-2.5 py-2 shadow-[0_8px_24px_rgba(190,24,93,0.2)]">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-rose-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
                </span>
                CRIME LIVE
              </div>
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-rose-700">ON</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              {[
                { id: 'low', label: '弱' },
                { id: 'medium', label: '中' },
                { id: 'high', label: '強' },
              ].map((level) => (
                <button
                  key={level.id}
                  type="button"
                  onClick={() => setCrimeHeatmapStrength(level.id)}
                  className={`rounded px-1.5 py-0.5 text-[0.6rem] font-semibold border transition-colors ${
                    crimeHeatmapStrength === level.id
                      ? 'bg-rose-100 text-rose-700 border-rose-300'
                      : 'bg-white text-foreground-secondary border-border hover:border-rose-200'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-500 to-rose-900" />
            <p className={`mt-1.5 text-[0.64rem] leading-tight ${crimeLayerMeta.error ? 'text-rose-700 font-semibold' : 'text-foreground-secondary'}`}>
              {crimeStatusText}
            </p>
          </div>
        ) : null}
        <StatusBar />
      </div>
    </section>
  );
}
