'use client';

import DayList from '@/components/DayList';
import PlannerItinerary from '@/components/PlannerItinerary';
import { useTrip } from '@/components/providers/TripProvider';

export default function DayPlanningPage() {
  const { sidebarRef } = useTrip();

  return (
    <aside className="border-l border-border bg-card h-full min-h-0 overflow-hidden sidebar-responsive" ref={sidebarRef}>
      <div className="grid grid-cols-[180px_minmax(0,1fr)] h-full min-h-0 sidebar-grid-responsive">
        <DayList />
        <PlannerItinerary />
      </div>
    </aside>
  );
}
