'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import MapPanel from '@/components/MapPanel';
import { useTrip } from '@/components/providers/TripProvider';
import {
  getActiveNavId,
  shouldShowMapForNavId,
  shouldShowMapSidebarForNavId
} from '@/lib/map-ui';
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

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isSyncing, handleSync, handleDeviceLocation
  } = useTrip();

  const activeId = getActiveNavId(pathname);
  const showMap = shouldShowMapForNavId(activeId);
  const hasMapSidebar = shouldShowMapSidebarForNavId(activeId);
  const syncLabel = isSyncing ? 'Syncing...' : 'Sync';

  return (
    <main className="flex min-h-dvh h-dvh w-full flex-col overflow-hidden">
      <header className="relative z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-[#080808] px-4 py-2 topbar-responsive sm:h-[52px] sm:min-h-[52px] sm:flex-nowrap sm:px-5 sm:py-0">
        <div className="flex items-center gap-2 shrink-0">
          <MapPin size={14} className="text-accent" />
          <h1 className="m-0 text-[13px] font-semibold uppercase tracking-[1px] text-foreground">
            SF Trip Planner
          </h1>
        </div>
        <div className="ml-auto flex shrink-0 gap-1.5 topbar-actions-responsive max-sm:order-2">
          <Button
            id="sync-button"
            type="button"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            title="Sync events and spots"
            className="max-[420px]:px-2.5"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            <span className="max-[420px]:hidden">{syncLabel}</span>
          </Button>
          {showMap ? (
            <Button
              variant="secondary"
              id="use-device-location"
              type="button"
              size="sm"
              onClick={handleDeviceLocation}
              className="max-[420px]:px-2.5"
            >
              <Navigation size={14} />
              <span className="max-[420px]:hidden">My Location</span>
            </Button>
          ) : null}
        </div>
        <nav
          className="order-3 flex basis-full items-center gap-0.5 overflow-x-auto border-t border-border pt-2 scrollbar-none topbar-nav-responsive sm:order-none sm:mx-auto sm:basis-auto sm:border-t-0 sm:pt-0"
          aria-label="App navigator"
        >
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
      </header>
      <div className={`min-h-0 flex-1 grid items-stretch ${hasMapSidebar ? 'layout-sidebar grid-cols-[minmax(0,3fr)_5fr]' : showMap ? 'grid-cols-1' : ''}`} style={showMap ? undefined : { display: 'contents' }}>
        {showMap ? <div className="map-panel-shell min-h-0"><MapPanel /></div> : null}
        {children}
      </div>
    </main>
  );
}
