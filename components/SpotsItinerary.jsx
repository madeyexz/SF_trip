'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTrip, getTagColor } from '@/components/providers/TripProvider';
import { formatTag, truncate } from '@/lib/helpers';

export default function SpotsItinerary() {
  const {
    visiblePlaces, placeTagFilter, setPlaceTagFilter,
    placeTagOptions, addPlaceToDayPlan
  } = useTrip();

  return (
    <div className="flex flex-col p-3 overflow-y-auto min-h-0 scrollbar-thin">
      <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight">Curated Spots</h2>
          <div className="flex gap-1.5 items-center mt-1">
            <ToggleGroup
              className="flex flex-nowrap overflow-x-auto gap-1.5 scrollbar-none"
              type="single"
              value={placeTagFilter}
              onValueChange={(v) => { if (v) setPlaceTagFilter(v); }}
            >
              {placeTagOptions.map((tag) => (
                <ToggleGroupItem key={tag} className="shrink-0 px-3 py-1 text-[0.8rem] font-medium rounded-full" value={tag}>{formatTag(tag)}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-subtle text-muted text-[0.7rem] font-semibold whitespace-nowrap">{visiblePlaces.length} places</span>
      </div>
      <div className="flex flex-col gap-2">
        {visiblePlaces.length === 0 ? (
          <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-[10px] border border-dashed border-border">No curated places in this category.</p>
        ) : (
          visiblePlaces.map((place) => (
            <Card className="p-3.5 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)]" key={place.id || `${place.name}-${place.location}`}>
              <div className="flex gap-2 justify-between items-start">
                <h3 className="m-0 mb-1.5 text-[0.92rem] font-semibold leading-snug">{place.name}</h3>
                <Badge className="uppercase tracking-wider shrink-0" variant="secondary" style={{ backgroundColor: `${getTagColor(place.tag)}22`, color: getTagColor(place.tag) }}>{formatTag(place.tag)}</Badge>
              </div>
              <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Location:</strong> {place.location}</p>
              {place.curatorComment ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Curator note:</strong> {place.curatorComment}</p> : null}
              {place.description ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{truncate(place.description, 180)}</p> : null}
              {place.details ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{truncate(place.details, 220)}</p> : null}
              <Button type="button" size="sm" variant="secondary" onClick={() => addPlaceToDayPlan(place)}>Add to day</Button>
              <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed flex flex-wrap gap-3">
                <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={place.mapLink} target="_blank" rel="noreferrer">Open map</a>
                <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={place.cornerLink} target="_blank" rel="noreferrer">Corner page</a>
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
