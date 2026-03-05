'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { MapPin } from 'lucide-react';
import { __iconNode as calendarIconNode } from 'lucide-react/dist/esm/icons/calendar.js';
import { __iconNode as coffeeIconNode } from 'lucide-react/dist/esm/icons/coffee.js';
import { __iconNode as houseIconNode } from 'lucide-react/dist/esm/icons/house.js';
import { __iconNode as mapPinIconNode } from 'lucide-react/dist/esm/icons/map-pin.js';
import { __iconNode as martiniIconNode } from 'lucide-react/dist/esm/icons/martini.js';
import { __iconNode as partyPopperIconNode } from 'lucide-react/dist/esm/icons/party-popper.js';
import { __iconNode as shieldCheckIconNode } from 'lucide-react/dist/esm/icons/shield-check.js';
import { __iconNode as shoppingBagIconNode } from 'lucide-react/dist/esm/icons/shopping-bag.js';
import { __iconNode as triangleAlertIconNode } from 'lucide-react/dist/esm/icons/triangle-alert.js';
import { __iconNode as landmarkIconNode } from 'lucide-react/dist/esm/icons/landmark.js';
import { __iconNode as utensilsCrossedIconNode } from 'lucide-react/dist/esm/icons/utensils-crossed.js';
import {
  Coffee, Landmark, Martini, PartyPopper, ShieldCheck, ShoppingBag, TriangleAlert, UtensilsCrossed
} from 'lucide-react';

import {
  normalizePlaceTag, normalizeAddressKey, getPlaceSourceKey, normalizeDateKey,
  fetchJson, toISODate, toMonthISO, toDateOnlyISO, addMonthsToMonthISO, escapeHtml, truncate,
  formatTag, formatDate, formatDateDayMonth, formatDistance, formatDurationFromSeconds,
  buildISODateRange, daysFromNow, formatSourceLabel
} from '@/lib/helpers';
import { getSafeExternalHref } from '@/lib/security';
import {
  createPlanId, sortPlanItems, sanitizePlannerByDate, compactPlannerByDate,
  parseEventTimeRange, getSuggestedPlanSlot,
  buildPlannerIcs, buildGoogleCalendarStopUrls,
  MAX_ROUTE_STOPS
} from '@/lib/planner-helpers';
import {
  createLucidePinIcon, createLucidePinIconWithLabel, toCoordinateKey, toLatLngLiteral, createTravelTimeCacheKey,
  createRouteRequestCacheKey, requestPlannedRoute,
  loadGoogleMapsScript, buildInfoWindowAddButton, buildPlacePhotoGalleryHtml,
  createPlacePhotoCacheKey, fetchPlacePhotoGallery, getNextPlacePhotoIndex,
  normalizePlacesTextSearchResults, buildCustomSpotPayloadFromSearchResult,
  buildSearchResultTypeChips, estimateWalkDurationMinutes, sortPlaceSearchResults, getMapBoundsSearchRadius,
  calculateDistanceMeters
} from '@/lib/map-helpers';
import {
  applyDeviceLocation,
  DEVICE_LOCATION_OPTIONS
} from '@/lib/device-location';
import { getOrCreateCoalescedPromise } from '@/lib/async-coalesce';
import { mapAsyncInParallel } from '@/lib/async-map';

const TAG_COLORS = {
  eat: '#FF8800',
  bar: '#A78BFA',
  cafes: '#60A5FA',
  'go out': '#F472B6',
  shops: '#2DD4BF',
  sightseeing: '#8B5CF6',
  avoid: '#FF4444',
  safe: '#00FF88'
};

export const CRIME_LOOKBACK_HOURS_OPTIONS = [1, 24, 72] as const;
const DEFAULT_CRIME_LOOKBACK_HOURS = 72;
const CRIME_HEATMAP_LIMIT = 6000;
const CRIME_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const CRIME_IDLE_DEBOUNCE_MS = 450;
const CRIME_MIN_REQUEST_INTERVAL_MS = 20 * 1000;
const DEFAULT_CRIME_HEATMAP_STRENGTH = 'high';
const CRIME_HEATMAP_GRADIENT = [
  'rgba(0, 0, 0, 0)',
  'rgba(254, 202, 202, 0.06)',
  'rgba(248, 113, 113, 0.22)',
  'rgba(239, 68, 68, 0.45)',
  'rgba(225, 29, 72, 0.68)',
  'rgba(159, 18, 57, 0.86)',
  'rgba(127, 29, 29, 0.96)'
];

function getCrimeCategoryWeight(category) {
  const c = String(category || '').toLowerCase();
  if (!c) return 1;
  if (c.includes('homicide') || c.includes('human trafficking')) return 4.2;
  if (c.includes('rape') || c.includes('sex offense')) return 3.8;
  if (c.includes('assault') || c.includes('robbery')) return 3.2;
  if (c.includes('weapons') || c.includes('arson') || c.includes('kidnapping')) return 2.8;
  if (c.includes('burglary') || c.includes('motor vehicle theft')) return 2.3;
  if (c.includes('theft') || c.includes('larceny')) return 1.8;
  if (c.includes('vandalism') || c.includes('vehicle')) return 1.6;
  return 1.2;
}

function getCrimeHeatmapRadiusForZoom(zoom) {
  const zoomLevel = Number.isFinite(zoom) ? Number(zoom) : 12;
  return Math.max(16, Math.min(34, Math.round(46 - zoomLevel * 1.9)));
}

function getCrimeHeatmapProfile(strength) {
  if (strength === 'high') {
    return { weightMultiplier: 1.85, opacity: 0.9, maxIntensity: 2.9, radiusScale: 1.08 };
  }
  if (strength === 'low') {
    return { weightMultiplier: 1.15, opacity: 0.72, maxIntensity: 4.9, radiusScale: 0.9 };
  }
  return { weightMultiplier: 1.45, opacity: 0.84, maxIntensity: 3.3, radiusScale: 1 };
}

function isCrimeLookbackHoursOption(value: number) {
  return CRIME_LOOKBACK_HOURS_OPTIONS.includes(value as (typeof CRIME_LOOKBACK_HOURS_OPTIONS)[number]);
}

function buildCrimeBoundsQuery(map) {
  const bounds = map?.getBounds?.();
  const ne = bounds?.getNorthEast?.();
  const sw = bounds?.getSouthWest?.();
  if (!ne || !sw) return '';
  const north = Number(ne.lat?.());
  const east = Number(ne.lng?.());
  const south = Number(sw.lat?.());
  const west = Number(sw.lng?.());
  if (![north, east, south, west].every(Number.isFinite)) return '';
  if (south >= north || west >= east) return '';
  const params = new URLSearchParams({
    south: south.toFixed(6),
    west: west.toFixed(6),
    north: north.toFixed(6),
    east: east.toFixed(6)
  });
  return params.toString();
}

type CrimeLayerMeta = {
  loading: boolean;
  count: number;
  hours: number;
  generatedAt: string;
  error: string;
};

const EMPTY_CRIME_LAYER_META: CrimeLayerMeta = {
  loading: false,
  count: 0,
  hours: DEFAULT_CRIME_LOOKBACK_HOURS,
  generatedAt: '',
  error: ''
};

const searchShortcutQueries = [
  { label: 'Coffee', query: 'coffee nearby' },
  { label: 'Bars', query: 'cocktail bar nearby' },
  { label: 'Brunch', query: 'brunch nearby' },
  { label: 'Parks', query: 'parks nearby' },
  { label: 'Museums', query: 'museums nearby' }
];

const TAG_ICON_COMPONENTS = {
  eat: UtensilsCrossed,
  bar: Martini,
  cafes: Coffee,
  'go out': PartyPopper,
  shops: ShoppingBag,
  sightseeing: Landmark,
  avoid: TriangleAlert,
  safe: ShieldCheck
};

const TAG_ICON_NODES = {
  eat: utensilsCrossedIconNode,
  bar: martiniIconNode,
  cafes: coffeeIconNode,
  'go out': partyPopperIconNode,
  shops: shoppingBagIconNode,
  sightseeing: landmarkIconNode,
  avoid: triangleAlertIconNode,
  safe: shieldCheckIconNode
};

export function getTagColor(tag) {
  return TAG_COLORS[normalizePlaceTag(tag)] || '#2563eb';
}

export function getTagIconComponent(tag) {
  return TAG_ICON_COMPONENTS[normalizePlaceTag(tag)] || MapPin;
}

function getTagIconNode(tag) {
  return TAG_ICON_NODES[normalizePlaceTag(tag)] || mapPinIconNode;
}

export { TAG_COLORS };

const TripContext = createContext<any>(null);

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside TripProvider');
  return ctx;
}

export default function TripProvider({ children }: { children: ReactNode }) {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const mapPanelRef = useRef<any>(null);
  const sidebarRef = useRef<any>(null);
  const mapElementRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const distanceMatrixRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const baseMarkerRef = useRef<any>(null);
  const baseLatLngRef = useRef<any>(null);
  const searchResultMarkersRef = useRef<any[]>([]);
  const deviceLocationMarkerRef = useRef<any>(null);
  const deviceLocationLatLngRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const regionPolygonsRef = useRef<any[]>([]);
  const crimeHeatmapRef = useRef<any>(null);
  const crimeRefreshTimerRef = useRef<number | null>(null);
  const crimeIdleListenerRef = useRef<any>(null);
  const searchAreaIdleListenerRef = useRef<any>(null);
  const crimeLookbackHydratedRef = useRef(false);
  const mapSearchPrefsHydratedRef = useRef(false);
  const skipNextSearchAreaIdleRef = useRef(false);
  const searchVisibleAreaRequestedRef = useRef(false);
  const lastCrimeFetchAtRef = useRef(0);
  const lastCrimeQueryRef = useRef('');
  const positionCacheRef = useRef<Map<string, any>>(new Map());
  const positionInFlightRef = useRef<Map<string, Promise<any>>>(new Map());
  const geocodeStoreRef = useRef<Map<string, any>>(new Map());
  const geocodeInFlightRef = useRef<Map<string, Promise<any>>>(new Map());
  const travelTimeCacheRef = useRef<Map<string, any>>(new Map());
  const plannedRouteCacheRef = useRef<Map<string, any>>(new Map());
  const placePhotoCacheRef = useRef<Map<string, any[]>>(new Map());
  const placePhotoGalleryIndexRef = useRef<Map<string, number>>(new Map());
  const activePlaceInfoWindowKeyRef = useRef('');
  const plannerHydratedRef = useRef(false);
  const renderGenerationRef = useRef(0);

  const [status, setStatus] = useState('Loading trip map...');
  const [statusError, setStatusError] = useState(false);
  const [crimeLayerMeta, setCrimeLayerMeta] = useState<CrimeLayerMeta>(EMPTY_CRIME_LAYER_META);
  const [crimeHeatmapStrength, setCrimeHeatmapStrength] = useState(DEFAULT_CRIME_HEATMAP_STRENGTH);
  const [crimeLookbackHours, setCrimeLookbackHours] = useState<number>(DEFAULT_CRIME_LOOKBACK_HOURS);
  const [mapRuntimeActive, setMapRuntimeActive] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsBrowserKey, setMapsBrowserKey] = useState('');
  const [mapsMapId, setMapsMapId] = useState('');
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [allPlaces, setAllPlaces] = useState<any[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<any[]>([]);
  const [visiblePlaces, setVisiblePlaces] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(true);
  const [travelMode, setTravelMode] = useState('WALKING');
  const [baseLocationText, setBaseLocationText] = useState('');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapSearchScope, setMapSearchScope] = useState('map');
  const [mapSearchSort, setMapSearchSort] = useState('best_match');
  const [mapSearchAreaDirty, setMapSearchAreaDirty] = useState(false);
  const [isSearchingMapLocation, setIsSearchingMapLocation] = useState(false);
  const [searchLocationError, setSearchLocationError] = useState('');
  const [searchResultsOriginLabel, setSearchResultsOriginLabel] = useState('Map area');
  const [placeSearchResults, setPlaceSearchResults] = useState<any[]>([]);
  const [searchResultTagDrafts, setSearchResultTagDrafts] = useState<Record<string, string>>({});
  const [searchResultSelectionIds, setSearchResultSelectionIds] = useState<string[]>([]);
  const [expandedSearchResultEditorId, setExpandedSearchResultEditorId] = useState('');
  const [activeSearchResultId, setActiveSearchResultId] = useState('');
  const [savingSearchResultId, setSavingSearchResultId] = useState('');
  const [deletingCustomSpotId, setDeletingCustomSpotId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [placeTagFilter, setPlaceTagFilter] = useState('all');
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const hiddenCategoriesRef = useRef<Set<string>>(new Set());
  const hiddenCategoriesHydrated = useRef(false);
  const [calendarMonthISO, setCalendarMonthISO] = useState('');
  const [plannerByDate, setPlannerByDate] = useState<Record<string, any[]>>({});
  const [activePlanId, setActivePlanId] = useState('');
  const [routeSummary, setRouteSummary] = useState('');
  const [isRouteUpdating, setIsRouteUpdating] = useState(false);
  const [baseLocationVersion, setBaseLocationVersion] = useState(0);
  const [sources, setSources] = useState<any[]>([]);
  const [newSourceType, setNewSourceType] = useState('event');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceLabel, setNewSourceLabel] = useState('');
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [showSharedPlaceRecommendations, setShowSharedPlaceRecommendations] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [authUserId, setAuthUserId] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const placeTagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const place of allPlaces) tags.add(normalizePlaceTag(place.tag));
    return ['all', ...Array.from(tags).sort((l, r) => l.localeCompare(r))];
  }, [allPlaces]);

  const filteredPlaces = useMemo(() => {
    if (placeTagFilter === 'all') return allPlaces;
    return allPlaces.filter((p) => normalizePlaceTag(p.tag) === placeTagFilter);
  }, [allPlaces, placeTagFilter]);

  const eventLookup = useMemo(
    () => new Map(visibleEvents.map((e) => [e.eventUrl, e])),
    [visibleEvents]
  );

  const placeLookup = useMemo(() => {
    const map = new Map();
    for (const p of visiblePlaces) map.set(getPlaceSourceKey(p), p);
    return map;
  }, [visiblePlaces]);

  const groupedSources = useMemo(() => {
    const groups = { event: [], spot: [] };
    for (const source of sources) {
      const key = source?.sourceType === 'spot' ? 'spot' : 'event';
      groups[key].push(source);
    }
    return groups;
  }, [sources]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('hiddenCategories');
      if (stored) setHiddenCategories(new Set(JSON.parse(stored)));
    } catch {}
    hiddenCategoriesHydrated.current = true;
  }, []);
  useEffect(() => {
    hiddenCategoriesRef.current = hiddenCategories;
    if (hiddenCategoriesHydrated.current) {
      try { localStorage.setItem('hiddenCategories', JSON.stringify([...hiddenCategories])); } catch {}
    }
  }, [hiddenCategories]);

  useEffect(() => {
    try {
      const stored = Number.parseInt(localStorage.getItem('crimeLookbackHours') || '', 10);
      if (isCrimeLookbackHoursOption(stored)) setCrimeLookbackHours(stored);
    } catch {}
    crimeLookbackHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!crimeLookbackHydratedRef.current) return;
    try {
      localStorage.setItem('crimeLookbackHours', String(crimeLookbackHours));
    } catch {}
  }, [crimeLookbackHours]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('mapSearchPreferences') || 'null');
      if (stored && typeof stored === 'object') {
        if (typeof stored.query === 'string') setMapSearchQuery(stored.query);
        if (typeof stored.scope === 'string') setMapSearchScope(stored.scope);
        if (typeof stored.sort === 'string') setMapSearchSort(stored.sort);
      }
    } catch {}
    mapSearchPrefsHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!mapSearchPrefsHydratedRef.current) return;
    try {
      localStorage.setItem('mapSearchPreferences', JSON.stringify({
        query: mapSearchQuery,
        scope: mapSearchScope,
        sort: mapSearchSort
      }));
    } catch {}
  }, [mapSearchQuery, mapSearchScope, mapSearchSort]);

  const uniqueDates = useMemo(() => {
    if (tripStart && tripEnd) {
      return buildISODateRange(tripStart, tripEnd);
    }
    const dateSet = new Set<string>();
    for (const e of allEvents) {
      const d = normalizeDateKey(e.startDateISO);
      if (d) dateSet.add(d);
    }
    for (const d of Object.keys(plannerByDate)) {
      if (d) dateSet.add(d);
    }
    return Array.from(dateSet).sort();
  }, [tripStart, tripEnd, allEvents, plannerByDate]);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const d of uniqueDates) map.set(d, 0);
    for (const e of allEvents) {
      const d = normalizeDateKey(e.startDateISO);
      if (d) map.set(d, (map.get(d) || 0) + 1);
    }
    return map;
  }, [allEvents, uniqueDates]);

  const planItemsByDate = useMemo(() => {
    const map = new Map();
    for (const [d, items] of Object.entries(plannerByDate)) {
      map.set(d, Array.isArray(items) ? items.length : 0);
    }
    return map;
  }, [plannerByDate]);

  const calendarAnchorISO = useMemo(
    () => calendarMonthISO || selectedDate || uniqueDates[0] || toISODate(new Date()),
    [calendarMonthISO, selectedDate, uniqueDates]
  );

  useEffect(() => {
    if (uniqueDates.length === 0) { setSelectedDate(''); return; }
    const todayISO = toISODate(new Date());
    if (!selectedDate || !uniqueDates.includes(selectedDate)) {
      setSelectedDate(uniqueDates.includes(todayISO) ? todayISO : uniqueDates[0]);
    }
  }, [selectedDate, uniqueDates]);

  useEffect(() => {
    if (!selectedDate) return;
    const selectedMonth = toMonthISO(selectedDate);
    if (!calendarMonthISO || calendarMonthISO !== selectedMonth) setCalendarMonthISO(selectedMonth);
  }, [calendarMonthISO, selectedDate]);

  const effectiveDateFilter = showAllEvents ? '' : selectedDate;

  const dayPlanItems = useMemo(() => {
    if (!selectedDate) return [];
    const items = plannerByDate[selectedDate];
    return Array.isArray(items) ? sortPlanItems(items) : [];
  }, [plannerByDate, selectedDate]);

  const plannedRouteStops = useMemo(() => {
    const stops = [];
    for (const item of dayPlanItems) {
      if (item.kind === 'event') {
        const event = eventLookup.get(item.sourceKey);
        if (event?._position) stops.push({ id: item.id, title: item.title, position: event._position });
      } else {
        const place = placeLookup.get(item.sourceKey);
        if (place?._position) stops.push({ id: item.id, title: item.title, position: place._position });
      }
    }
    return stops;
  }, [dayPlanItems, eventLookup, placeLookup]);

  // ---- Planner persistence ----
  useEffect(() => {
    let mounted = true;
    plannerHydratedRef.current = false;
    setPlannerByDate({});

    async function loadPlannerFromServer() {
      if (!isAuthenticated) {
        if (mounted) {
          setPlannerByDate({});
          plannerHydratedRef.current = true;
        }
        return;
      }

      try {
        const payload = await fetchJson('/api/planner');
        if (!mounted) return;

        const resolvedUserId = String(payload?.userId || authUserId || '');
        if (resolvedUserId) setAuthUserId(resolvedUserId);
        setPlannerByDate(sanitizePlannerByDate(payload?.plannerByDate || {}) as Record<string, any[]>);
      } catch (error) {
        console.error('Planner load failed; continuing with in-memory planner state.', error);
        if (mounted) {
          setPlannerByDate({});
        }
      } finally {
        if (mounted) plannerHydratedRef.current = true;
      }
    }

    void loadPlannerFromServer();
    return () => {
      mounted = false;
      plannerHydratedRef.current = true;
    };
  }, [authUserId, isAuthenticated]);

  const savePlannerToServer = useCallback(async (nextPlannerByDate) => {
    try {
      const response = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerByDate: compactPlannerByDate(nextPlannerByDate)
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Planner save failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Planner save failed; retaining local planner cache.', error);
    }
  }, []);

  useEffect(() => {
    const compactPlanner = compactPlannerByDate(plannerByDate);
    if (!plannerHydratedRef.current) return;
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      void savePlannerToServer(compactPlanner);
    }, 450);
    return () => { window.clearTimeout(timeoutId); };
  }, [isAuthenticated, plannerByDate, savePlannerToServer]);

  // ---- Geocode cache ----
  const saveGeocodeCache = useCallback(() => {
    // Keep geocode cache in-memory only to avoid persisting sensitive location data in browser storage.
  }, []);

  const setStatusMessage = useCallback((message, isError = false) => {
    setStatus(message);
    setStatusError(isError);
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      setStatusMessage('Signed out.');
      if (typeof window !== 'undefined') {
        window.location.assign('/signin');
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Sign out failed.', true);
    } finally {
      setIsSigningOut(false);
    }
  }, [setStatusMessage, signOut]);

  const loadSourcesFromServer = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/sources');
      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
    } catch (error) {
      console.error('Failed to load sources.', error);
      setSources([]);
    }
  }, []);

  const clearMapMarkers = useCallback(() => {
    for (const m of markersRef.current) m.map = null;
    markersRef.current = [];
    for (const p of regionPolygonsRef.current) p.setMap(null);
    regionPolygonsRef.current = [];
  }, []);

  const clearSearchResultMarkers = useCallback(() => {
    for (const marker of searchResultMarkersRef.current) {
      marker.map = null;
    }
    searchResultMarkersRef.current = [];
    if (infoWindowRef.current?.close) {
      infoWindowRef.current.close();
    }
  }, []);

  const clearRoute = useCallback(() => {
    if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null; }
    setIsRouteUpdating(false);
  }, []);

  const syncRoutePolylineVisibility = useCallback(() => {
    if (!routePolylineRef.current) return;
    routePolylineRef.current.setMap(hiddenCategoriesRef.current.has('home') ? null : mapRef.current);
  }, []);

  const cleanupMapRuntime = useCallback(() => {
    renderGenerationRef.current += 1;
    clearMapMarkers();
    clearRoute();
    if (crimeIdleListenerRef.current?.remove) {
      crimeIdleListenerRef.current.remove();
      crimeIdleListenerRef.current = null;
    }
    if (crimeRefreshTimerRef.current) {
      window.clearInterval(crimeRefreshTimerRef.current);
      crimeRefreshTimerRef.current = null;
    }
    if (crimeHeatmapRef.current) {
      crimeHeatmapRef.current.setMap(null);
      crimeHeatmapRef.current = null;
    }
    if (infoWindowRef.current?.close) {
      infoWindowRef.current.close();
    }
    infoWindowRef.current = null;
    if (baseMarkerRef.current) {
      baseMarkerRef.current.map = null;
      baseMarkerRef.current = null;
    }
    clearSearchResultMarkers();
    if (deviceLocationMarkerRef.current) {
      deviceLocationMarkerRef.current.map = null;
      deviceLocationMarkerRef.current = null;
    }
    baseLatLngRef.current = null;
    deviceLocationLatLngRef.current = null;
    distanceMatrixRef.current = null;
    mapRef.current = null;
    activePlaceInfoWindowKeyRef.current = '';
    setMapsReady(false);
  }, [clearMapMarkers, clearRoute, clearSearchResultMarkers]);

  const applyCrimeHeatmapData = useCallback((incidentsInput, generatedAtValue = '', hoursValue = DEFAULT_CRIME_LOOKBACK_HOURS) => {
    if (!mapsReady || !mapRef.current || !window.google?.maps?.visualization) return;
    const profile = getCrimeHeatmapProfile(crimeHeatmapStrength);
    const radius = Math.max(12, Math.round(getCrimeHeatmapRadiusForZoom(mapRef.current?.getZoom?.()) * profile.radiusScale));
    const incidents = Array.isArray(incidentsInput) ? incidentsInput : [];
    const weightedPoints = incidents
      .map((incident) => {
        const lat = Number(incident?.lat);
        const lng = Number(incident?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          location: new window.google.maps.LatLng(lat, lng),
          weight: getCrimeCategoryWeight(incident?.incidentCategory) * profile.weightMultiplier
        };
      })
      .filter(Boolean);

    if (!crimeHeatmapRef.current) {
      crimeHeatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
        data: weightedPoints,
        dissipating: true,
        radius,
        opacity: profile.opacity,
        maxIntensity: profile.maxIntensity,
        gradient: CRIME_HEATMAP_GRADIENT
      });
    } else {
      crimeHeatmapRef.current.setData(weightedPoints);
      crimeHeatmapRef.current.set('radius', radius);
      crimeHeatmapRef.current.set('opacity', profile.opacity);
      crimeHeatmapRef.current.set('maxIntensity', profile.maxIntensity);
    }
    crimeHeatmapRef.current.setMap(hiddenCategoriesRef.current.has('crime') ? null : mapRef.current);

    const resolvedGeneratedAt = String(generatedAtValue || new Date().toISOString());
    setCrimeLayerMeta({
      loading: false,
      count: incidents.length,
      hours: hoursValue,
      generatedAt: resolvedGeneratedAt,
      error: ''
    });
  }, [mapsReady, crimeHeatmapStrength]);

  const refreshCrimeHeatmap = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!mapsReady || !mapRef.current || !window.google?.maps?.visualization) return;
    const boundsQuery = buildCrimeBoundsQuery(mapRef.current);
    const requestPath = `/api/crime?hours=${crimeLookbackHours}&limit=${CRIME_HEATMAP_LIMIT}${boundsQuery ? `&${boundsQuery}` : ''}`;
    const now = Date.now();
    if (!force) {
      const sameQuery = requestPath === lastCrimeQueryRef.current;
      const recentlyFetched = now - lastCrimeFetchAtRef.current < CRIME_MIN_REQUEST_INTERVAL_MS;
      if (sameQuery && recentlyFetched) return;
    }
    lastCrimeQueryRef.current = requestPath;
    lastCrimeFetchAtRef.current = now;
    setCrimeLayerMeta((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const response = await fetch(requestPath);
      const payload = await response.json().catch(() => null);
      if (lastCrimeQueryRef.current !== requestPath) return;
      if (!response.ok) {
        throw new Error(payload?.error || `Crime data request failed: ${response.status}`);
      }
      const incidents = Array.isArray(payload?.incidents) ? payload.incidents : [];
      const responseHours = Number(payload?.hours);
      applyCrimeHeatmapData(
        incidents,
        String(payload?.generatedAt || new Date().toISOString()),
        isCrimeLookbackHoursOption(responseHours) ? responseHours : crimeLookbackHours
      );
    } catch (error) {
      console.error('Crime heatmap refresh failed.', error);
      if (lastCrimeQueryRef.current !== requestPath) return;
      setCrimeLayerMeta((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh crime layer.'
      }));
    }
  }, [mapsReady, applyCrimeHeatmapData, crimeLookbackHours]);

  const applyRoutePolylineStyle = useCallback((isUpdating) => {
    if (!routePolylineRef.current) return;
    if (isUpdating) {
      routePolylineRef.current.setOptions({
        strokeOpacity: 0,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }]
      });
      return;
    }
    routePolylineRef.current.setOptions({ strokeOpacity: 0.86, icons: [] });
  }, []);

  const geocode = useCallback(async (address) => {
    if (!address || !window.google?.maps) return null;
    const addressKey = normalizeAddressKey(address);
    if (addressKey) {
      const cached = geocodeStoreRef.current.get(addressKey);
      if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
        return new window.google.maps.LatLng(cached.lat, cached.lng);
      }
    }

    const requestKey = addressKey || String(address);
    return getOrCreateCoalescedPromise(geocodeInFlightRef.current, requestKey, async () => {
      if (addressKey) {
        const cached = geocodeStoreRef.current.get(addressKey);
        if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lng)) {
          return new window.google.maps.LatLng(cached.lat, cached.lng);
        }
      }

      try {
        const response = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) return null;
        const lat = Number(payload?.lat);
        const lng = Number(payload?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (addressKey) {
          geocodeStoreRef.current.set(addressKey, { lat, lng });
          saveGeocodeCache();
        }
        return new window.google.maps.LatLng(lat, lng);
      } catch {
        return null;
      }
    });
  }, [saveGeocodeCache]);

  const parseLatLngFromMapUrl = useCallback((url) => {
    if (!url || !window.google?.maps) return null;
    try {
      const parsedUrl = new URL(url);
      const qv = parsedUrl.searchParams.get('query') || '';
      const parts = qv.split(',').map((p) => Number(p));
      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return new window.google.maps.LatLng(parts[0], parts[1]);
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const resolvePosition = useCallback(
    async ({ cacheKey, mapLink, fallbackLocation, lat, lng }) => {
      const cached = positionCacheRef.current.get(cacheKey);
      if (cached) return cached;
      return getOrCreateCoalescedPromise(positionInFlightRef.current, cacheKey, async () => {
        const existing = positionCacheRef.current.get(cacheKey);
        if (existing) return existing;

        if (Number.isFinite(lat) && Number.isFinite(lng) && window.google?.maps) {
          const pos = new window.google.maps.LatLng(lat, lng);
          positionCacheRef.current.set(cacheKey, pos);
          return pos;
        }

        const fromMap = parseLatLngFromMapUrl(mapLink);
        if (fromMap) {
          positionCacheRef.current.set(cacheKey, fromMap);
          return fromMap;
        }

        const addressKey = normalizeAddressKey(fallbackLocation);
        if (addressKey) {
          const cc = geocodeStoreRef.current.get(addressKey);
          if (cc && Number.isFinite(cc.lat) && Number.isFinite(cc.lng) && window.google?.maps) {
            const pos = new window.google.maps.LatLng(cc.lat, cc.lng);
            positionCacheRef.current.set(cacheKey, pos);
            return pos;
          }
        }

        const geocoded = await geocode(fallbackLocation);
        if (geocoded) {
          positionCacheRef.current.set(cacheKey, geocoded);
          if (addressKey) {
            geocodeStoreRef.current.set(addressKey, { lat: geocoded.lat(), lng: geocoded.lng() });
            saveGeocodeCache();
          }
        }
        return geocoded;
      });
    },
    [geocode, parseLatLngFromMapUrl, saveGeocodeCache]
  );

  const distanceMatrixRequest = useCallback(async (request: any): Promise<any> => {
    if (!distanceMatrixRef.current) return null;
    return new Promise<any>((resolve, reject) => {
      distanceMatrixRef.current.getDistanceMatrix(request, (response, sv) => {
        if (sv !== 'OK') { reject(new Error(`Distance matrix error: ${sv}`)); return; }
        resolve(response);
      });
    });
  }, []);

  const getCurrentMapBoundsLiteral = useCallback(() => {
    const bounds = mapRef.current?.getBounds?.();
    const ne = bounds?.getNorthEast?.();
    const sw = bounds?.getSouthWest?.();
    if (!ne || !sw) return null;
    const north = Number(ne.lat?.());
    const east = Number(ne.lng?.());
    const south = Number(sw.lat?.());
    const west = Number(sw.lng?.());
    if (![north, east, south, west].every(Number.isFinite)) return null;
    return { north, east, south, west };
  }, []);

  const fitMapToVisiblePoints = useCallback((evts, places) => {
    if (!mapRef.current || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    let points = 0;
    if (baseLatLngRef.current) { bounds.extend(baseLatLngRef.current); points += 1; }
    if (deviceLocationLatLngRef.current) { bounds.extend(deviceLocationLatLngRef.current); points += 1; }
    for (const e of evts) { if (e._position) { bounds.extend(e._position); points += 1; } }
    for (const p of places) { if (p._position) { bounds.extend(p._position); points += 1; } }
    if (points === 0) { mapRef.current.setCenter({ lat: 37.7749, lng: -122.4194 }); mapRef.current.setZoom(13); return; }
    if (points === 1) { mapRef.current.setCenter(bounds.getCenter()); mapRef.current.setZoom(13); return; }
    mapRef.current.fitBounds(bounds, 60);
  }, []);

  const focusMapOnOrigin = useCallback((latLng, zoom = 15) => {
    if (!mapRef.current || !latLng) return;
    mapRef.current.panTo(latLng);
    const currentZoom = Number(mapRef.current.getZoom?.());
    const nextZoom = Number.isFinite(currentZoom) ? Math.max(currentZoom, zoom) : zoom;
    mapRef.current.setZoom(nextZoom);
  }, []);

  const setBaseMarker = useCallback((latLng, title, iconNode = houseIconNode) => {
    if (!mapRef.current || !window.google?.maps?.marker) return;
    baseLatLngRef.current = latLng;
    if (baseMarkerRef.current) baseMarkerRef.current.map = null;
    baseMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
      map: hiddenCategoriesRef.current.has('home') ? null : mapRef.current, position: latLng, title,
      content: createLucidePinIcon(iconNode, '#00FF88')
    });
  }, []);

  const focusSearchResultsOnMap = useCallback((results) => {
    if (!mapRef.current || !window.google?.maps) return;
    const searchResults = Array.isArray(results) ? results : [];
    if (searchResults.length === 0) return;
    if (searchResults.length === 1) {
      const onlyResult = searchResults[0];
      focusMapOnOrigin({ lat: onlyResult.lat, lng: onlyResult.lng }, 14);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    for (const result of searchResults) {
      if (Number.isFinite(result?.lat) && Number.isFinite(result?.lng)) {
        bounds.extend({ lat: result.lat, lng: result.lng });
      }
    }
    mapRef.current.fitBounds(bounds, 80);
  }, [focusMapOnOrigin]);

  const buildSearchResultInfoWindowHtml = useCallback((result, index) => {
    const safeMapLink = getSafeExternalHref(result?.mapLink);
    const types = Array.isArray(result?.types) && result.types.length > 0
      ? result.types.slice(0, 4).join(', ')
      : 'Search result';
    const distanceText = result?.distanceLabel ? `<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Distance:</strong> ${escapeHtml(result.distanceLabel)}</p>` : '';
    const walkText = result?.walkDurationLabel ? `<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Walk:</strong> ${escapeHtml(result.walkDurationLabel)}</p>` : '';

    return `<div class="custom-iw" style="max-width:320px;background:#0A0A0A;color:#FFFFFF;padding:12px;font-family:'JetBrains Mono',monospace;font-size:13px"><p style="margin:0 0 6px;color:#00FF88;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Result ${escapeHtml(String(index + 1))}</p><h3 style="margin:0 0 6px;font-size:16px;color:#FFFFFF">${escapeHtml(result?.name || 'Place')}</h3><p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Location:</strong> ${escapeHtml(result?.location || 'Unknown')}</p>${distanceText}${walkText}<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Suggested tag:</strong> ${escapeHtml(formatTag(result?.suggestedTag || 'eat'))}</p><p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Types:</strong> ${escapeHtml(types)}</p>${safeMapLink ? `<a href="${escapeHtml(safeMapLink)}" target="_blank" rel="noreferrer" style="color:#00FF88;text-decoration:none;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Open map</a>` : ''}</div>`;
  }, []);

  const renderSearchResultMarkers = useCallback((results) => {
    if (!mapRef.current || !window.google?.maps?.marker) return;
    clearSearchResultMarkers();
    const searchResults = Array.isArray(results) ? results : [];

    for (const [index, result] of searchResults.entries()) {
      if (!Number.isFinite(result?.lat) || !Number.isFinite(result?.lng)) {
        continue;
      }
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current,
        position: { lat: result.lat, lng: result.lng },
        title: result.name,
        content: createLucidePinIconWithLabel(mapPinIconNode, activeSearchResultId === result.id ? '#00FF88' : '#FFFFFF', String(index + 1)),
        gmpClickable: true
      });
      marker.addEventListener('gmp-click', () => {
        setActiveSearchResultId(result.id);
        document.getElementById(`search-result-${result.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        if (!infoWindowRef.current) return;
        infoWindowRef.current.setContent(buildSearchResultInfoWindowHtml(result, index));
        infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
      });
      searchResultMarkersRef.current.push(marker);
    }
  }, [activeSearchResultId, buildSearchResultInfoWindowHtml, clearSearchResultMarkers]);

  const setDeviceLocationMarker = useCallback((latLng, title) => {
    if (!mapRef.current || !window.google?.maps?.marker) return;
    deviceLocationLatLngRef.current = latLng;
    if (deviceLocationMarkerRef.current) deviceLocationMarkerRef.current.map = null;
    deviceLocationMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
      map: mapRef.current,
      position: latLng,
      title,
      content: createLucidePinIcon(mapPinIconNode, '#00FF88')
    });
  }, []);

  const getResolvedSearchOrigin = useCallback(async (scopeInput, { visibleArea = false } = {}) => {
    const fallbackPoint = { lat: 37.7749, lng: -122.4194 };
    const scope = String(scopeInput || 'map');

    if (scope === 'near_me') {
      const cachedDevicePoint = toLatLngLiteral(deviceLocationLatLngRef.current);
      if (cachedDevicePoint) {
        return { point: cachedDevicePoint, label: 'Near me', radius: 4500 };
      }
      if (!navigator.geolocation) {
        throw new Error('Location permission is unavailable in this browser.');
      }

      const coords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }),
          reject,
          DEVICE_LOCATION_OPTIONS
        );
      });
      const point = { lat: coords.latitude, lng: coords.longitude };
      deviceLocationLatLngRef.current = point;
      if (mapsReady && window.google?.maps?.marker) {
        setDeviceLocationMarker(point, 'Your current location');
      }
      return { point, label: 'Near me', radius: 4500 };
    }

    if (scope === 'home') {
      const cachedHomePoint = toLatLngLiteral(baseLatLngRef.current);
      if (cachedHomePoint) {
        return { point: cachedHomePoint, label: 'Near home', radius: 7000 };
      }
      if (!baseLocationText) {
        throw new Error('Set your home location before using Near home.');
      }
      const geocodedHome = await geocode(baseLocationText);
      const point = toLatLngLiteral(geocodedHome);
      if (!point) {
        throw new Error('Home location could not be resolved on the map.');
      }
      return { point, label: 'Near home', radius: 7000 };
    }

    const bounds = getCurrentMapBoundsLiteral();
    const centerPoint = toLatLngLiteral(mapRef.current?.getCenter?.()) || toLatLngLiteral(baseLatLngRef.current) || fallbackPoint;
    if (visibleArea && bounds) {
      return {
        point: centerPoint,
        label: 'Visible area',
        radius: getMapBoundsSearchRadius(bounds)
      };
    }
    return {
      point: centerPoint,
      label: 'Map area',
      radius: bounds ? getMapBoundsSearchRadius(bounds) : 12000
    };
  }, [baseLocationText, geocode, getCurrentMapBoundsLiteral, mapsReady, setDeviceLocationMarker]);

  useEffect(() => {
    if (baseMarkerRef.current) {
      baseMarkerRef.current.map = hiddenCategories.has('home') ? null : mapRef.current;
    }
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(hiddenCategories.has('home') ? null : mapRef.current);
    }
    if (deviceLocationMarkerRef.current) {
      deviceLocationMarkerRef.current.map = mapRef.current;
    }
    if (crimeHeatmapRef.current) {
      crimeHeatmapRef.current.setMap(hiddenCategories.has('crime') ? null : mapRef.current);
    }
    if (!hiddenCategories.has('crime')) {
      void refreshCrimeHeatmap({ force: true });
    }
  }, [hiddenCategories, refreshCrimeHeatmap]);

  useEffect(() => {
    if (hiddenCategories.has('crime')) return;
    void refreshCrimeHeatmap({ force: true });
  }, [crimeHeatmapStrength, crimeLookbackHours, hiddenCategories, refreshCrimeHeatmap]);

  const addEventToDayPlan = useCallback((event) => {
    if (!selectedDate) { setStatusMessage('Select a specific date before adding events to your day plan.', true); return; }
    setPlannerByDate((prev) => {
      const current = Array.isArray(prev[selectedDate]) ? prev[selectedDate] : [];
      const timeFromEvent = parseEventTimeRange(event.startDateTimeText);
      const startMinutes = timeFromEvent ? timeFromEvent.startMinutes : 9 * 60;
      const endMinutes = timeFromEvent ? timeFromEvent.endMinutes : startMinutes + 90;
      const next = sortPlanItems([...current, {
        id: createPlanId(), kind: 'event', sourceKey: event.eventUrl,
        title: event.name, locationText: event.address || event.locationText || '',
        link: event.eventUrl, tag: '', startMinutes, endMinutes
      }]);
      return { ...prev, [selectedDate]: next };
    });
  }, [selectedDate, setStatusMessage]);

  const addPlaceToDayPlan = useCallback((place) => {
    const tag = normalizePlaceTag(place.tag);
    if (tag === 'avoid') { setStatusMessage('This area is flagged as unsafe and cannot be added to your day plan.', true); return; }
    if (tag === 'safe' && Array.isArray(place.boundary) && place.boundary.length >= 3) {
      setStatusMessage('Safety overlay regions are informational and cannot be added to your day plan.', true);
      return;
    }
    if (!selectedDate) { setStatusMessage('Select a specific date before adding places to your day plan.', true); return; }
    setPlannerByDate((prev) => {
      const current = Array.isArray(prev[selectedDate]) ? prev[selectedDate] : [];
      const slot = getSuggestedPlanSlot(current, null, 75);
      const next = sortPlanItems([...current, {
        id: createPlanId(), kind: 'place', sourceKey: getPlaceSourceKey(place),
        title: place.name, locationText: place.location || '',
        link: place.mapLink || place.cornerLink || '',
        tag: normalizePlaceTag(place.tag),
        startMinutes: slot.startMinutes, endMinutes: slot.endMinutes
      }]);
      return { ...prev, [selectedDate]: next };
    });
  }, [selectedDate, setStatusMessage]);

  const removePlanItem = useCallback((itemId) => {
    if (!selectedDate) return;
    setPlannerByDate((prev) => {
      const current = Array.isArray(prev[selectedDate]) ? prev[selectedDate] : [];
      return { ...prev, [selectedDate]: current.filter((i) => i.id !== itemId) };
    });
  }, [selectedDate]);

  const clearDayPlan = useCallback(() => {
    if (!selectedDate) return;
    setPlannerByDate((prev) => ({ ...prev, [selectedDate]: [] }));
  }, [selectedDate]);

  const startPlanDrag = useCallback((pointerEvent, item, mode) => {
    if (!selectedDate) return;
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const startY = pointerEvent.clientY;
    const initialStart = item.startMinutes;
    const initialEnd = item.endMinutes;
    const MINUTES_IN_DAY_LOCAL = 24 * 60;
    const MIN_PLAN_BLOCK = 30;
    const MINUTE_HEIGHT = 50 / 60;
    const SNAP = 15;
    const snap = (v) => { if (!Number.isFinite(v)) return 0; return Math.round(v / SNAP) * SNAP; };
    const clamp = (v, min, max) => { if (!Number.isFinite(v)) return min; return Math.min(max, Math.max(min, Math.round(v))); };

    setActivePlanId(item.id);
    const onMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaMinutes = snap(deltaY / MINUTE_HEIGHT);
      const duration = Math.max(MIN_PLAN_BLOCK, initialEnd - initialStart);
      setPlannerByDate((prev) => {
        const current = Array.isArray(prev[selectedDate]) ? prev[selectedDate] : [];
        const idx = current.findIndex((c) => c.id === item.id);
        if (idx < 0) return prev;
        const target = current[idx];
        let nextStart = target.startMinutes;
        let nextEnd = target.endMinutes;
        if (mode === 'move') { nextStart = clamp(initialStart + deltaMinutes, 0, MINUTES_IN_DAY_LOCAL - duration); nextEnd = nextStart + duration; }
        else if (mode === 'resize-start') { nextStart = clamp(initialStart + deltaMinutes, 0, initialEnd - MIN_PLAN_BLOCK); nextEnd = initialEnd; }
        else if (mode === 'resize-end') { nextStart = initialStart; nextEnd = clamp(initialEnd + deltaMinutes, initialStart + MIN_PLAN_BLOCK, MINUTES_IN_DAY_LOCAL); }
        const updated = { ...target, startMinutes: snap(nextStart), endMinutes: snap(nextEnd) };
        const next = [...current];
        next[idx] = updated;
        return { ...prev, [selectedDate]: sortPlanItems(next) };
      });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); setActivePlanId(''); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [selectedDate]);

  const calculateTravelTimes = useCallback(async (evtsWithPositions: any[], activeTravelMode: string) => {
    if (!baseLatLngRef.current || !distanceMatrixRef.current) return evtsWithPositions;
    const withLocation = evtsWithPositions.filter((e) => e._position);
    if (!withLocation.length) return evtsWithPositions;
    const travelModeValue = window.google.maps.TravelMode[activeTravelMode];
    const baseKey = toCoordinateKey(baseLatLngRef.current);
    if (!travelModeValue || !baseKey) return evtsWithPositions;

    const enriched = new Map<string, any>(evtsWithPositions.map((e) => [e.eventUrl, { ...e }]));
    const missing: any[] = [];
    for (const e of withLocation) {
      const dk = toCoordinateKey(e._position);
      if (!dk) { missing.push(e); continue; }
      const ck = createTravelTimeCacheKey({ travelMode: activeTravelMode, baseKey, destinationKey: dk });
      const cached = travelTimeCacheRef.current.get(ck);
      if (typeof cached === 'string') { const t = enriched.get(e.eventUrl); if (t) t.travelDurationText = cached; }
      else missing.push(e);
    }

    const chunkSize = 25;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const response = await distanceMatrixRequest({
        origins: [baseLatLngRef.current],
        destinations: chunk.map((e) => e._position),
        travelMode: travelModeValue
      });
      const elements = response?.rows?.[0]?.elements || [];
      for (let di = 0; di < chunk.length; di += 1) {
        const ce = chunk[di];
        const el = elements[di];
        const t = enriched.get(ce.eventUrl);
        if (!t) continue;
        const dk = toCoordinateKey(ce._position);
        if (el?.status === 'OK') {
          const dt = el.duration?.text || '';
          t.travelDurationText = dt;
          if (dk) travelTimeCacheRef.current.set(createTravelTimeCacheKey({ travelMode: activeTravelMode, baseKey, destinationKey: dk }), dt);
        } else {
          t.travelDurationText = 'Unavailable';
          if (dk) travelTimeCacheRef.current.set(createTravelTimeCacheKey({ travelMode: activeTravelMode, baseKey, destinationKey: dk }), 'Unavailable');
        }
      }
    }
    if (travelTimeCacheRef.current.size > 4000) travelTimeCacheRef.current.clear();
    return evtsWithPositions.map((e) => enriched.get(e.eventUrl) || e);
  }, [distanceMatrixRequest]);

  const buildEventInfoWindowHtml = useCallback((event, plannerAction) => {
    const location = event.address || event.locationText || 'Location not listed';
    const time = event.startDateTimeText || 'Time not listed';
    const travel = event.travelDurationText || 'Pending';
    const days = daysFromNow(event.startDateISO);
    const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
    const sourceLabel = formatSourceLabel(event.sourceUrl);
    const safeEventUrl = getSafeExternalHref(event.eventUrl);
    const sourceLine = sourceLabel ? `<p style="margin:4px 0"><strong>Source:</strong> ${escapeHtml(sourceLabel)}</p>` : '';
    const eventLink = safeEventUrl
      ? `<a href="${escapeHtml(safeEventUrl)}" target="_blank" rel="noreferrer" style="color:#00FF88;text-decoration:none;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Open event</a>`
      : '';
    return `<div class="custom-iw" style="max-width:330px;background:#0A0A0A;color:#FFFFFF;padding:12px;font-family:'JetBrains Mono',monospace;font-size:13px"><h3 style="margin:0 0 6px;font-size:16px;color:#FFFFFF">${escapeHtml(event.name)}</h3><p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Time:</strong> ${escapeHtml(time)} <span style="color:#6a6a6a;font-size:12px">(${escapeHtml(daysLabel)})</span></p><p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Location:</strong> ${escapeHtml(location)}</p><p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Travel time:</strong> ${escapeHtml(travel)}</p>${sourceLine}<p style="margin:4px 0;color:#8a8a8a">${escapeHtml(truncate(event.description || '', 220))}</p>${buildInfoWindowAddButton(plannerAction)}${eventLink}</div>`;
  }, []);

  const buildPlaceInfoWindowHtml = useCallback((place, plannerAction, options?: any) => {
    const photoGallery = Array.isArray(options?.photoGallery) ? options.photoGallery : [];
    const activePhotoIndex = Number.isFinite(options?.activePhotoIndex) ? options.activePhotoIndex : 0;
    const photoControlIds = options?.photoControlIds || null;
    const displayTag = formatTag(normalizePlaceTag(place.tag));
    const placeTag = normalizePlaceTag(place.tag);
    const isAvoid = placeTag === 'avoid';
    const isSafe = placeTag === 'safe';
    const risk = place.risk || 'medium';
    const isExtreme = risk === 'extreme';
    const isHigh = risk === 'high';
    const avoidBannerBg = isExtreme ? 'rgba(255,68,68,0.2)' : isHigh ? 'rgba(255,68,68,0.15)' : 'rgba(255,68,68,0.08)';
    const avoidBannerColor = '#FFD6D6';
    const avoidBannerBorder = 'rgba(255,68,68,0.3)';
    const avoidBannerText = isExtreme ? 'DO NOT VISIT: extremely dangerous area' : isHigh ? 'High-risk area: avoid if possible' : risk === 'medium-high' ? 'Medium-high risk: be cautious' : 'Exercise caution in this area';
    const avoidCrimeTypeLine = place.crimeTypes ? `<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">Common crimes: ${escapeHtml(place.crimeTypes)}</div>` : '';
    const safeHighlightsLine = place.safetyHighlights ? `<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">${escapeHtml(place.safetyHighlights)}</div>` : '<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">Generally lower violent-crime profile than city average.</div>';
    const safeCrimeTypeLine = place.crimeTypes ? `<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">Still watch for: ${escapeHtml(place.crimeTypes)}</div>` : '';
    const safeBanner = isSafe
      ? `<div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.25);border-radius:0;padding:8px 10px;margin-bottom:8px;color:#00FF88;font-size:13px;font-weight:600">Safer area${safeHighlightsLine}${safeCrimeTypeLine}</div>`
      : '';
    const avoidBanner = isAvoid
      ? `<div style="background:${avoidBannerBg};border:1px solid ${avoidBannerBorder};border-radius:0;padding:8px 10px;margin-bottom:8px;color:${avoidBannerColor};font-size:13px;font-weight:600">${avoidBannerText}${avoidCrimeTypeLine}</div>`
      : '';
    const addButton = isAvoid || isSafe ? '' : buildInfoWindowAddButton(plannerAction);
    const safeMapLink = getSafeExternalHref(place.mapLink);
    const safeCornerLink = getSafeExternalHref(place.cornerLink);
    const recommendedBy = Array.isArray(place.recommendedBy) ? place.recommendedBy.filter(Boolean) : [];
    const firstRecommendationNote = Array.isArray(place.recommendations)
      ? String(place.recommendations.find((recommendation) => recommendation?.note)?.note || '').trim()
      : '';
    const firstRecommendationFriendUrl = Array.isArray(place.recommendations)
      ? getSafeExternalHref(place.recommendations.find((recommendation) => recommendation?.friendUrl)?.friendUrl)
      : '';
    const linkRow = (safeMapLink || safeCornerLink)
      ? `<div style="display:flex;gap:10px;flex-wrap:wrap">${safeMapLink ? `<a href="${escapeHtml(safeMapLink)}" target="_blank" rel="noreferrer" style="color:#00FF88;text-decoration:none;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Open map</a>` : ''}${safeCornerLink ? `<a href="${escapeHtml(safeCornerLink)}" target="_blank" rel="noreferrer" style="color:#00FF88;text-decoration:none;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Corner page</a>` : ''}</div>`
      : '';
    const photoHtml = buildPlacePhotoGalleryHtml({
      placeName: place.name,
      photoGallery,
      activeIndex: activePhotoIndex,
      controlIds: photoControlIds || undefined
    });
    return `<div class="custom-iw" style="max-width:340px;background:#0A0A0A;color:#FFFFFF;padding:12px;font-family:'JetBrains Mono',monospace;font-size:13px">${avoidBanner}${safeBanner}<h3 style="margin:0 0 6px;font-size:16px;color:#FFFFFF">${escapeHtml(place.name)}</h3>${photoHtml}<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Tag:</strong> ${escapeHtml(displayTag)}</p><p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Location:</strong> ${escapeHtml(place.location || 'Unknown')}</p>${recommendedBy.length > 0 ? `<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Recommended by:</strong> ${escapeHtml(recommendedBy.join(', '))}</p>` : ''}${firstRecommendationFriendUrl ? `<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Credit:</strong> <a href="${escapeHtml(firstRecommendationFriendUrl)}" target="_blank" rel="noreferrer" style="color:#00FF88;text-decoration:none;font-weight:600">View profile</a></p>` : ''}${firstRecommendationNote ? `<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Friend note:</strong> ${escapeHtml(firstRecommendationNote)}</p>` : ''}${place.curatorComment ? `<p style="margin:4px 0;color:#8a8a8a"><strong style="color:#FFFFFF">Curator:</strong> ${escapeHtml(place.curatorComment)}</p>` : ''}${place.description ? `<p style="margin:4px 0;color:#8a8a8a">${escapeHtml(place.description)}</p>` : ''}${place.details ? `<p style="margin:4px 0;color:#8a8a8a">${escapeHtml(place.details)}</p>` : ''}${addButton}${linkRow}</div>`;
  }, []);

  const renderCurrentSelection = useCallback(
    async (eventsInput, placesInput, dateFilter, activeTravelMode, shouldFitBounds = true) => {
      if (!mapsReady || !window.google?.maps || !mapRef.current) return;
      const renderGeneration = renderGenerationRef.current + 1;
      renderGenerationRef.current = renderGeneration;
      const isStaleRender = () => renderGenerationRef.current !== renderGeneration;
      clearMapMarkers();
      const filteredEvents = (dateFilter
        ? eventsInput.filter((e) => normalizeDateKey(e.startDateISO) === dateFilter)
        : [...eventsInput]
      ).filter((e) => daysFromNow(e.startDateISO) >= 0);

      const evtsWithPositions = await mapAsyncInParallel(filteredEvents, async (event: any) => {
        const position = await resolvePosition({
          cacheKey: `event:${event.eventUrl}`, mapLink: event.googleMapsUrl,
          fallbackLocation: event.address || event.locationText, lat: event.lat, lng: event.lng
        });
        return { ...event, _position: position, travelDurationText: '' };
      });
      if (isStaleRender()) return;
      for (const ewp of evtsWithPositions) {
        if (isStaleRender()) return;
        const position = ewp._position;
        if (position) {
          const days = daysFromNow(ewp.startDateISO);
          const dayLabel = days === 0 ? 'today' : `${days}d`;
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map: mapRef.current, position, title: ewp.name,
            content: createLucidePinIconWithLabel(calendarIconNode, '#FF8800', dayLabel),
            gmpClickable: true
          });
          marker.addEventListener('gmp-click', () => {
            if (!infoWindowRef.current) return;
            activePlaceInfoWindowKeyRef.current = '';
            const addActionId = selectedDate ? `add-${createPlanId()}` : '';
            const plannerAction = {
              id: addActionId,
              label: selectedDate ? `Add to ${formatDateDayMonth(selectedDate)}` : 'Pick planner date first',
              enabled: Boolean(selectedDate)
            };
            infoWindowRef.current.setContent(buildEventInfoWindowHtml(ewp, plannerAction));
            infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
            if (addActionId && window.google?.maps?.event) {
              window.google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
                const btn = document.getElementById(addActionId);
                if (!btn) return;
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  addEventToDayPlan(ewp);
                  setStatusMessage(`Added "${ewp.name}" to ${formatDate(selectedDate)}.`);
                });
              });
            }
          });
          markersRef.current.push(marker);
        }
      }

      const placesWithPositions = await mapAsyncInParallel(placesInput, async (place: any) => {
        const position = await resolvePosition({
          cacheKey: `place:${place.id || place.name}`, mapLink: place.mapLink,
          fallbackLocation: place.location, lat: place.lat, lng: place.lng
        });
        return { ...place, _position: position, tag: normalizePlaceTag(place.tag) };
      });
      if (isStaleRender()) return;
      for (const pwp of placesWithPositions) {
        if (isStaleRender()) return;
        const position = pwp._position;
        const hasBoundary = Array.isArray(pwp.boundary) && pwp.boundary.length >= 3;
        const isRegion = hasBoundary && (pwp.tag === 'avoid' || pwp.tag === 'safe');
        if (isRegion) {
          const regionStyle = (() => {
            if (pwp.tag === 'avoid') {
              const risk = pwp.risk || 'medium';
              if (risk === 'extreme') return { fill: '#FF4444', fillOpacity: 0.32, strokeOpacity: 0.85, strokeWeight: 3 };
              if (risk === 'high') return { fill: '#FF4444', fillOpacity: 0.22, strokeOpacity: 0.7, strokeWeight: 2.5 };
              if (risk === 'medium-high') return { fill: '#FF4444', fillOpacity: 0.15, strokeOpacity: 0.55, strokeWeight: 2 };
              return { fill: '#FF4444', fillOpacity: 0.08, strokeOpacity: 0.4, strokeWeight: 1.5 };
            }
            const safetyLevel = pwp.safetyLevel || 'high';
            if (safetyLevel === 'very-high') return { fill: '#00FF88', fillOpacity: 0.20, strokeOpacity: 0.78, strokeWeight: 2.5 };
            if (safetyLevel === 'high') return { fill: '#00FF88', fillOpacity: 0.14, strokeOpacity: 0.62, strokeWeight: 2 };
            return { fill: '#00FF88', fillOpacity: 0.10, strokeOpacity: 0.5, strokeWeight: 1.8 };
          })();
          const polygon = new window.google.maps.Polygon({
            map: mapRef.current,
            paths: pwp.boundary,
            fillColor: regionStyle.fill,
            fillOpacity: regionStyle.fillOpacity,
            strokeColor: regionStyle.fill,
            strokeOpacity: regionStyle.strokeOpacity,
            strokeWeight: regionStyle.strokeWeight,
            zIndex: pwp.tag === 'avoid' ? 30 : 20
          });
          polygon.addListener('click', (event: any) => {
            if (!infoWindowRef.current) return;
            activePlaceInfoWindowKeyRef.current = '';
            const plannerAction = { id: '', label: '', enabled: false };
            infoWindowRef.current.setContent(buildPlaceInfoWindowHtml(pwp, plannerAction));
            infoWindowRef.current.setPosition(event.latLng || position);
            infoWindowRef.current.open(mapRef.current);
          });
          regionPolygonsRef.current.push(polygon);
          if (position) {
            const detailText = pwp.tag === 'avoid'
              ? pwp.crimeTypes || ''
              : pwp.safetyLabel || pwp.safetyHighlights || 'Lower violent-crime profile';
            const labelEl = document.createElement('div');
            const isAvoidTag = pwp.tag === 'avoid';
            const risk = pwp.risk || 'medium';
            const isExtreme = risk === 'extreme';
            const isHighRisk = risk === 'high';
            const bgColor = isAvoidTag
              ? (isExtreme ? 'rgba(255,68,68,0.25)' : isHighRisk ? 'rgba(255,68,68,0.18)' : 'rgba(255,68,68,0.10)')
              : 'rgba(0,255,136,0.10)';
            const textColor = isAvoidTag ? '#FFD6D6' : '#00FF88';
            const borderColor = isAvoidTag ? 'rgba(255,68,68,0.4)' : 'rgba(0,255,136,0.3)';
            const labelPrefix = isAvoidTag ? '⚠' : '✓';
            labelEl.style.cssText = `font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${textColor};background:${bgColor};padding:3px 7px;border-radius:0;border:1px solid ${borderColor};white-space:nowrap;pointer-events:none;text-align:center;line-height:1.4;`;
            labelEl.innerHTML = `${labelPrefix} ${escapeHtml(pwp.name)}${detailText ? `<br><span style="font-size:10px;font-weight:500;opacity:0.9">${escapeHtml(detailText)}</span>` : ''}`;
            const labelMarker = new window.google.maps.marker.AdvancedMarkerElement({
              map: mapRef.current, position, content: labelEl, gmpClickable: false, zIndex: isAvoidTag ? 40 : 25
            });
            markersRef.current.push(labelMarker);
          }
        } else if (position) {
          const recommendationCount = Array.isArray(pwp.recommendedBy) ? pwp.recommendedBy.length : 0;
          const recommendationLabel = recommendationCount > 1
              ? `+${recommendationCount}`
              : recommendationCount === 1
              ? String(pwp.recommendedBy[0] || '').trim().charAt(0).toUpperCase()
              : '';
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map: mapRef.current, position, title: pwp.name,
            content: recommendationLabel
              ? createLucidePinIconWithLabel(getTagIconNode(pwp.tag), getTagColor(pwp.tag), recommendationLabel)
              : createLucidePinIcon(getTagIconNode(pwp.tag), getTagColor(pwp.tag)),
            gmpClickable: true
          });
          marker.addEventListener('gmp-click', () => {
            if (!infoWindowRef.current) return;
            const addActionId = selectedDate ? `add-${createPlanId()}` : '';
            const photoCacheKey = createPlacePhotoCacheKey(pwp);
            const photoControlIds = {
              previous: `place-photo-prev-${createPlanId()}`,
              next: `place-photo-next-${createPlanId()}`
            };
            activePlaceInfoWindowKeyRef.current = photoCacheKey;
            placePhotoGalleryIndexRef.current.set(photoCacheKey, 0);
            const plannerAction = {
              id: addActionId,
              label: selectedDate ? `Add to ${formatDateDayMonth(selectedDate)}` : 'Pick planner date first',
              enabled: Boolean(selectedDate)
            };
            const renderPlaceInfoWindow = (gallery) => {
              const activePhotoIndex = placePhotoGalleryIndexRef.current.get(photoCacheKey) || 0;
              infoWindowRef.current.setContent(buildPlaceInfoWindowHtml(pwp, plannerAction, {
                photoGallery: gallery,
                activePhotoIndex,
                photoControlIds
              }));
              infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
            };
            const wireInfoWindowActions = (gallery) => {
              const hasGalleryControls = Array.isArray(gallery) && gallery.length > 1;
              if ((addActionId || hasGalleryControls) && window.google?.maps?.event) {
                window.google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
                  const btn = document.getElementById(addActionId);
                  if (btn) {
                    btn.addEventListener('click', (e) => {
                      e.preventDefault();
                      addPlaceToDayPlan(pwp);
                      setStatusMessage(`Added "${pwp.name}" to ${formatDate(selectedDate)}.`);
                    });
                  }
                  const previousBtn = document.getElementById(photoControlIds.previous);
                  if (previousBtn && Array.isArray(gallery) && gallery.length > 1) {
                    previousBtn.addEventListener('click', (e) => {
                      e.preventDefault();
                      placePhotoGalleryIndexRef.current.set(
                        photoCacheKey,
                        getNextPlacePhotoIndex(placePhotoGalleryIndexRef.current.get(photoCacheKey) || 0, -1, gallery.length)
                      );
                      renderPlaceInfoWindow(gallery);
                      wireInfoWindowActions(gallery);
                    });
                  }
                  const nextBtn = document.getElementById(photoControlIds.next);
                  if (nextBtn && Array.isArray(gallery) && gallery.length > 1) {
                    nextBtn.addEventListener('click', (e) => {
                      e.preventDefault();
                      placePhotoGalleryIndexRef.current.set(
                        photoCacheKey,
                        getNextPlacePhotoIndex(placePhotoGalleryIndexRef.current.get(photoCacheKey) || 0, 1, gallery.length)
                      );
                      renderPlaceInfoWindow(gallery);
                      wireInfoWindowActions(gallery);
                    });
                  }
                });
              }
            };
            const cachedPhotoGallery = placePhotoCacheRef.current.get(photoCacheKey) || [];
            renderPlaceInfoWindow(cachedPhotoGallery);
            wireInfoWindowActions(cachedPhotoGallery);
            if (!placePhotoCacheRef.current.has(photoCacheKey) && position) {
              fetchPlacePhotoGallery(pwp.name, { lat: position.lat, lng: position.lng }).then((gallery) => {
                placePhotoCacheRef.current.set(photoCacheKey, gallery);
                if (infoWindowRef.current && activePlaceInfoWindowKeyRef.current === photoCacheKey) {
                  infoWindowRef.current.close();
                  renderPlaceInfoWindow(gallery);
                  wireInfoWindowActions(gallery);
                }
              });
            }
          });
          markersRef.current.push(marker);
        }
      }

      try {
        const evtsWithTravel = await calculateTravelTimes(evtsWithPositions, activeTravelMode);
        if (isStaleRender()) return;
        setVisibleEvents(evtsWithTravel);
        setVisiblePlaces(placesWithPositions);
        if (shouldFitBounds) fitMapToVisiblePoints(evtsWithTravel, placesWithPositions);
      } catch (error) {
        if (isStaleRender()) return;
        setStatusMessage(error instanceof Error ? error.message : 'Could not calculate travel times.', true);
        setVisibleEvents(evtsWithPositions);
        setVisiblePlaces(placesWithPositions);
        if (shouldFitBounds) fitMapToVisiblePoints(evtsWithPositions, placesWithPositions);
      }
    },
    [mapsReady, buildEventInfoWindowHtml, buildPlaceInfoWindowHtml, calculateTravelTimes,
     clearMapMarkers, fitMapToVisiblePoints, resolvePosition,
     addEventToDayPlan, addPlaceToDayPlan, selectedDate, setStatusMessage]
  );

  // ---- Bootstrap ----
  useEffect(() => {
    let mounted = true;

    async function runBackgroundSync() {
      setIsSyncing(true);
      try {
        const response = await fetch('/api/sync', { method: 'POST' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Sync failed');
        if (!mounted) return;

        const syncedEvents = Array.isArray(payload?.events) ? payload.events : [];
        setAllEvents(syncedEvents);
        if (Array.isArray(payload?.places)) setAllPlaces(payload.places);

        const ingestionErrors = Array.isArray(payload?.meta?.ingestionErrors) ? payload.meta.ingestionErrors : [];
        if (ingestionErrors.length > 0) console.error('Sync ingestion errors:', ingestionErrors);
        await loadSourcesFromServer();

        const errSuffix = ingestionErrors.length > 0 ? ` (${ingestionErrors.length} ingestion errors)` : '';
        setStatusMessage(`Synced ${syncedEvents.length} events at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })}${errSuffix}.`, ingestionErrors.length > 0);
      } catch (error) {
        console.error('Background sync failed; continuing with cached events.', error);
      } finally {
        if (mounted) setIsSyncing(false);
      }
    }

    async function bootstrapData() {
      setIsInitializing(true);
      try {
        const [config, eventsPayload, sourcesPayload, mePayload] = await Promise.all([
          fetchJson('/api/config'),
          fetchJson('/api/events'),
          fetchJson('/api/sources').catch(() => ({ sources: [] })),
          fetchJson('/api/me').catch(() => null)
        ]);
        if (!mounted) return;
        const nextProfile = mePayload?.profile || null;
        const nextUserId = String(nextProfile?.userId || '');
        setProfile(nextProfile);
        setAuthUserId(nextUserId);
        setMapsBrowserKey(String(config.mapsBrowserKey || ''));
        setMapsMapId(String(config.mapsMapId || ''));
        setTripStart(config.tripStart || '');
        setTripEnd(config.tripEnd || '');
        setBaseLocationText(config.baseLocation || '');
        setShowSharedPlaceRecommendations(config.showSharedPlaceRecommendations ?? true);
        const loadedEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
        const loadedPlaces = Array.isArray(eventsPayload.places) ? eventsPayload.places : [];
        const loadedSources = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : [];
        setAllEvents(loadedEvents);
        setAllPlaces(loadedPlaces);
        setSources(loadedSources);
        void runBackgroundSync();

        const sampleNote = eventsPayload?.meta?.sampleData ? ' Showing sample data until you sync.' : '';
        setStatusMessage(`Loaded ${loadedEvents.length} events and ${loadedPlaces.length} curated places.${sampleNote}`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Failed to initialize app.', true);
      } finally {
        if (mounted) setIsInitializing(false);
      }
    }

    void bootstrapData();
    return () => {
      mounted = false;
    };
  }, [loadSourcesFromServer, setStatusMessage]);

  useEffect(() => {
    if (mapRuntimeActive) return;
    cleanupMapRuntime();
  }, [cleanupMapRuntime, mapRuntimeActive]);

  useEffect(() => {
    return () => {
      cleanupMapRuntime();
    };
  }, [cleanupMapRuntime]);

  useEffect(() => {
    if (!mapRuntimeActive || mapsReady || mapRef.current || !mapElementRef.current || isInitializing) {
      return;
    }

    let cancelled = false;

    async function initializeMapRuntime() {
      try {
        if (!mapsBrowserKey) {
          setStatusMessage('Missing GOOGLE_MAPS_BROWSER_KEY in .env. Map cannot load.', true);
          return;
        }
        await loadGoogleMapsScript(mapsBrowserKey);
        await Promise.all([
          window.google.maps.importLibrary('marker'),
          window.google.maps.importLibrary('visualization')
        ]);
        if (cancelled || !mapElementRef.current || !window.google?.maps) return;
        mapRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: { lat: 37.7749, lng: -122.4194 }, zoom: 13,
          mapId: mapsMapId || 'DEMO_MAP_ID',
          colorScheme: 'DARK',
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
          restriction: {
            latLngBounds: { north: 37.85, south: 37.68, west: -122.55, east: -122.33 },
            strictBounds: false
          }
        });
        distanceMatrixRef.current = new window.google.maps.DistanceMatrixService();
        infoWindowRef.current = new window.google.maps.InfoWindow();
        setMapsReady(true);
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : 'Failed to initialize map runtime.', true);
        }
      }
    }

    void initializeMapRuntime();
    return () => {
      cancelled = true;
    };
  }, [
    isInitializing,
    mapRuntimeActive,
    mapsBrowserKey,
    mapsMapId,
    mapsReady,
    setStatusMessage
  ]);

  useEffect(() => {
    if (!mapsReady || !window.google?.maps || !mapRef.current) return;
    let cancelled = false;

    async function syncBaseMarker() {
      if (!baseLocationText) return;
      const geocodedBase = await geocode(baseLocationText);
      if (cancelled || !mapRef.current || !geocodedBase) return;
      setBaseMarker(geocodedBase, `Base location: ${baseLocationText}`);
    }

    void syncBaseMarker();
    return () => {
      cancelled = true;
    };
  }, [baseLocationText, geocode, mapsReady, setBaseMarker]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current || placeSearchResults.length === 0) return;
    renderSearchResultMarkers(placeSearchResults);
  }, [mapsReady, placeSearchResults, renderSearchResultMarkers]);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    if (searchAreaIdleListenerRef.current?.remove) {
      searchAreaIdleListenerRef.current.remove();
      searchAreaIdleListenerRef.current = null;
    }
    searchAreaIdleListenerRef.current = mapRef.current.addListener('idle', () => {
      if (skipNextSearchAreaIdleRef.current) {
        skipNextSearchAreaIdleRef.current = false;
        return;
      }
      if (mapSearchScope === 'map' && mapSearchQuery.trim()) {
        setMapSearchAreaDirty(true);
      }
    });

    return () => {
      if (searchAreaIdleListenerRef.current?.remove) {
        searchAreaIdleListenerRef.current.remove();
        searchAreaIdleListenerRef.current = null;
      }
    };
  }, [mapSearchQuery, mapSearchScope, mapsReady]);

  useEffect(() => {
    if (placeSearchResults.length === 0) return;
    setPlaceSearchResults((prev) => sortPlaceSearchResults(prev, mapSearchSort));
  }, [mapSearchSort, placeSearchResults.length]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSources([]);
      return;
    }

    let cancelled = false;

    async function loadPersonalData() {
      try {
        const [eventsPayload, sourcesPayload] = await Promise.all([
          fetchJson('/api/events'),
          fetchJson('/api/sources').catch(() => ({ sources: [] }))
        ]);
        if (cancelled) {
          return;
        }

        const loadedEvents = Array.isArray(eventsPayload?.events) ? eventsPayload.events : [];
        const loadedPlaces = Array.isArray(eventsPayload?.places) ? eventsPayload.places : [];
        const loadedSources = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : [];
        setAllEvents(loadedEvents);
        setAllPlaces(loadedPlaces);
        setSources(loadedSources);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load personal events/sources.', error);
        }
      }
    }

    void loadPersonalData();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!mapsReady || !window.google?.maps?.visualization || !mapRef.current) return;
    let cancelled = false;
    let idleDebounceTimer: number | null = null;
    void refreshCrimeHeatmap({ force: true });

    if (crimeIdleListenerRef.current?.remove) {
      crimeIdleListenerRef.current.remove();
      crimeIdleListenerRef.current = null;
    }
    crimeIdleListenerRef.current = mapRef.current.addListener('idle', () => {
      if (cancelled) return;
      if (idleDebounceTimer) window.clearTimeout(idleDebounceTimer);
      idleDebounceTimer = window.setTimeout(() => {
        if (cancelled) return;
        void refreshCrimeHeatmap();
      }, CRIME_IDLE_DEBOUNCE_MS);
    });

    crimeRefreshTimerRef.current = window.setInterval(() => {
      if (cancelled) return;
      void refreshCrimeHeatmap({ force: true });
    }, CRIME_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (idleDebounceTimer) {
        window.clearTimeout(idleDebounceTimer);
        idleDebounceTimer = null;
      }
      if (crimeIdleListenerRef.current?.remove) {
        crimeIdleListenerRef.current.remove();
        crimeIdleListenerRef.current = null;
      }
      if (crimeRefreshTimerRef.current) {
        window.clearInterval(crimeRefreshTimerRef.current);
        crimeRefreshTimerRef.current = null;
      }
      if (crimeHeatmapRef.current) {
        crimeHeatmapRef.current.setMap(null);
        crimeHeatmapRef.current = null;
      }
    };
  }, [mapsReady, refreshCrimeHeatmap]);

  // ---- Re-render on filter changes ----
  useEffect(() => {
    if (!mapsReady) return;
    const eventsToRender = hiddenCategories.has('event') ? [] : allEvents;
    const placesToRender = filteredPlaces.filter((p) => !hiddenCategories.has(normalizePlaceTag(p.tag)));
    void renderCurrentSelection(eventsToRender, placesToRender, effectiveDateFilter, travelMode, false);
  }, [allEvents, effectiveDateFilter, filteredPlaces, hiddenCategories, mapsReady, renderCurrentSelection, travelMode]);

  // ---- Route drawing ----
  useEffect(() => {
    if (!mapsReady || !window.google?.maps) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => { void drawPlannedRoute(); }, 320);

    async function drawPlannedRoute() {
      if (!mapRef.current) { setIsRouteUpdating(false); return; }
      if (activePlanId) return;
      if (!selectedDate || dayPlanItems.length === 0) { clearRoute(); setRouteSummary(''); return; }
      if (!baseLatLngRef.current) { clearRoute(); setRouteSummary('Set your home location before drawing a route.'); return; }
      const routeStops = plannedRouteStops.slice(0, MAX_ROUTE_STOPS);
      if (routeStops.length === 0) { clearRoute(); setRouteSummary('Route needs map-ready items with known coordinates.'); return; }

      try {
        setIsRouteUpdating(true);
        applyRoutePolylineStyle(true);
        const routeInput = { origin: baseLatLngRef.current, destination: baseLatLngRef.current, waypoints: routeStops.map((s) => s.position), travelMode };
        const cacheKey = createRouteRequestCacheKey(routeInput);
        let route = cacheKey ? plannedRouteCacheRef.current.get(cacheKey) : null;
        if (!route) { route = await requestPlannedRoute(routeInput); if (cacheKey) plannedRouteCacheRef.current.set(cacheKey, route); }
        if (plannedRouteCacheRef.current.size > 1000) plannedRouteCacheRef.current.clear();
        if (cancelled) return;

        if (!routePolylineRef.current) {
          routePolylineRef.current = new window.google.maps.Polyline({
            path: route.path,
            strokeColor: '#00FF88',
            strokeOpacity: 0.86,
            strokeWeight: 5
          });
        } else {
          routePolylineRef.current.setPath(route.path);
        }
        syncRoutePolylineVisibility();
        applyRoutePolylineStyle(false);
        setIsRouteUpdating(false);
        const suffix = plannedRouteStops.length > MAX_ROUTE_STOPS ? ` (showing first ${MAX_ROUTE_STOPS})` : '';
        setRouteSummary(`${routeStops.length} stops${suffix} · ${formatDistance(route.totalDistanceMeters)} · ${formatDurationFromSeconds(route.totalDurationSeconds)}`);
      } catch (error) {
        if (cancelled) return;
        applyRoutePolylineStyle(false);
        setIsRouteUpdating(false);
        setRouteSummary(error instanceof Error ? error.message : 'Could not draw route for the current plan and travel mode.');
      }
    }

    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [activePlanId, applyRoutePolylineStyle, baseLocationVersion, clearRoute, dayPlanItems.length, mapsReady, plannedRouteStops, selectedDate, syncRoutePolylineVisibility, travelMode]);

  // ---- Handlers ----
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setStatusMessage('Syncing latest events...');
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Sync failed');
      }
      const syncedEvents = Array.isArray(payload.events) ? payload.events : [];
      setAllEvents(syncedEvents);
      if (Array.isArray(payload.places)) setAllPlaces(payload.places);
      const ingestionErrors = Array.isArray(payload?.meta?.ingestionErrors) ? payload.meta.ingestionErrors : [];
      if (ingestionErrors.length > 0) console.error('Sync ingestion errors:', ingestionErrors);
      await loadSourcesFromServer();
      const errSuffix = ingestionErrors.length > 0 ? ` (${ingestionErrors.length} ingestion errors)` : '';
      setStatusMessage(`Synced ${syncedEvents.length} events at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })}${errSuffix}.`, ingestionErrors.length > 0);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Sync failed', true);
    } finally {
      setIsSyncing(false);
    }
  }, [loadSourcesFromServer, setStatusMessage]);

  const handleDeviceLocation = useCallback(() => {
    if (!navigator.geolocation) { setStatusMessage('Geolocation is not supported in this browser.', true); return; }
    if (!mapsReady || !window.google?.maps || !mapRef.current) {
      setStatusMessage('Open a map view before using device location.', true);
      return;
    }
    setStatusMessage('Finding your current location...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await applyDeviceLocation({
          googleMaps: window.google.maps,
          coords: position.coords,
          allEvents,
          filteredPlaces,
          effectiveDateFilter,
          travelMode,
          setDeviceLocationMarker,
          focusMapOnOrigin,
          renderCurrentSelection,
          setStatusMessage
        });
      },
      (error) => { setStatusMessage(error.message || 'Could not get device location.', true); },
      DEVICE_LOCATION_OPTIONS
    );
  }, [allEvents, effectiveDateFilter, filteredPlaces, focusMapOnOrigin, mapsReady, renderCurrentSelection, setDeviceLocationMarker, setStatusMessage, travelMode]);

  const handleSetSearchResultTag = useCallback((resultId, tag) => {
    setSearchResultTagDrafts((prev) => ({
      ...prev,
      [resultId]: tag
    }));
  }, []);

  const handleOpenSearchResultTagEditor = useCallback((resultId) => {
    setExpandedSearchResultEditorId((prev) => (prev === resultId ? '' : resultId));
  }, []);

  const handlePreviewSearchResult = useCallback((resultId) => {
    setActiveSearchResultId(resultId);
  }, []);

  const handleToggleSearchResultSelection = useCallback((resultId) => {
    setSearchResultSelectionIds((prev) => (
      prev.includes(resultId)
        ? prev.filter((candidate) => candidate !== resultId)
        : [...prev, resultId]
    ));
  }, []);

  const handleFocusSearchResult = useCallback((resultId) => {
    const result = placeSearchResults.find((candidate) => candidate.id === resultId);
    if (!result) return;
    setActiveSearchResultId(resultId);
    focusMapOnOrigin({ lat: result.lat, lng: result.lng }, 15);
    setStatusMessage(`Focused "${result.name}".`);
  }, [focusMapOnOrigin, placeSearchResults, setStatusMessage]);

  const handleSaveSearchResultAsSpot = useCallback(async (resultId) => {
    const result = placeSearchResults.find((candidate) => candidate.id === resultId);
    if (!result) return;
    const selectedTag = searchResultTagDrafts[resultId] || result.suggestedTag || 'eat';

    setSavingSearchResultId(resultId);
    try {
      const payload = buildCustomSpotPayloadFromSearchResult(result, selectedTag);
      const response = await fetchJson('/api/custom-spots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const savedSpot = response?.spot;
      if (!savedSpot) {
        throw new Error('Saved spot payload missing from response.');
      }

      setAllPlaces((prev) => {
        const nextPlaces = prev.filter((place) => place.id !== savedSpot.id);
        nextPlaces.push(savedSpot);
        return nextPlaces.sort((left, right) => `${left.tag}|${left.name}`.localeCompare(`${right.tag}|${right.name}`));
      });
      setPlaceSearchResults((prev) => prev.map((candidate) => (
        candidate.id === resultId
          ? {
              ...candidate,
              savedSpotId: savedSpot.id,
              savedTag: savedSpot.tag
            }
          : candidate
      )));
      setSearchResultSelectionIds((prev) => prev.filter((candidate) => candidate !== resultId));
      setExpandedSearchResultEditorId('');
      setStatusMessage(`Saved "${savedSpot.name}" to ${formatTag(savedSpot.tag)}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to save search result.', true);
    } finally {
      setSavingSearchResultId('');
    }
  }, [placeSearchResults, searchResultTagDrafts, setStatusMessage]);

  const handleSaveSelectedSearchResults = useCallback(async () => {
    const nextSelectedIds = searchResultSelectionIds.filter((resultId) => {
      const result = placeSearchResults.find((candidate) => candidate.id === resultId);
      return result && !result.savedTag;
    });
    for (const resultId of nextSelectedIds) {
      // Save sequentially so UI state stays predictable for per-result status.
      await handleSaveSearchResultAsSpot(resultId);
    }
    setSearchResultSelectionIds([]);
  }, [handleSaveSearchResultAsSpot, placeSearchResults, searchResultSelectionIds]);

  const handleDeleteCustomSpot = useCallback(async (spotId) => {
    spotId = String(spotId || '').trim();
    if (!spotId) return;

    const deletedSpotName = allPlaces.find((place) => place.id === spotId)?.name
      || placeSearchResults.find((candidate) => candidate.savedSpotId === spotId)?.name
      || '';

    setDeletingCustomSpotId(spotId);
    try {
      const response = await fetchJson(`/api/custom-spots/${encodeURIComponent(spotId)}`, {
        method: 'DELETE'
      });
      if (!response?.deleted) {
        throw new Error('Delete response missing confirmation.');
      }

      setAllPlaces((prev) => prev.filter((place) => place.id !== spotId));
      setPlaceSearchResults((prev) => prev.map((candidate) => (
        candidate.savedSpotId === spotId
          ? {
              ...candidate,
              savedSpotId: '',
              savedTag: ''
            }
          : candidate
      )));
      setSearchResultSelectionIds((prev) => prev.filter((candidate) => candidate !== spotId));
      setStatusMessage(`Deleted custom spot "${deletedSpotName || 'Saved spot'}".`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to delete custom spot.', true);
    } finally {
      setDeletingCustomSpotId('');
    }
  }, [allPlaces, placeSearchResults, setStatusMessage]);

  const handleSearchMapLocation = useCallback(async (queryInput) => {
    if (isSearchingMapLocation) return;
    const trimmedQuery = String(queryInput || '').trim();
    setMapSearchQuery(trimmedQuery);

    if (!trimmedQuery) {
      const message = 'Enter a location to search.';
      setSearchLocationError(message);
      setStatusMessage(message, true);
      return;
    }

    if (!mapsReady || !window.google?.maps || !mapRef.current) {
      const message = 'Open a map view before searching for a location.';
      setSearchLocationError(message);
      setStatusMessage(message, true);
      return;
    }

    setIsSearchingMapLocation(true);
    setSearchLocationError('');
    setMapSearchAreaDirty(false);
    skipNextSearchAreaIdleRef.current = true;
    setStatusMessage(`Searching for "${trimmedQuery}"...`);
    try {
      const { Place } = await window.google.maps.importLibrary('places') as any;
      if (!Place?.searchByText) {
        throw new Error('Google Places search is not available for this map key.');
      }

      const visibleArea = searchVisibleAreaRequestedRef.current;
      searchVisibleAreaRequestedRef.current = false;
      const origin = await getResolvedSearchOrigin(mapSearchScope, { visibleArea });
      const isNearMeScope = mapSearchScope === 'near_me';
      const keywordRadius = /\bnearby\b|\bnear me\b/.test(trimmedQuery.toLowerCase()) || isNearMeScope ? 4500 : origin.radius;
      const { places } = await Place.searchByText({
        textQuery: trimmedQuery,
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'types'],
        locationBias: new window.google.maps.Circle({ center: origin.point, radius: keywordRadius }),
        maxResultCount: 8
      });
      let normalizedResults = normalizePlacesTextSearchResults(places).map((result) => {
        const distanceMeters = calculateDistanceMeters(origin.point, { lat: result.lat, lng: result.lng });
        const walkDurationMinutes = estimateWalkDurationMinutes(distanceMeters);
        return {
          ...result,
          distanceMeters,
          distanceLabel: Number.isFinite(distanceMeters) ? formatDistance(distanceMeters) : '',
          walkDurationMinutes,
          walkDurationLabel: walkDurationMinutes > 0 ? `~${walkDurationMinutes} min walk` : '',
          typeChips: buildSearchResultTypeChips(result.types)
        };
      });
      normalizedResults = sortPlaceSearchResults(normalizedResults, mapSearchSort);

      if (normalizedResults.length === 0) {
        const message = `No places found for "${trimmedQuery}".`;
        clearSearchResultMarkers();
        setPlaceSearchResults([]);
        setSearchResultTagDrafts({});
        setSearchResultSelectionIds([]);
        setExpandedSearchResultEditorId('');
        setActiveSearchResultId('');
        setSearchLocationError(message);
        setStatusMessage(message, true);
        return;
      }

      setSearchResultsOriginLabel(origin.label);
      setPlaceSearchResults(normalizedResults);
      setSearchResultTagDrafts((prev) => Object.fromEntries(
        normalizedResults.map((result) => [result.id, prev[result.id] || result.suggestedTag || 'eat'])
      ));
      setSearchResultSelectionIds([]);
      setExpandedSearchResultEditorId('');
      setActiveSearchResultId(normalizedResults[0]?.id || '');
      setSearchLocationError('');
      focusSearchResultsOnMap(normalizedResults);
      setStatusMessage(`Found ${normalizedResults.length} places for "${trimmedQuery}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not search for that location.';
      setSearchLocationError(message);
      setStatusMessage(message, true);
    } finally {
      searchVisibleAreaRequestedRef.current = false;
      setIsSearchingMapLocation(false);
    }
  }, [clearSearchResultMarkers, focusSearchResultsOnMap, getResolvedSearchOrigin, isSearchingMapLocation, mapSearchScope, mapSearchSort, mapsReady, setStatusMessage]);

  const handleSearchVisibleArea = useCallback(() => {
    if (!mapSearchQuery.trim()) return;
    searchVisibleAreaRequestedRef.current = true;
    setMapSearchAreaDirty(false);
    void handleSearchMapLocation(mapSearchQuery);
  }, [handleSearchMapLocation, mapSearchQuery]);

  const handleApplySearchShortcut = useCallback((query) => {
    setMapSearchQuery(query);
    setMapSearchAreaDirty(false);
    void handleSearchMapLocation(query);
  }, [handleSearchMapLocation]);

  const handleClearSearchLocation = useCallback(() => {
    clearSearchResultMarkers();
    setMapSearchQuery('');
    setPlaceSearchResults([]);
    setSearchResultTagDrafts({});
    setSearchResultSelectionIds([]);
    setExpandedSearchResultEditorId('');
    setActiveSearchResultId('');
    setSavingSearchResultId('');
    setMapSearchAreaDirty(false);
    setSearchLocationError('');
    setStatusMessage('Cleared search results.');
  }, [clearSearchResultMarkers, setStatusMessage]);

  const handleCreateSource = useCallback(async (event) => {
    event.preventDefault();
    const url = newSourceUrl.trim();
    const label = newSourceLabel.trim();
    if (!url) {
      setStatusMessage('Source URL is required.', true);
      return;
    }

    setIsSavingSource(true);
    try {
      const response = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: newSourceType, url, label })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to add source.');
      }
      await loadSourcesFromServer();
      setNewSourceUrl('');
      setNewSourceLabel('');
      setStatusMessage('Added source. Run Sync to ingest data.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to add source.', true);
    } finally {
      setIsSavingSource(false);
    }
  }, [
    loadSourcesFromServer,
    newSourceLabel,
    newSourceType,
    newSourceUrl,
    setStatusMessage
  ]);

  const handleToggleSourceStatus = useCallback(async (source) => {
    const nextStatus = source?.status === 'active' ? 'paused' : 'active';
    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update source.');
      }
      await loadSourcesFromServer();
      setStatusMessage(`Source ${nextStatus === 'active' ? 'activated' : 'paused'}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to update source.', true);
    }
  }, [loadSourcesFromServer, setStatusMessage]);

  const handleDeleteSource = useCallback(async (source) => {
    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete source.');
      }
      await loadSourcesFromServer();
      setStatusMessage('Source deleted.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to delete source.', true);
    }
  }, [loadSourcesFromServer, setStatusMessage]);

  const handleSyncSource = useCallback(async (source) => {
    setSyncingSourceId(source.id);
    setStatusMessage(`Syncing "${source.label || source.url}"...`);
    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to sync source.');
      }
      await loadSourcesFromServer();
      const count = payload.events ?? payload.spots ?? 0;
      setStatusMessage(`Synced ${count} items from "${source.label || source.url}".`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to sync source.', true);
    } finally {
      setSyncingSourceId('');
    }
  }, [loadSourcesFromServer, setStatusMessage]);

  const handleExportPlannerIcs = useCallback(() => {
    if (!selectedDate || dayPlanItems.length === 0) { setStatusMessage('Add planner stops before exporting iCal.', true); return; }
    const icsContent = buildPlannerIcs(selectedDate, dayPlanItems);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = `sf-trip-${selectedDate}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(downloadUrl);
    setStatusMessage(`Exported iCal for ${formatDate(selectedDate)}.`);
  }, [dayPlanItems, selectedDate, setStatusMessage]);

  const handleAddDayPlanToGoogleCalendar = useCallback(() => {
    if (!selectedDate || dayPlanItems.length === 0) { setStatusMessage('Add planner stops before opening Google Calendar.', true); return; }
    const draftUrls = buildGoogleCalendarStopUrls({ dateISO: selectedDate, planItems: dayPlanItems, baseLocationText });
    let openedCount = 0;
    for (const url of draftUrls) { const w = window.open(url, '_blank', 'noopener,noreferrer'); if (w) openedCount += 1; }
    if (openedCount === 0) { setStatusMessage('Google Calendar pop-up blocked. Allow pop-ups and try again.', true); return; }
    if (openedCount < draftUrls.length) { setStatusMessage(`Opened ${openedCount}/${draftUrls.length} Google drafts. Your browser blocked some pop-ups.`, true); return; }
    setStatusMessage(`Opened ${openedCount} Google Calendar drafts for ${formatDate(toDateOnlyISO(selectedDate))}.`);
  }, [baseLocationText, dayPlanItems, selectedDate, setStatusMessage]);

  const handleSaveTripDates = useCallback(async (start, end) => {
    try {
      await fetchJson('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripStart: start, tripEnd: end }),
      });
      setTripStart(start);
      setTripEnd(end);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setStatusMessage(`Failed to save trip dates: ${message}`, true);
      throw err;
    }
  }, [setStatusMessage]);

  const handleSaveBaseLocation = useCallback(async (text) => {
    await fetchJson('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripStart, tripEnd, baseLocation: text }),
    });
    setBaseLocationText(text);
    if (mapsReady && window.google?.maps) {
      const geocodedBase = await geocode(text);
      if (geocodedBase) setBaseMarker(geocodedBase, `Base location: ${text}`);
    }
    setBaseLocationVersion((v) => v + 1);
  }, [tripStart, tripEnd, mapsReady, geocode, setBaseMarker]);

  const handleSaveSharedPlaceRecommendations = useCallback(async (enabled) => {
    await fetchJson('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripStart,
        tripEnd,
        showSharedPlaceRecommendations: enabled
      }),
    });
    const eventsPayload = await fetchJson('/api/events');
    setShowSharedPlaceRecommendations(Boolean(enabled));
    setAllPlaces(Array.isArray(eventsPayload?.places) ? eventsPayload.places : []);
    setStatusMessage(enabled ? 'Shared recommendations enabled.' : 'Shared recommendations hidden.');
  }, [tripStart, tripEnd, setStatusMessage]);

  const toggleCategory = useCallback((category) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const shiftCalendarMonth = useCallback((offset) => {
    const shifted = addMonthsToMonthISO(calendarAnchorISO, offset);
    setCalendarMonthISO(shifted);
  }, [calendarAnchorISO]);

  const travelReadyCount = visibleEvents.filter(
    (e) => e.travelDurationText && e.travelDurationText !== 'Unavailable'
  ).length;

  const value = {
    // Refs
    mapPanelRef, sidebarRef, mapElementRef, mapRef,
    // State
    authLoading, isAuthenticated, authUserId, profile,
    status, statusError, mapsReady, isInitializing,
    crimeLayerMeta,
    crimeHeatmapStrength, setCrimeHeatmapStrength,
    crimeLookbackHours, setCrimeLookbackHours, crimeLookbackHourOptions: CRIME_LOOKBACK_HOURS_OPTIONS,
    allEvents, allPlaces, visibleEvents, visiblePlaces,
    selectedDate, setSelectedDate, showAllEvents, setShowAllEvents,
    travelMode, setTravelMode, baseLocationText, setBaseLocationText,
    mapSearchQuery, setMapSearchQuery, mapSearchScope, setMapSearchScope, mapSearchSort, setMapSearchSort,
    mapSearchAreaDirty, isSearchingMapLocation, searchLocationError, searchResultsOriginLabel,
    placeSearchResults, searchResultTagDrafts, searchResultSelectionIds, expandedSearchResultEditorId,
    activeSearchResultId, savingSearchResultId, deletingCustomSpotId, searchShortcutQueries,
    hasSearchLocation: placeSearchResults.length > 0,
    isSyncing, placeTagFilter, setPlaceTagFilter, hiddenCategories, toggleCategory,
    calendarMonthISO, setCalendarMonthISO,
    plannerByDate,
    activePlanId, setActivePlanId,
    routeSummary, isRouteUpdating,
    isSigningOut,
    sources, groupedSources,
    newSourceType, setNewSourceType, newSourceUrl, setNewSourceUrl,
    newSourceLabel, setNewSourceLabel, isSavingSource, syncingSourceId,
    tripStart, setTripStart, tripEnd, setTripEnd,
    showSharedPlaceRecommendations, setShowSharedPlaceRecommendations,
    // Derived
    placeTagOptions, filteredPlaces, eventLookup, placeLookup,
    uniqueDates, eventsByDate, planItemsByDate,
    calendarAnchorISO, effectiveDateFilter,
    dayPlanItems, plannedRouteStops, travelReadyCount,
    // Handlers
    setStatusMessage,
    setMapRuntimeActive,
    handleSignOut,
    handleSync, handleDeviceLocation,
    handleSearchMapLocation, handleSearchVisibleArea, handleClearSearchLocation, handleSetSearchResultTag,
    handleFocusSearchResult, handlePreviewSearchResult, handleToggleSearchResultSelection,
    handleSaveSelectedSearchResults, handleOpenSearchResultTagEditor, handleApplySearchShortcut,
    handleSaveSearchResultAsSpot, handleDeleteCustomSpot,
    handleCreateSource, handleToggleSourceStatus, handleDeleteSource, handleSyncSource,
    handleSaveTripDates, handleSaveBaseLocation, handleSaveSharedPlaceRecommendations,
    handleExportPlannerIcs, handleAddDayPlanToGoogleCalendar,
    addEventToDayPlan, addPlaceToDayPlan, removePlanItem, clearDayPlan, startPlanDrag,
    shiftCalendarMonth,
    renderCurrentSelection
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}
