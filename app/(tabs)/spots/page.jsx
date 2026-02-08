'use client';

import DayList from '@/components/DayList';
import PlannerItinerary from '@/components/PlannerItinerary';
import SpotsItinerary from '@/components/SpotsItinerary';
import { useTrip } from '@/components/providers/TripProvider';

export default function SpotsPage() {
  const { sidebarRef } = useTrip();

  return (
    <aside className="border-l border-border bg-card h-full min-h-0 overflow-hidden sidebar-responsive" ref={sidebarRef}>
      <div className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] h-full min-h-0 sidebar-grid-responsive">
        <DayList />
        <div className="border-r border-border overflow-y-auto min-h-0">
          <SpotsItinerary />
        </div>
        <PlannerItinerary />
      </div>
    </aside>
  );
}
