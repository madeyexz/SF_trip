'use client';

import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTrip, getTagColor } from '@/components/providers/TripProvider';
import { formatDateDayMonth, formatTag, normalizePlaceTag, truncate } from '@/lib/helpers';
import { getSafeExternalHref } from '@/lib/security';

function SpotsItinerarySkeleton() {
  const titleWidths = ['w-3/5', 'w-2/3', 'w-1/2', 'w-3/4'];
  const descWidths = ['w-[85%]', 'w-[70%]', 'w-[78%]', 'w-[65%]'];
  return (
    <div className="flex flex-col p-3 overflow-y-auto min-h-0 scrollbar-thin">
      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div>
          <div className="h-[18px] w-32 bg-border/40 rounded-sm animate-pulse" />
          <div className="flex gap-1.5 mt-1.5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-[28px] w-[60px] bg-border/30 rounded-sm animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        </div>
        <div className="h-5 w-[60px] bg-border/25 rounded-sm animate-pulse" style={{ animationDelay: '100ms' }} />
      </div>
      {/* Card skeletons */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-none border border-border bg-bg-elevated p-3.5" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex gap-2 justify-between items-start mb-1.5">
              <div className={`h-[15px] ${titleWidths[i]} bg-border/50 rounded-sm animate-pulse`} style={{ animationDelay: `${i * 100}ms` }} />
              <div className="h-5 w-[52px] bg-border/25 rounded-sm shrink-0 animate-pulse" style={{ animationDelay: `${i * 100 + 50}ms` }} />
            </div>
            <div className="h-[12px] w-[60%] bg-border/30 rounded-sm mb-1.5 animate-pulse" style={{ animationDelay: `${i * 100 + 100}ms` }} />
            <div className={`h-[12px] ${descWidths[i]} bg-border/30 rounded-sm mb-2.5 animate-pulse`} style={{ animationDelay: `${i * 100 + 150}ms` }} />
            <div className="h-[28px] w-[80px] bg-border/25 rounded-sm animate-pulse" style={{ animationDelay: `${i * 100 + 200}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SpotsItinerary() {
  const {
    visiblePlaces, placeTagFilter, setPlaceTagFilter,
    placeTagOptions, addPlaceToDayPlan, selectedDate, isInitializing
  } = useTrip();

  if (isInitializing) {
    return <SpotsItinerarySkeleton />;
  }

  return (
    <div className="flex flex-col p-3 overflow-y-auto min-h-0 scrollbar-thin">
      <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight">Curated Spots {selectedDate ? `· ${formatDateDayMonth(selectedDate)}` : ''}</h2>
          <div className="flex gap-1.5 items-center mt-1">
            <ToggleGroup
              className="flex flex-nowrap overflow-x-auto gap-1.5 scrollbar-none"
              type="single"
              value={placeTagFilter}
              onValueChange={(v) => { if (v) setPlaceTagFilter(v); }}
            >
              {placeTagOptions.map((tag) => (
                <ToggleGroupItem key={tag} className="shrink-0 px-3 py-1" value={tag}>{formatTag(tag)}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-none bg-bg-subtle text-muted text-[0.7rem] font-semibold whitespace-nowrap">{visiblePlaces.length} places</span>
      </div>
      <div className="flex flex-col gap-2">
        {visiblePlaces.length === 0 ? (
          <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-none border border-dashed border-border">No curated places in this category.</p>
        ) : (
          visiblePlaces.map((place) => (
            (() => {
              const safeMapLink = getSafeExternalHref(place.mapLink);
              const safeCornerLink = getSafeExternalHref(place.cornerLink);
              return (
                <Card className="p-3.5 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)]" key={place.id || `${place.name}-${place.location}`}>
                  <div className="flex gap-2 justify-between items-start">
                    <h3 className="m-0 mb-1.5 text-[0.92rem] font-semibold leading-snug">{place.name}</h3>
                    <Badge className="uppercase tracking-wider shrink-0" variant="secondary" style={{ backgroundColor: `${getTagColor(place.tag)}22`, color: getTagColor(place.tag) }}>{formatTag(place.tag)}</Badge>
                  </div>
                  <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Location:</strong> {place.location}</p>
                  {place.curatorComment ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Curator note:</strong> {place.curatorComment}</p> : null}
                  {place.description ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{truncate(place.description, 180)}</p> : null}
                  {place.details ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{truncate(place.details, 220)}</p> : null}
                  {normalizePlaceTag(place.tag) === 'avoid' ? (
                    <div className="my-1.5 flex flex-col gap-1">
                      <p className="my-0 flex items-center gap-1.5 text-[0.82rem] font-semibold text-[#CC3333]"><TriangleAlert className="w-4 h-4 shrink-0" />{place.risk === 'extreme' ? 'DO NOT VISIT' : place.risk === 'high' ? 'High risk — stay away' : 'Exercise caution'}</p>
                      {place.crimeTypes ? <p className="my-0 text-[0.78rem] text-[#CC3333] font-medium pl-[22px]">{place.crimeTypes}</p> : null}
                    </div>
                  ) : normalizePlaceTag(place.tag) === 'safe' ? (
                    <div className="my-1.5 flex flex-col gap-1">
                      <p className="my-0 flex items-center gap-1.5 text-[0.82rem] font-semibold text-accent"><ShieldCheck className="w-4 h-4 shrink-0" />Safer area</p>
                      <p className="my-0 text-[0.78rem] text-accent font-medium pl-[22px]">{place.safetyLabel || place.safetyHighlights || 'Lower violent-crime profile than city average.'}</p>
                      {place.crimeTypes ? <p className="my-0 text-[0.76rem] text-accent/80 pl-[22px]">Watch for: {place.crimeTypes}</p> : null}
                    </div>
                  ) : (
                    <Button type="button" size="sm" variant="secondary" onClick={() => addPlaceToDayPlan(place)}>Add to day</Button>
                  )}
                  {(safeMapLink || safeCornerLink) ? (
                    <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed flex flex-wrap gap-3">
                      {safeMapLink ? <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={safeMapLink} target="_blank" rel="noreferrer">Open map</a> : null}
                      {safeCornerLink ? <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={safeCornerLink} target="_blank" rel="noreferrer">Corner page</a> : null}
                    </p>
                  ) : null}
                </Card>
              );
            })()
          ))
        )}
      </div>
    </div>
  );
}
