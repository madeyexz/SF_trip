const NAV_IDS = ['map', 'calendar', 'planning', 'spots', 'config'] as const;

export type AppNavId = (typeof NAV_IDS)[number];

export const MAP_TAB_IDS = new Set<AppNavId>(['map', 'planning', 'spots']);

export function getActiveNavId(pathname: string): AppNavId {
  for (const navId of NAV_IDS) {
    if (pathname.startsWith(`/${navId}`)) {
      return navId;
    }
  }
  return 'planning';
}

export function shouldShowMapForNavId(navId: AppNavId): boolean {
  return MAP_TAB_IDS.has(navId);
}

export function shouldShowMapSidebarForNavId(navId: AppNavId): boolean {
  return shouldShowMapForNavId(navId) && navId !== 'map';
}
