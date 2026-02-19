'use client';

import { useMemo } from 'react';
import { useTrip } from '@/components/providers/TripProvider';
import { formatDateWeekday, formatDateDayMonth } from '@/lib/helpers';

function intensity(count, max) {
  if (max === 0 || count === 0) return 0;
  return Math.min(count / max, 1);
}

export default function DayList() {
  const { uniqueDates, selectedDate, setSelectedDate, setShowAllEvents, eventsByDate, planItemsByDate } = useTrip();

  const { maxEvents, maxPlans } = useMemo(() => {
    let mE = 0;
    let mP = 0;
    for (const d of uniqueDates) {
      mE = Math.max(mE, eventsByDate.get(d) || 0);
      mP = Math.max(mP, planItemsByDate.get(d) || 0);
    }
    return { maxEvents: mE, maxPlans: mP };
  }, [uniqueDates, eventsByDate, planItemsByDate]);

  if (uniqueDates.length === 0) {
    return (
      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
        <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-none border border-dashed border-border">No event dates</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
      {uniqueDates.map((dateISO) => {
        const isActive = dateISO === selectedDate;
        const eventCount = eventsByDate.get(dateISO) || 0;
        const planCount = planItemsByDate.get(dateISO) || 0;
        const evI = intensity(eventCount, maxEvents);
        const plI = intensity(planCount, maxPlans);
        const isEmpty = eventCount === 0 && planCount === 0;

        return (
          <button
            key={dateISO}
            type="button"
            className={`relative flex flex-col gap-1 px-3 py-2.5 rounded-none text-left cursor-pointer transition-all duration-200 day-list-item-responsive
              ${isActive
                ? 'bg-accent-light border border-accent-border shadow-[0_0_0_2px_var(--color-accent-glow)]'
                : 'border border-transparent hover:bg-card hover:border-border'}
              ${isEmpty && !isActive ? 'opacity-40' : ''}`}
            onClick={() => { setSelectedDate(dateISO); setShowAllEvents(false); }}
          >
            <div>
              <span className="block text-[0.65rem] font-bold text-muted uppercase tracking-wider leading-tight">{formatDateWeekday(dateISO)}</span>
              <span className="block text-[0.85rem] font-bold text-foreground leading-snug">{formatDateDayMonth(dateISO)}</span>
            </div>

            {!isEmpty && (
              <div className="flex flex-col gap-1 w-full" aria-hidden="true">
                {eventCount > 0 && (
                  <div className="h-[6px] rounded-none bg-border/60 overflow-hidden" title={`${eventCount} events`}>
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(evI * 100, 22)}%`,
                        backgroundColor: '#FF8800',
                        opacity: 0.35 + evI * 0.65,
                      }}
                    />
                  </div>
                )}
                {planCount > 0 && (
                  <div className="h-[6px] rounded-none bg-border/60 overflow-hidden" title={`${planCount} plans`}>
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(plI * 100, 22)}%`,
                        backgroundColor: '#00FF88',
                        opacity: 0.35 + plI * 0.65,
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
