'use client';

import { useTrip } from '@/components/providers/TripProvider';
import { formatDateWeekday, formatDateDayMonth } from '@/lib/helpers';

export default function DayList() {
  const { uniqueDates, selectedDate, setSelectedDate, setShowAllEvents, eventsByDate, planItemsByDate } = useTrip();

  if (uniqueDates.length === 0) {
    return (
      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
        <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-[10px] border border-dashed border-border">No event dates</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
      {uniqueDates.map((dateISO) => {
        const isActive = dateISO === selectedDate;
        const eventCount = eventsByDate.get(dateISO) || 0;
        const planCount = planItemsByDate.get(dateISO) || 0;

        return (
          <button
            key={dateISO}
            type="button"
            className={`flex flex-col gap-px px-2.5 py-2 border rounded-lg text-left cursor-pointer transition-all duration-200 day-list-item-responsive ${isActive ? 'bg-accent-light border-accent-border shadow-[0_0_0_2px_var(--color-accent-glow)]' : 'bg-transparent border-transparent hover:bg-card hover:border-border'}`}
            onClick={() => { setSelectedDate(dateISO); setShowAllEvents(false); }}
          >
            <span className="text-[0.65rem] font-bold text-muted uppercase tracking-wider">{formatDateWeekday(dateISO)}</span>
            <span className="text-[0.84rem] font-bold text-foreground">{formatDateDayMonth(dateISO)}</span>
            <span className="text-[0.65rem] text-foreground-secondary">{eventCount} ev · {planCount} plan</span>
          </button>
        );
      })}
    </div>
  );
}
