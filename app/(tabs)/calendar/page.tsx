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
    <section className="flex flex-1 min-h-0 justify-center overflow-y-auto bg-bg p-4 sm:p-8">
      <div className="w-full max-w-[960px]">
        <div className="mb-4 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button type="button" size="sm" variant="secondary" className="px-2 sm:px-3" onClick={() => shiftCalendarMonth(-1)}>Prev</Button>
          <h2 className="m-0 text-center text-lg font-bold sm:text-xl" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>{formatMonthYear(calendarAnchorISO)}</h2>
          <Button type="button" size="sm" variant="secondary" className="px-2 sm:px-3" onClick={() => shiftCalendarMonth(1)}>Next</Button>
        </div>
        <div className="mb-1.5 grid grid-cols-7 gap-1 text-[0.62rem] font-bold uppercase tracking-wider text-muted sm:gap-1.5 sm:text-[0.72rem]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
            <span key={wd} className="text-center">{wd}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarDays.map((dayISO) => {
            const isCurrentMonth = toMonthISO(dayISO) === toMonthISO(calendarAnchorISO);
            const isSelected = dayISO === selectedDate;
            const eventCount = eventsByDate.get(dayISO) || 0;
            const planCount = planItemsByDate.get(dayISO) || 0;
            return (
              <button
                key={dayISO}
                type="button"
                className={`flex min-h-[64px] flex-col gap-px border border-border bg-card p-1.5 text-left transition-all duration-200 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)] sm:min-h-[90px] sm:p-2.5 ${!isCurrentMonth ? 'opacity-50' : ''} ${isSelected ? 'cal-day-selected' : ''}`}
                onClick={() => { setSelectedDate(dayISO); setShowAllEvents(false); router.push('/planning'); }}
              >
                <span className="text-[0.75rem] font-bold text-foreground sm:text-[0.84rem]">{formatDayOfMonth(dayISO)}</span>
                <span className="text-[0.58rem] leading-tight text-foreground-secondary sm:text-[0.68rem]">{eventCount} events</span>
                <span className="text-[0.58rem] leading-tight text-accent sm:text-[0.68rem]">{planCount} planned</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-[0.78rem] text-muted sm:text-[0.82rem]">Click a date to jump to its day route.</p>
      </div>
    </section>
  );
}
