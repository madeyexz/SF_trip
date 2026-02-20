'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import MapPanel from '@/components/MapPanel';
import { useTrip } from '@/components/providers/TripProvider';
import {
  Calendar, Coffee, MapPin, Navigation, RefreshCw
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'map', href: '/map', icon: MapPin, label: 'Map' },
  { id: 'calendar', href: '/calendar', icon: Calendar, label: 'Calendar' },
  { id: 'planning', href: '/planning', icon: Navigation, label: 'Planning' },
  { id: 'spots', href: '/spots', icon: Coffee, label: 'Spots' },
  { id: 'config', href: '/config', icon: RefreshCw, label: 'Config' }
];

const MAP_TABS = new Set(['map', 'planning', 'spots']);

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isSyncing, handleSync, handleDeviceLocation, canManageGlobal
  } = useTrip();

  const activeId = NAV_ITEMS.find((n) => pathname.startsWith(n.href))?.id || 'planning';
  const showMap = MAP_TABS.has(activeId);
  const hasMapSidebar = activeId !== 'map' && showMap;
  const canSync = canManageGlobal;
  const syncLabel = isSyncing ? 'Syncing...' : canSync ? 'Sync' : 'Owner only';

  return (
    <main className="min-h-dvh h-dvh flex flex-col w-full overflow-hidden">
      <header className="flex items-center gap-3 px-5 h-[52px] min-h-[52px] border-b border-border bg-[#080808] relative z-30 topbar-responsive">
        <div className="flex items-center gap-2 shrink-0">
          <MapPin size={14} className="text-accent" />
          <h1 className="m-0 text-[13px] font-semibold uppercase tracking-[1px] text-foreground">
            SF Trip Planner
          </h1>
        </div>
        <nav className="flex items-center gap-0.5 mx-auto overflow-x-auto scrollbar-none topbar-nav-responsive" aria-label="App navigator">
          {NAV_ITEMS.map(({ id, href, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              className={`inline-flex items-center gap-1 px-3.5 py-1.5 border-none rounded-none text-[0.72rem] font-bold uppercase tracking-wider cursor-pointer transition-all duration-200 whitespace-nowrap shrink-0 topbar-nav-item-responsive ${activeId === id ? 'text-accent border-b-2 border-b-accent' : 'bg-transparent text-muted hover:text-foreground'}`}
              onClick={() => router.push(href)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex gap-1.5 shrink-0 topbar-actions-responsive">
          <Button
            id="sync-button"
            type="button"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing || !canSync}
            title={canSync ? 'Sync events and spots' : 'Owner role required for pair-room sync'}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {syncLabel}
          </Button>
          <Button variant="secondary" id="use-device-location" type="button" size="sm" onClick={handleDeviceLocation}>
            <Navigation size={14} />
            My Location
          </Button>
        </div>
      </header>
      <div className={`min-h-0 flex-1 grid items-stretch ${hasMapSidebar ? 'layout-sidebar grid-cols-[minmax(0,3fr)_5fr]' : showMap ? 'grid-cols-1' : ''}`} style={showMap ? undefined : { display: 'contents' }}>
        <div className={showMap ? 'map-panel-shell min-h-0' : ''} style={showMap ? undefined : { position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden={!showMap}>
          <MapPanel />
        </div>
        {children}
      </div>
    </main>
  );
}
