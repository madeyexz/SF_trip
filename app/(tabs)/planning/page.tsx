'use client';

import DayList from '@/components/DayList';
import EventsItinerary from '@/components/EventsItinerary';
import PlannerItinerary from '@/components/PlannerItinerary';
import { useTrip } from '@/components/providers/TripProvider';

export default function PlanningPage() {
  const { sidebarRef } = useTrip();

  return (
    <aside className="border-l border-border bg-card h-full min-h-0 overflow-hidden sidebar-responsive" ref={sidebarRef}>
      <div className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] h-full min-h-0 sidebar-grid-responsive">
        <DayList />
        <div className="border-r border-border overflow-y-auto min-h-0">
          <EventsItinerary />
        </div>
        <PlannerItinerary />
      </div>
    </aside>
  );
}
