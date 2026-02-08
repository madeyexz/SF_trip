'use client';

import MapPanel from '@/components/MapPanel';
import DayList from '@/components/DayList';
import EventsItinerary from '@/components/EventsItinerary';
import { useTrip } from '@/components/providers/TripProvider';

export default function EventsPage() {
  const { sidebarRef } = useTrip();

  return (
    <section className="min-h-0 grid gap-0 flex-1 items-stretch layout-sidebar grid-cols-[minmax(0,1fr)_480px]">
      <MapPanel />
      <aside className="border-l border-border bg-card h-full min-h-0 overflow-hidden sidebar-responsive" ref={sidebarRef}>
        <div className="grid grid-cols-[180px_minmax(0,1fr)] h-full min-h-0 sidebar-grid-responsive">
          <DayList />
          <EventsItinerary />
        </div>
      </aside>
    </section>
  );
}
