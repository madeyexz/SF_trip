'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTrip } from '@/components/providers/TripProvider';
import { formatDateDayMonth } from '@/lib/helpers';
import { parseEventTimeRange } from '@/lib/planner-helpers';

export default function EventsItinerary() {
  const {
    selectedDate, showAllEvents, setShowAllEvents,
    visibleEvents, travelReadyCount, addEventToDayPlan
  } = useTrip();

  return (
    <div className="flex flex-col p-3 overflow-y-auto min-h-0 scrollbar-thin">
      <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight">Events {selectedDate ? `· ${formatDateDayMonth(selectedDate)}` : ''}</h2>
          <div className="flex gap-1.5 items-center mt-1">
            <ToggleGroup
              className="flex flex-nowrap overflow-x-auto gap-1.5 scrollbar-none"
              type="single"
              value={showAllEvents ? 'all' : 'day'}
              onValueChange={(v) => { if (v === 'all') setShowAllEvents(true); if (v === 'day') setShowAllEvents(false); }}
            >
              <ToggleGroupItem className="shrink-0 min-w-[84px] justify-center px-5 py-1" value="day">Day</ToggleGroupItem>
              <ToggleGroupItem className="shrink-0 min-w-[84px] justify-center px-5 py-1" value="all">All</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="flex gap-1.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-none bg-bg-subtle text-muted text-[0.7rem] font-semibold whitespace-nowrap">{visibleEvents.length} showing</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-none bg-bg-subtle text-muted text-[0.7rem] font-semibold whitespace-nowrap">{travelReadyCount} travel</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {visibleEvents.length === 0 ? (
          <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-none border border-dashed border-border">No events found for this filter.</p>
        ) : (
          visibleEvents.map((event) => {
            const location = event.address || event.locationText || 'Location not listed';
            const time = event.startDateTimeText || 'Time not listed';
            const eventRange = parseEventTimeRange(event.startDateTimeText);
            const hasConflict = eventRange && visibleEvents.some((other) => {
              if (other.eventUrl === event.eventUrl) return false;
              const otherRange = parseEventTimeRange(other.startDateTimeText);
              return otherRange && eventRange.startMinutes < otherRange.endMinutes && eventRange.endMinutes > otherRange.startMinutes;
            });
            return (
              <Card className={`p-3.5 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)] ${hasConflict ? 'border-warning-border bg-warning-light' : ''}`} key={event.eventUrl}>
                <h3 className="m-0 mb-1.5 text-[0.92rem] font-semibold leading-snug">{event.name}</h3>
                <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Time:</strong> {time}</p>
                {hasConflict ? <p className="my-1 text-[0.82rem] text-warning bg-warning-light border border-warning-border rounded-none px-2 py-1 font-semibold flex items-center gap-1.5"><AlertTriangle size={14} className="text-warning shrink-0" /> Time conflict with another event</p> : null}
                <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Location:</strong> {location}</p>
                {event.travelDurationText ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Travel:</strong> {event.travelDurationText}</p> : null}
                <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{event.description || ''}</p>
                <Button type="button" size="sm" variant="secondary" onClick={() => addEventToDayPlan(event)}>Add to day</Button>
                <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={event.eventUrl} target="_blank" rel="noreferrer">Open event</a>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
