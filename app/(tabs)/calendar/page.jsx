'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useTrip } from '@/components/providers/TripProvider';
import {
  formatMonthYear, formatDayOfMonth, toMonthISO, buildCalendarGridDates
} from '@/lib/helpers';

export default function CalendarPage() {
  const router = useRouter();
  const {
    calendarAnchorISO, selectedDate, setSelectedDate, setShowAllEvents,
    eventsByDate, planItemsByDate, shiftCalendarMonth
  } = useTrip();

  const calendarDays = buildCalendarGridDates(calendarAnchorISO);

  return (
    <section className="flex-1 min-h-0 overflow-y-auto flex justify-center p-8 max-sm:p-3.5 bg-bg">
      <div className="w-full max-w-[960px]">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mb-4">
          <Button type="button" size="sm" variant="secondary" onClick={() => shiftCalendarMonth(-1)}>Prev</Button>
          <h2 className="text-center m-0 text-xl font-bold">{formatMonthYear(calendarAnchorISO)}</h2>
          <Button type="button" size="sm" variant="secondary" onClick={() => shiftCalendarMonth(1)}>Next</Button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-muted text-[0.72rem] font-bold uppercase tracking-wider">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
            <span key={wd} className="text-center">{wd}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((dayISO) => {
            const isCurrentMonth = toMonthISO(dayISO) === toMonthISO(calendarAnchorISO);
            const isSelected = dayISO === selectedDate;
            const eventCount = eventsByDate.get(dayISO) || 0;
            const planCount = planItemsByDate.get(dayISO) || 0;
            return (
              <button
                key={dayISO}
                type="button"
                className={`border border-border bg-card rounded-[10px] min-h-[90px] max-sm:min-h-[70px] p-2.5 text-left flex flex-col gap-px cursor-pointer transition-all duration-200 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)] ${!isCurrentMonth ? 'opacity-50' : ''} ${isSelected ? 'cal-day-selected' : ''}`}
                onClick={() => { setSelectedDate(dayISO); setShowAllEvents(false); router.push('/dayroute'); }}
              >
                <span className="text-[0.84rem] font-bold text-foreground">{formatDayOfMonth(dayISO)}</span>
                <span className="text-[0.68rem] text-foreground-secondary leading-tight">{eventCount} events</span>
                <span className="text-[0.68rem] text-teal-700 leading-tight">{planCount} planned</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-muted text-[0.82rem]">Click a date to jump to its day route.</p>
      </div>
    </section>
  );
}
