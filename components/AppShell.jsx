'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import MapPanel from '@/components/MapPanel';
import { useTrip } from '@/components/providers/TripProvider';
import {
  Calendar, Coffee, MapPin, Navigation, PartyPopper, RefreshCw
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'map', href: '/map', icon: MapPin, label: 'Map' },
  { id: 'calendar', href: '/calendar', icon: Calendar, label: 'Calendar' },
  { id: 'dayplanning', href: '/dayplanning', icon: Navigation, label: 'Day Planning' },
  { id: 'events', href: '/events', icon: PartyPopper, label: 'Events' },
  { id: 'spots', href: '/spots', icon: Coffee, label: 'Spots' },
  { id: 'sources', href: '/sources', icon: RefreshCw, label: 'Sources' }
];

const MAP_TABS = new Set(['map', 'dayplanning', 'events', 'spots']);

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSyncing, handleSync, handleDeviceLocation } = useTrip();

  const activeId = NAV_ITEMS.find((n) => pathname.startsWith(n.href))?.id || 'dayplanning';
  const showMap = MAP_TABS.has(activeId);
  const hasMapSidebar = activeId !== 'map' && showMap;

  return (
    <main className="min-h-dvh h-dvh flex flex-col w-full overflow-hidden">
      <header className="flex items-center gap-3 px-5 h-[52px] min-h-[52px] border-b border-border bg-card shadow-[0_1px_2px_rgba(12,18,34,0.04)] relative z-30 topbar-responsive">
        <h1 className="m-0 text-lg font-extrabold tracking-tight shrink-0 bg-gradient-to-br from-foreground from-40% to-accent bg-clip-text text-transparent">SF Trip Planner</h1>
        <nav className="flex items-center gap-0.5 mx-auto overflow-x-auto scrollbar-none topbar-nav-responsive" aria-label="App navigator">
          {NAV_ITEMS.map(({ id, href, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              className={`inline-flex items-center gap-1 px-3.5 py-1.5 border-none rounded-full text-[0.82rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap shrink-0 topbar-nav-item-responsive ${activeId === id ? 'bg-accent-light text-accent font-semibold' : 'bg-transparent text-muted hover:bg-bg-subtle hover:text-foreground'}`}
              onClick={() => router.push(href)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex gap-1.5 shrink-0 topbar-actions-responsive">
          <Button id="sync-button" type="button" size="sm" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync'}
          </Button>
          <Button variant="secondary" id="use-device-location" type="button" size="sm" onClick={handleDeviceLocation}>
            <Navigation size={14} />
            My Location
          </Button>
        </div>
      </header>
      <div className={`min-h-0 flex-1 grid items-stretch ${hasMapSidebar ? 'layout-sidebar grid-cols-[minmax(0,1fr)_480px]' : showMap ? 'grid-cols-1' : ''}`} style={showMap ? undefined : { display: 'contents' }}>
        <div style={showMap ? undefined : { position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden={!showMap}>
          <MapPanel />
        </div>
        {children}
      </div>
    </main>
  );
}
