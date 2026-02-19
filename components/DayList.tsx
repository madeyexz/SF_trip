'use client';

import { useMemo, useState } from 'react';
import { useTrip } from '@/components/providers/TripProvider';
import { formatDateWeekday, formatDateDayMonth, toISODate } from '@/lib/helpers';

function intensity(count, max) {
  if (max === 0 || count === 0) return 0;
  return Math.min(count / max, 1);
}

function DayMetricsBars({ eventCount, planCount, maxEvents, maxPlans }) {
  const eventIntensity = intensity(eventCount, maxEvents);
  const planIntensity = intensity(planCount, maxPlans);

  if (eventCount === 0 && planCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 w-full" aria-hidden="true">
      {eventCount > 0 && (
        <div className="h-[6px] rounded-none bg-border/60 overflow-hidden" title={`${eventCount} events`}>
          <div
            className="h-full"
            style={{
              width: `${Math.max(eventIntensity * 100, 22)}%`,
              backgroundColor: '#FF8800',
              opacity: 0.35 + eventIntensity * 0.65,
            }}
          />
        </div>
      )}
      {planCount > 0 && (
        <div className="h-[6px] rounded-none bg-border/60 overflow-hidden" title={`${planCount} plans`}>
          <div
            className="h-full"
            style={{
              width: `${Math.max(planIntensity * 100, 22)}%`,
              backgroundColor: '#00FF88',
              opacity: 0.35 + planIntensity * 0.65,
            }}
          />
        </div>
      )}
    </div>
  );
}

function DayListSkeleton() {
  const widths = ['w-[70%]', 'w-[60%]', 'w-[80%]', 'w-[55%]', 'w-[75%]', 'w-[65%]', 'w-[50%]', 'w-[72%]'];
  const barWidths = ['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5', 'w-1/3', 'w-4/5', 'w-1/2'];
  return (
    <div className="flex flex-col gap-1 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1 px-3 py-2.5 rounded-none border border-transparent" style={{ animationDelay: `${i * 75}ms` }}>
          <div>
            <div className={`h-[10px] ${widths[(i + 1) % 8]} bg-border/40 rounded-sm animate-pulse`} style={{ animationDelay: `${i * 75}ms` }} />
            <div className={`mt-1.5 h-[14px] ${widths[i % 8]} bg-border/50 rounded-sm animate-pulse`} style={{ animationDelay: `${i * 75}ms` }} />
          </div>
          {i % 3 !== 2 && (
            <div className="flex flex-col gap-1 w-full">
              <div className={`h-[6px] ${barWidths[i % 8]} bg-[#FF8800]/15 rounded-none animate-pulse`} style={{ animationDelay: `${i * 75}ms` }} />
              {i % 2 === 0 && <div className={`h-[6px] ${barWidths[(i + 3) % 8]} bg-[#00FF88]/15 rounded-none animate-pulse`} style={{ animationDelay: `${i * 75}ms` }} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DayList() {
  const {
    uniqueDates,
    selectedDate,
    setSelectedDate,
    setShowAllEvents,
    eventsByDate,
    planItemsByDate,
    isInitializing
  } = useTrip();

  const [isPastExpanded, setIsPastExpanded] = useState(false);
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const { maxEvents, maxPlans } = useMemo(() => {
    let maxEvents = 0;
    let maxPlans = 0;

    for (const dateISO of uniqueDates) {
      maxEvents = Math.max(maxEvents, eventsByDate.get(dateISO) || 0);
      maxPlans = Math.max(maxPlans, planItemsByDate.get(dateISO) || 0);
    }

    return { maxEvents, maxPlans };
  }, [uniqueDates, eventsByDate, planItemsByDate]);

  const { pastDates, upcomingDates } = useMemo(() => {
    const grouped = { pastDates: [], upcomingDates: [] };
    for (const dateISO of uniqueDates) {
      if (dateISO < todayISO) {
        grouped.pastDates.push(dateISO);
      } else {
        grouped.upcomingDates.push(dateISO);
      }
    }
    return grouped;
  }, [uniqueDates, todayISO]);

  const hasPastDates = pastDates.length > 0;
  const isSelectedPastDate = Boolean(selectedDate && selectedDate < todayISO);

  const pastTotals = useMemo(() => {
    return pastDates.reduce(
      (acc, dateISO) => ({
        events: acc.events + (eventsByDate.get(dateISO) || 0),
        plans: acc.plans + (planItemsByDate.get(dateISO) || 0),
      }),
      { events: 0, plans: 0 },
    );
  }, [pastDates, eventsByDate, planItemsByDate]);

  const selectDate = (dateISO) => {
    setSelectedDate(dateISO);
    setShowAllEvents(false);
  };

  const renderDay = (dateISO) => {
    const eventCount = eventsByDate.get(dateISO) || 0;
    const planCount = planItemsByDate.get(dateISO) || 0;
    const isActive = dateISO === selectedDate;

    return (
      <button
        key={dateISO}
        type="button"
        className={`relative flex flex-col gap-1 px-3 py-2.5 rounded-none text-left cursor-pointer transition-all duration-200 day-list-item-responsive
          ${isActive
            ? 'bg-accent-light border border-accent-border shadow-[0_0_0_2px_var(--color-accent-glow)]'
            : 'border border-transparent hover:bg-card hover:border-border'}`}
        onClick={() => {
          selectDate(dateISO);
        }}
      >
        <div>
          <span className="block text-[0.65rem] font-bold text-muted uppercase tracking-wider leading-tight">{formatDateWeekday(dateISO)}</span>
          <span className="block text-[0.85rem] font-bold text-foreground leading-snug">{formatDateDayMonth(dateISO)}</span>
        </div>
        <DayMetricsBars
          eventCount={eventCount}
          planCount={planCount}
          maxEvents={maxEvents}
          maxPlans={maxPlans}
        />
      </button>
    );
  };

  if (isInitializing) {
    return <DayListSkeleton />;
  }

  if (uniqueDates.length === 0) {
    return (
      <div className="flex flex-col gap-0.5 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
        <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-none border border-dashed border-border">No event dates</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
      {hasPastDates && (
        <button
          type="button"
          className={`relative flex flex-col gap-1 px-3 py-2.5 rounded-none text-left cursor-pointer transition-all duration-200 day-list-item-responsive
            ${isSelectedPastDate
              ? 'bg-accent-light border border-accent-border shadow-[0_0_0_2px_var(--color-accent-glow)]'
              : 'border border-transparent hover:bg-card hover:border-border'}
            ${isPastExpanded ? 'opacity-100' : 'opacity-60'}`}
          onClick={() => {
            setIsPastExpanded((value) => !value);
          }}
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.65rem] font-bold text-muted uppercase tracking-wider leading-tight">PAST DAYS</span>
              <span aria-hidden="true" className="text-[0.7rem] font-bold text-muted">
                {isPastExpanded ? '▼' : '▶'}
              </span>
            </div>
            <span className="block text-[0.85rem] font-bold text-foreground leading-snug">
              {`${pastDates.length} DAY(S) ${isPastExpanded ? '(SHOWING)' : '(FOLDED)'}`}
            </span>
          </div>
          {!isPastExpanded && (pastTotals.events > 0 || pastTotals.plans > 0) && (
            <DayMetricsBars
              eventCount={pastTotals.events}
              planCount={pastTotals.plans}
              maxEvents={maxEvents}
              maxPlans={maxPlans}
            />
          )}
          {!isPastExpanded && (
            <span className="inline-flex w-fit items-center gap-1 text-[0.62rem] font-semibold text-muted uppercase tracking-wide">
              CLICK TO TOGGLE
            </span>
          )}
        </button>
      )}

      {isPastExpanded && pastDates.map((dateISO) => renderDay(dateISO))}
      {upcomingDates.map((dateISO) => renderDay(dateISO))}
    </div>
  );
}
