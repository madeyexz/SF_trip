'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
import { __iconNode as utensilsCrossedIconNode } from 'lucide-react/dist/esm/icons/utensils-crossed.js';
import {
  Coffee, Martini, PartyPopper, ShieldCheck, ShoppingBag, TriangleAlert, UtensilsCrossed
} from 'lucide-react';

import {
  normalizePlaceTag, normalizeAddressKey, getPlaceSourceKey, normalizeDateKey,
  fetchJson, toISODate, toMonthISO, toDateOnlyISO, addMonthsToMonthISO, escapeHtml, truncate,
  formatTag, formatDate, formatDateDayMonth, formatDistance, formatDurationFromSeconds,
  buildISODateRange, daysFromNow, formatSourceLabel
} from '@/lib/helpers';
import {
  createPlanId, sortPlanItems, sanitizePlannerByDate, compactPlannerByDate,
  hasPlannerEntries, parseEventTimeRange, getSuggestedPlanSlot,
  buildPlannerIcs, buildGoogleCalendarStopUrls,
  PLAN_STORAGE_KEY, GEOCODE_CACHE_STORAGE_KEY, MAX_ROUTE_STOPS
} from '@/lib/planner-helpers';
import {
  createLucidePinIcon, createLucidePinIconWithLabel, toCoordinateKey, createTravelTimeCacheKey,
  createRouteRequestCacheKey, requestPlannedRoute,
  loadGoogleMapsScript, buildInfoWindowAddButton
} from '@/lib/map-helpers';

const TAG_COLORS = {
  eat: '#d97706',
  bar: '#7c3aed',
  cafes: '#2563eb',
  'go out': '#db2777',
  shops: '#0f766e',
  avoid: '#dc2626',
  safe: '#16a34a'
};

const CRIME_HEATMAP_HOURS = 72;
const CRIME_HEATMAP_LIMIT = 6000;
const CRIME_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const CRIME_IDLE_DEBOUNCE_MS = 450;
const CRIME_MIN_REQUEST_INTERVAL_MS = 20 * 1000;
const CRIME_HEATMAP_GRADIENT = [
  'rgba(0, 0, 0, 0)',
  'rgba(34, 197, 94, 0.28)',
  'rgba(245, 158, 11, 0.45)',
  'rgba(239, 68, 68, 0.62)',
  'rgba(153, 27, 27, 0.82)'
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
  return Math.max(14, Math.min(38, Math.round(56 - zoomLevel * 2.4)));
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

const TAG_ICON_COMPONENTS = {
  eat: UtensilsCrossed,
  bar: Martini,
  cafes: Coffee,
  'go out': PartyPopper,
  shops: ShoppingBag,
  avoid: TriangleAlert,
  safe: ShieldCheck
};

const TAG_ICON_NODES = {
  eat: utensilsCrossedIconNode,
  bar: martiniIconNode,
  cafes: coffeeIconNode,
  'go out': partyPopperIconNode,
  shops: shoppingBagIconNode,
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

const PLANNER_MODE_STORAGE_KEY = 'sf-trip-planner-mode-v1';
const SHARED_ROOM_STORAGE_KEY = 'sf-trip-shared-room-v1';
const PLANNER_MODES = new Set(['local', 'shared']);

function normalizePlannerRoomId(value) {
  const nextValue = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (nextValue.length < 2 || nextValue.length > 64) {
    return '';
  }
  return nextValue;
}

const TripContext = createContext<any>(null);

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside TripProvider');
  return ctx;
}

export default function TripProvider({ children }: { children: ReactNode }) {
  const mapPanelRef = useRef<any>(null);
  const sidebarRef = useRef<any>(null);
  const mapElementRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const distanceMatrixRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const baseMarkerRef = useRef<any>(null);
  const baseLatLngRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const regionPolygonsRef = useRef<any[]>([]);
  const crimeHeatmapRef = useRef<any>(null);
  const crimeRefreshTimerRef = useRef<number | null>(null);
  const crimeIdleListenerRef = useRef<any>(null);
  const lastCrimeFetchAtRef = useRef(0);
  const lastCrimeQueryRef = useRef('');
  const positionCacheRef = useRef<Map<string, any>>(new Map());
  const geocodeStoreRef = useRef<Map<string, any>>(new Map());
  const travelTimeCacheRef = useRef<Map<string, any>>(new Map());
  const plannedRouteCacheRef = useRef<Map<string, any>>(new Map());
  const plannerHydratedRef = useRef(false);
  const plannerPreferencesHydratedRef = useRef(false);

  const [status, setStatus] = useState('Loading trip map...');
  const [statusError, setStatusError] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [allPlaces, setAllPlaces] = useState<any[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<any[]>([]);
  const [visiblePlaces, setVisiblePlaces] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(true);
  const [travelMode, setTravelMode] = useState('WALKING');
  const [baseLocationText, setBaseLocationText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [placeTagFilter, setPlaceTagFilter] = useState('all');
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const hiddenCategoriesRef = useRef<Set<string>>(new Set());
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
  const [plannerMode, setPlannerMode] = useState('local');
  const [sharedPlannerRoomId, setSharedPlannerRoomId] = useState('');
  const [authConfigured, setAuthConfigured] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

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
    for (const s of sources) {
      const key = s?.sourceType === 'spot' ? 'spot' : 'event';
      groups[key].push(s);
    }
    return groups;
  }, [sources]);

  useEffect(() => {
    hiddenCategoriesRef.current = hiddenCategories;
  }, [hiddenCategories]);

  const plannerStorageKey = useMemo(() => {
    if (plannerMode === 'shared' && sharedPlannerRoomId) {
      return `${PLAN_STORAGE_KEY}:shared:${sharedPlannerRoomId}`;
    }
    return PLAN_STORAGE_KEY;
  }, [plannerMode, sharedPlannerRoomId]);

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
    if (!selectedDate || !uniqueDates.includes(selectedDate)) setSelectedDate(uniqueDates[0]);
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
    try {
      const modeRaw = window.localStorage.getItem(PLANNER_MODE_STORAGE_KEY);
      const roomRaw = window.localStorage.getItem(SHARED_ROOM_STORAGE_KEY);
      const nextMode = PLANNER_MODES.has(modeRaw) ? modeRaw : 'local';
      const nextRoomId = normalizePlannerRoomId(roomRaw);
      setPlannerMode(nextMode);
      setSharedPlannerRoomId(nextRoomId);
    } catch { /* ignore */ }
    plannerPreferencesHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!plannerPreferencesHydratedRef.current) {
      return;
    }
    try {
      window.localStorage.setItem(PLANNER_MODE_STORAGE_KEY, plannerMode);
      window.localStorage.setItem(SHARED_ROOM_STORAGE_KEY, sharedPlannerRoomId);
    } catch { /* ignore */ }
  }, [plannerMode, sharedPlannerRoomId]);

  useEffect(() => {
    let mounted = true;
    let localPlanner = {};
    plannerHydratedRef.current = false;
    try {
      const raw = window.localStorage.getItem(plannerStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          localPlanner = sanitizePlannerByDate(parsed);
          setPlannerByDate(localPlanner);
        }
      }
    } catch { /* ignore */ }

    async function loadSharedPlannerFromServer() {
      if (plannerMode !== 'shared' || !sharedPlannerRoomId || !isAdminAuthenticated) {
        if (mounted) {
          plannerHydratedRef.current = true;
        }
        return;
      }

      try {
        const payload = await fetchJson(`/api/planner?roomId=${encodeURIComponent(sharedPlannerRoomId)}`);
        if (!mounted) return;
        const remotePlanner = sanitizePlannerByDate(payload?.plannerByDate || {}) as Record<string, any[]>;
        if (hasPlannerEntries(remotePlanner) || !hasPlannerEntries(localPlanner)) {
          setPlannerByDate(remotePlanner);
        }
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('admin password required')) {
          setIsAdminAuthenticated(false);
        }
        console.error('Planner load failed; continuing with local planner cache.', error);
      } finally {
        if (mounted) plannerHydratedRef.current = true;
      }
    }
    void loadSharedPlannerFromServer();
    return () => { mounted = false; plannerHydratedRef.current = true; };
  }, [isAdminAuthenticated, plannerMode, plannerStorageKey, sharedPlannerRoomId]);

  const savePlannerToServer = useCallback(async (nextPlannerByDate, roomId) => {
    if (!roomId) {
      return;
    }

    try {
      const response = await fetch(`/api/planner?roomId=${encodeURIComponent(roomId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, plannerByDate: compactPlannerByDate(nextPlannerByDate) })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
        throw new Error(payload?.error || `Planner save failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Planner save failed; retaining local planner cache.', error);
    }
  }, []);

  useEffect(() => {
    const compactPlanner = compactPlannerByDate(plannerByDate);
    try { window.localStorage.setItem(plannerStorageKey, JSON.stringify(compactPlanner)); } catch { /* ignore */ }
    if (!plannerHydratedRef.current) return;
    if (plannerMode !== 'shared' || !sharedPlannerRoomId || !isAdminAuthenticated) return;
    const timeoutId = window.setTimeout(() => {
      void savePlannerToServer(compactPlanner, sharedPlannerRoomId);
    }, 450);
    return () => { window.clearTimeout(timeoutId); };
  }, [
    isAdminAuthenticated,
    plannerByDate,
    plannerMode,
    plannerStorageKey,
    savePlannerToServer,
    sharedPlannerRoomId
  ]);

  // ---- Geocode cache ----
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GEOCODE_CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, any>;
      if (!parsed || typeof parsed !== 'object') return;
      const cache = new Map<string, { lat: number; lng: number }>();
      for (const [k, v] of Object.entries(parsed)) {
        const lat = Number(v?.lat);
        const lng = Number(v?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) cache.set(k, { lat, lng });
      }
      geocodeStoreRef.current = cache;
    } catch { /* ignore */ }
  }, []);

  const saveGeocodeCache = useCallback(() => {
    const payload = {};
    for (const [k, v] of geocodeStoreRef.current.entries()) payload[k] = v;
    try { window.localStorage.setItem(GEOCODE_CACHE_STORAGE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  }, []);

  const setStatusMessage = useCallback((message, isError = false) => {
    setStatus(message);
    setStatusError(isError);
  }, []);

  const requireAdminClient = useCallback(() => {
    if (authConfigured && isAdminAuthenticated) {
      return true;
    }

    if (!authConfigured) {
      setStatusMessage('Server admin password is not configured. Set APP_ADMIN_PASSWORD first.', true);
      return false;
    }

    setStatusMessage('Unlock admin mode in Config before running this action.', true);
    return false;
  }, [authConfigured, isAdminAuthenticated, setStatusMessage]);

  const refreshAuthSession = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/auth/session');
      const nextConfigured = Boolean(payload?.authConfigured);
      const nextAuthenticated = nextConfigured && Boolean(payload?.authenticated);
      setAuthConfigured(nextConfigured);
      setIsAdminAuthenticated(nextAuthenticated);
      return payload;
    } catch {
      setAuthConfigured(false);
      setIsAdminAuthenticated(false);
      return null;
    }
  }, []);

  const handleAdminLogin = useCallback(async (password) => {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: String(password || '') })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error || `Login failed: ${response.status}`;
      setStatusMessage(message, true);
      throw new Error(message);
    }

    setAuthConfigured(Boolean(payload?.authConfigured));
    setIsAdminAuthenticated(Boolean(payload?.authenticated));
    setStatusMessage('Admin mode unlocked.');
    return true;
  }, [setStatusMessage]);

  const handleAdminLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/session', {
        method: 'DELETE'
      });
    } finally {
      setIsAdminAuthenticated(false);
      setStatusMessage('Admin mode locked.');
    }
  }, [setStatusMessage]);

  const applyPlannerSettings = useCallback(({ mode, roomId }) => {
    const nextMode = PLANNER_MODES.has(mode) ? mode : 'local';
    const nextRoomId = normalizePlannerRoomId(roomId);
    setPlannerMode(nextMode);
    setSharedPlannerRoomId(nextRoomId);
  }, []);

  const loadSourcesFromServer = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/sources');
      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
    } catch (error) {
      console.error('Failed to load sources.', error);
    }
  }, []);

  const clearMapMarkers = useCallback(() => {
    for (const m of markersRef.current) m.map = null;
    markersRef.current = [];
    for (const p of regionPolygonsRef.current) p.setMap(null);
    regionPolygonsRef.current = [];
  }, []);

  const clearRoute = useCallback(() => {
    if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null; }
    setIsRouteUpdating(false);
  }, []);

  const refreshCrimeHeatmap = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!mapsReady || !mapRef.current || !window.google?.maps?.visualization) return;
    const boundsQuery = buildCrimeBoundsQuery(mapRef.current);
    const requestPath = `/api/crime?hours=${CRIME_HEATMAP_HOURS}&limit=${CRIME_HEATMAP_LIMIT}${boundsQuery ? `&${boundsQuery}` : ''}`;
    const now = Date.now();
    if (!force) {
      const sameQuery = requestPath === lastCrimeQueryRef.current;
      const recentlyFetched = now - lastCrimeFetchAtRef.current < CRIME_MIN_REQUEST_INTERVAL_MS;
      if (sameQuery && recentlyFetched) return;
    }
    lastCrimeQueryRef.current = requestPath;
    lastCrimeFetchAtRef.current = now;

    try {
      const response = await fetch(requestPath);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Crime data request failed: ${response.status}`);
      }
      const incidents = Array.isArray(payload?.incidents) ? payload.incidents : [];
      const weightedPoints = incidents
        .map((incident) => {
          const lat = Number(incident?.lat);
          const lng = Number(incident?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            location: new window.google.maps.LatLng(lat, lng),
            weight: getCrimeCategoryWeight(incident?.incidentCategory)
          };
        })
        .filter(Boolean);
      if (!crimeHeatmapRef.current) {
        crimeHeatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
          data: weightedPoints,
          dissipating: true,
          radius: getCrimeHeatmapRadiusForZoom(mapRef.current?.getZoom?.()),
          opacity: 0.68,
          gradient: CRIME_HEATMAP_GRADIENT
        });
      } else {
        crimeHeatmapRef.current.setData(weightedPoints);
        crimeHeatmapRef.current.set('radius', getCrimeHeatmapRadiusForZoom(mapRef.current?.getZoom?.()));
      }
      crimeHeatmapRef.current.setMap(hiddenCategoriesRef.current.has('crime') ? null : mapRef.current);
    } catch (error) {
      console.error('Crime heatmap refresh failed.', error);
    }
  }, [mapsReady]);

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
      return new window.google.maps.LatLng(lat, lng);
    } catch { return null; }
  }, []);

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

      if (Number.isFinite(lat) && Number.isFinite(lng) && window.google?.maps) {
        const pos = new window.google.maps.LatLng(lat, lng);
        positionCacheRef.current.set(cacheKey, pos);
        return pos;
      }

      const fromMap = parseLatLngFromMapUrl(mapLink);
      if (fromMap) { positionCacheRef.current.set(cacheKey, fromMap); return fromMap; }

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

  const fitMapToVisiblePoints = useCallback((evts, places) => {
    if (!mapRef.current || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    let points = 0;
    if (baseLatLngRef.current) { bounds.extend(baseLatLngRef.current); points += 1; }
    for (const e of evts) { if (e._position) { bounds.extend(e._position); points += 1; } }
    for (const p of places) { if (p._position) { bounds.extend(p._position); points += 1; } }
    if (points === 0) { mapRef.current.setCenter({ lat: 37.7749, lng: -122.4194 }); mapRef.current.setZoom(12); return; }
    if (points === 1) { mapRef.current.setCenter(bounds.getCenter()); mapRef.current.setZoom(13); return; }
    mapRef.current.fitBounds(bounds, 60);
  }, []);

  const setBaseMarker = useCallback((latLng, title) => {
    if (!mapRef.current || !window.google?.maps?.marker) return;
    baseLatLngRef.current = latLng;
    if (baseMarkerRef.current) baseMarkerRef.current.map = null;
    baseMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
      map: hiddenCategoriesRef.current.has('home') ? null : mapRef.current, position: latLng, title,
      content: createLucidePinIcon(houseIconNode, '#111827')
    });
  }, []);

  useEffect(() => {
    if (baseMarkerRef.current) {
      baseMarkerRef.current.map = hiddenCategories.has('home') ? null : mapRef.current;
    }
    if (crimeHeatmapRef.current) {
      crimeHeatmapRef.current.setMap(hiddenCategories.has('crime') ? null : mapRef.current);
    }
    if (!hiddenCategories.has('crime')) {
      void refreshCrimeHeatmap({ force: true });
    }
  }, [hiddenCategories, refreshCrimeHeatmap]);

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
        link: event.eventUrl, startMinutes, endMinutes
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
    const sourceLine = sourceLabel ? `<p style="margin:4px 0"><strong>Source:</strong> ${escapeHtml(sourceLabel)}</p>` : '';
    return `<div style="max-width:330px"><h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(event.name)}</h3><p style="margin:4px 0"><strong>Time:</strong> ${escapeHtml(time)} <span style="color:#6b7280;font-size:12px">(${escapeHtml(daysLabel)})</span></p><p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(location)}</p><p style="margin:4px 0"><strong>Travel time:</strong> ${escapeHtml(travel)}</p>${sourceLine}<p style="margin:4px 0">${escapeHtml(truncate(event.description || '', 220))}</p>${buildInfoWindowAddButton(plannerAction)}<a href="${escapeHtml(event.eventUrl)}" target="_blank" rel="noreferrer">Open event</a></div>`;
  }, []);

  const buildPlaceInfoWindowHtml = useCallback((place, plannerAction) => {
    const displayTag = formatTag(normalizePlaceTag(place.tag));
    const placeTag = normalizePlaceTag(place.tag);
    const isAvoid = placeTag === 'avoid';
    const isSafe = placeTag === 'safe';
    const risk = place.risk || 'medium';
    const isExtreme = risk === 'extreme';
    const isHigh = risk === 'high';
    const avoidBannerBg = isExtreme ? '#7f1d1d' : isHigh ? '#991b1b' : '#fef2f2';
    const avoidBannerColor = isExtreme || isHigh ? '#fff' : '#991b1b';
    const avoidBannerBorder = isExtreme ? '#450a0a' : isHigh ? '#7f1d1d' : '#fca5a5';
    const avoidBannerText = isExtreme ? 'DO NOT VISIT: extremely dangerous area' : isHigh ? 'High-risk area: avoid if possible' : risk === 'medium-high' ? 'Medium-high risk: be cautious' : 'Exercise caution in this area';
    const avoidCrimeTypeLine = place.crimeTypes ? `<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">Common crimes: ${escapeHtml(place.crimeTypes)}</div>` : '';
    const safeHighlightsLine = place.safetyHighlights ? `<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">${escapeHtml(place.safetyHighlights)}</div>` : '<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">Generally lower violent-crime profile than city average.</div>';
    const safeCrimeTypeLine = place.crimeTypes ? `<div style="margin-top:4px;font-size:12px;font-weight:500;opacity:0.9">Still watch for: ${escapeHtml(place.crimeTypes)}</div>` : '';
    const safeBanner = isSafe
      ? `<div style="background:#ecfdf3;border:1px solid #86efac;border-radius:6px;padding:8px 10px;margin-bottom:8px;color:#166534;font-size:13px;font-weight:600">Safer area${safeHighlightsLine}${safeCrimeTypeLine}</div>`
      : '';
    const avoidBanner = isAvoid
      ? `<div style="background:${avoidBannerBg};border:1px solid ${avoidBannerBorder};border-radius:6px;padding:8px 10px;margin-bottom:8px;color:${avoidBannerColor};font-size:13px;font-weight:600">${avoidBannerText}${avoidCrimeTypeLine}</div>`
      : '';
    const addButton = isAvoid || isSafe ? '' : buildInfoWindowAddButton(plannerAction);
    return `<div style="max-width:340px">${avoidBanner}${safeBanner}<h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(place.name)}</h3><p style="margin:4px 0"><strong>Tag:</strong> ${escapeHtml(displayTag)}</p><p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(place.location || 'Unknown')}</p>${place.curatorComment ? `<p style="margin:4px 0"><strong>Curator:</strong> ${escapeHtml(place.curatorComment)}</p>` : ''}${place.description ? `<p style="margin:4px 0">${escapeHtml(place.description)}</p>` : ''}${place.details ? `<p style="margin:4px 0">${escapeHtml(place.details)}</p>` : ''}${addButton}<div style="display:flex;gap:10px;flex-wrap:wrap"><a href="${escapeHtml(place.mapLink)}" target="_blank" rel="noreferrer">Open map</a>${place.cornerLink ? `<a href="${escapeHtml(place.cornerLink)}" target="_blank" rel="noreferrer">Corner page</a>` : ''}</div></div>`;
  }, []);

  const renderCurrentSelection = useCallback(
    async (eventsInput, placesInput, dateFilter, activeTravelMode, shouldFitBounds = true) => {
      if (!mapsReady || !window.google?.maps || !mapRef.current) return;
      clearMapMarkers();
      const filteredEvents = (dateFilter
        ? eventsInput.filter((e) => normalizeDateKey(e.startDateISO) === dateFilter)
        : [...eventsInput]
      ).filter((e) => daysFromNow(e.startDateISO) >= 0);

      const evtsWithPositions = [];
      for (const event of filteredEvents) {
        const position = await resolvePosition({
          cacheKey: `event:${event.eventUrl}`, mapLink: event.googleMapsUrl,
          fallbackLocation: event.address || event.locationText, lat: event.lat, lng: event.lng
        });
        const ewp = { ...event, _position: position, travelDurationText: '' };
        if (position) {
          const days = daysFromNow(event.startDateISO);
          const dayLabel = days === 0 ? 'today' : `${days}d`;
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map: mapRef.current, position, title: event.name,
            content: createLucidePinIconWithLabel(calendarIconNode, '#ea580c', dayLabel),
            gmpClickable: true
          });
          marker.addEventListener('gmp-click', () => {
            if (!infoWindowRef.current) return;
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
        evtsWithPositions.push(ewp);
      }

      const placesWithPositions = [];
      for (const place of placesInput) {
        const position = await resolvePosition({
          cacheKey: `place:${place.id || place.name}`, mapLink: place.mapLink,
          fallbackLocation: place.location, lat: place.lat, lng: place.lng
        });
        const pwp = { ...place, _position: position, tag: normalizePlaceTag(place.tag) };
        const hasBoundary = Array.isArray(place.boundary) && place.boundary.length >= 3;
        const isRegion = hasBoundary && (pwp.tag === 'avoid' || pwp.tag === 'safe');
        if (isRegion) {
          const regionStyle = (() => {
            if (pwp.tag === 'avoid') {
              const risk = place.risk || 'medium';
              if (risk === 'extreme') return { fill: '#7f1d1d', fillOpacity: 0.38, strokeOpacity: 0.85, strokeWeight: 3 };
              if (risk === 'high') return { fill: '#991b1b', fillOpacity: 0.25, strokeOpacity: 0.7, strokeWeight: 2.5 };
              if (risk === 'medium-high') return { fill: '#dc2626', fillOpacity: 0.18, strokeOpacity: 0.55, strokeWeight: 2 };
              return { fill: '#ef4444', fillOpacity: 0.10, strokeOpacity: 0.4, strokeWeight: 1.5 };
            }
            const safetyLevel = place.safetyLevel || 'high';
            if (safetyLevel === 'very-high') return { fill: '#15803d', fillOpacity: 0.24, strokeOpacity: 0.78, strokeWeight: 2.5 };
            if (safetyLevel === 'high') return { fill: '#16a34a', fillOpacity: 0.17, strokeOpacity: 0.62, strokeWeight: 2 };
            return { fill: '#22c55e', fillOpacity: 0.13, strokeOpacity: 0.5, strokeWeight: 1.8 };
          })();
          const polygon = new window.google.maps.Polygon({
            map: mapRef.current,
            paths: place.boundary,
            fillColor: regionStyle.fill,
            fillOpacity: regionStyle.fillOpacity,
            strokeColor: regionStyle.fill,
            strokeOpacity: regionStyle.strokeOpacity,
            strokeWeight: regionStyle.strokeWeight,
            zIndex: pwp.tag === 'avoid' ? 30 : 20
          });
          polygon.addListener('click', (event: any) => {
            if (!infoWindowRef.current) return;
            const plannerAction = { id: '', label: '', enabled: false };
            infoWindowRef.current.setContent(buildPlaceInfoWindowHtml(pwp, plannerAction));
            infoWindowRef.current.setPosition(event.latLng || position);
            infoWindowRef.current.open(mapRef.current);
          });
          regionPolygonsRef.current.push(polygon);
          if (position) {
            const detailText = pwp.tag === 'avoid'
              ? place.crimeTypes || ''
              : place.safetyLabel || place.safetyHighlights || 'Lower violent-crime profile';
            const labelEl = document.createElement('div');
            const isAvoidTag = pwp.tag === 'avoid';
            const risk = place.risk || 'medium';
            const isExtreme = risk === 'extreme';
            const isHighRisk = risk === 'high';
            const bgColor = isAvoidTag
              ? (isExtreme ? 'rgba(127,29,29,0.92)' : isHighRisk ? 'rgba(153,27,27,0.88)' : 'rgba(254,242,242,0.88)')
              : 'rgba(220,252,231,0.92)';
            const textColor = isAvoidTag
              ? (isExtreme || isHighRisk ? '#fff' : '#991b1b')
              : '#166534';
            const borderColor = isAvoidTag
              ? (isExtreme ? '#450a0a' : isHighRisk ? '#7f1d1d' : '#fca5a5')
              : '#4ade80';
            const labelPrefix = isAvoidTag ? '⚠' : '✓';
            labelEl.style.cssText = `font-size:11px;font-weight:700;color:${textColor};background:${bgColor};padding:3px 7px;border-radius:4px;border:1px solid ${borderColor};white-space:nowrap;pointer-events:none;text-align:center;line-height:1.4;`;
            labelEl.innerHTML = `${labelPrefix} ${escapeHtml(place.name)}${detailText ? `<br><span style="font-size:10px;font-weight:500;opacity:0.9">${escapeHtml(detailText)}</span>` : ''}`;
            const labelMarker = new window.google.maps.marker.AdvancedMarkerElement({
              map: mapRef.current, position, content: labelEl, gmpClickable: false, zIndex: isAvoidTag ? 40 : 25
            });
            markersRef.current.push(labelMarker);
          }
        } else if (position) {
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            map: mapRef.current, position, title: place.name,
            content: createLucidePinIcon(getTagIconNode(pwp.tag), getTagColor(pwp.tag)),
            gmpClickable: true
          });
          marker.addEventListener('gmp-click', () => {
            if (!infoWindowRef.current) return;
            const addActionId = selectedDate ? `add-${createPlanId()}` : '';
            const plannerAction = {
              id: addActionId,
              label: selectedDate ? `Add to ${formatDateDayMonth(selectedDate)}` : 'Pick planner date first',
              enabled: Boolean(selectedDate)
            };
            infoWindowRef.current.setContent(buildPlaceInfoWindowHtml(pwp, plannerAction));
            infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
            if (addActionId && window.google?.maps?.event) {
              window.google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
                const btn = document.getElementById(addActionId);
                if (!btn) return;
                btn.addEventListener('click', (e) => {
                  e.preventDefault();
                  addPlaceToDayPlan(pwp);
                  setStatusMessage(`Added "${pwp.name}" to ${formatDate(selectedDate)}.`);
                });
              });
            }
          });
          markersRef.current.push(marker);
        }
        placesWithPositions.push(pwp);
      }

      try {
        const evtsWithTravel = await calculateTravelTimes(evtsWithPositions, activeTravelMode);
        setVisibleEvents(evtsWithTravel);
        setVisiblePlaces(placesWithPositions);
        if (shouldFitBounds) fitMapToVisiblePoints(evtsWithTravel, placesWithPositions);
      } catch (error) {
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
        if (!mounted) return;

        const errSuffix = ingestionErrors.length > 0 ? ` (${ingestionErrors.length} ingestion errors)` : '';
        setStatusMessage(`Synced ${syncedEvents.length} events at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })}${errSuffix}.`, ingestionErrors.length > 0);
      } catch (error) {
        console.error('Background sync failed; continuing with cached events.', error);
      } finally {
        if (mounted) setIsSyncing(false);
      }
    }

    async function bootstrap() {
      try {
        const [config, eventsPayload, sourcesPayload, authPayload] = await Promise.all([
          fetchJson('/api/config'),
          fetchJson('/api/events'),
          fetchJson('/api/sources').catch(() => ({ sources: [] })),
          fetchJson('/api/auth/session').catch(() => ({ authConfigured: false, authenticated: false }))
        ]);
        if (!mounted) return;
        setAuthConfigured(Boolean(authPayload?.authConfigured));
        setIsAdminAuthenticated(Boolean(authPayload?.authConfigured) && Boolean(authPayload?.authenticated));
        setTripStart(config.tripStart || '');
        setTripEnd(config.tripEnd || '');
        setBaseLocationText(config.baseLocation || '');
        const loadedEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
        const loadedPlaces = Array.isArray(eventsPayload.places) ? eventsPayload.places : [];
        const loadedSources = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : [];
        setAllEvents(loadedEvents);
        setAllPlaces(loadedPlaces);
        setSources(loadedSources);

        if (authPayload?.authConfigured && authPayload?.authenticated) {
          void runBackgroundSync();
        }

        if (!config.mapsBrowserKey) { setStatusMessage('Missing GOOGLE_MAPS_BROWSER_KEY in .env. Map cannot load.', true); return; }
        await loadGoogleMapsScript(config.mapsBrowserKey);
        await window.google.maps.importLibrary('marker');
        await window.google.maps.importLibrary('visualization');
        if (!mounted || !mapElementRef.current || !window.google?.maps) return;
        mapRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: { lat: 37.7749, lng: -122.4194 }, zoom: 12,
          mapId: config.mapsMapId || 'DEMO_MAP_ID',
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
          restriction: {
            latLngBounds: { north: 37.85, south: 37.68, west: -122.55, east: -122.33 },
            strictBounds: false
          }
        });
        distanceMatrixRef.current = new window.google.maps.DistanceMatrixService();
        infoWindowRef.current = new window.google.maps.InfoWindow();
        const geocodedBase = await geocode(config.baseLocation || '');
        if (geocodedBase) setBaseMarker(geocodedBase, `Base location: ${config.baseLocation}`);
        setMapsReady(true);
        const sampleNote = eventsPayload?.meta?.sampleData ? ' Showing sample data until you sync.' : '';
        const authNote =
          authPayload?.authConfigured && !authPayload?.authenticated
            ? ' Unlock admin mode in Config to run sync or edit shared data.'
            : '';
        setStatusMessage(`Loaded ${loadedEvents.length} events and ${loadedPlaces.length} curated places.${sampleNote}${authNote}`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Failed to initialize app.', true);
      }
    }
    void bootstrap();
    return () => { mounted = false; clearMapMarkers(); clearRoute(); if (baseMarkerRef.current) baseMarkerRef.current.map = null; };
  }, [clearMapMarkers, clearRoute, geocode, loadSourcesFromServer, setBaseMarker, setStatusMessage]);

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
          routePolylineRef.current = new window.google.maps.Polyline({ path: route.path, strokeColor: '#1d4ed8', strokeOpacity: 0.86, strokeWeight: 5 });
          routePolylineRef.current.setMap(mapRef.current);
        } else {
          routePolylineRef.current.setPath(route.path);
          routePolylineRef.current.setMap(mapRef.current);
        }
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
  }, [activePlanId, applyRoutePolylineStyle, baseLocationVersion, clearRoute, dayPlanItems.length, mapsReady, plannedRouteStops, selectedDate, travelMode]);

  // ---- Handlers ----
  const handleSync = useCallback(async () => {
    if (!requireAdminClient()) {
      return;
    }

    setIsSyncing(true);
    setStatusMessage('Syncing latest events...');
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
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
  }, [loadSourcesFromServer, requireAdminClient, setStatusMessage]);

  const handleDeviceLocation = useCallback(() => {
    if (!navigator.geolocation || !window.google?.maps) { setStatusMessage('Geolocation is not supported in this browser.', true); return; }
    setStatusMessage('Finding your current location...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latLng = new window.google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        setBaseMarker(latLng, 'My current location');
        await renderCurrentSelection(allEvents, filteredPlaces, effectiveDateFilter, travelMode);
        setStatusMessage('Using your live device location as trip origin.');
      },
      (error) => { setStatusMessage(error.message || 'Could not get device location.', true); }
    );
  }, [allEvents, effectiveDateFilter, filteredPlaces, renderCurrentSelection, setBaseMarker, setStatusMessage, travelMode]);

  const handleCreateSource = useCallback(async (event) => {
    event.preventDefault();
    if (!requireAdminClient()) {
      return;
    }

    const url = newSourceUrl.trim();
    const label = newSourceLabel.trim();
    if (!url) { setStatusMessage('Source URL is required.', true); return; }
    setIsSavingSource(true);
    try {
      const response = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceType: newSourceType, url, label })
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
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
  }, [loadSourcesFromServer, newSourceLabel, newSourceType, newSourceUrl, requireAdminClient, setStatusMessage]);

  const handleToggleSourceStatus = useCallback(async (source) => {
    if (!requireAdminClient()) {
      return;
    }

    const nextStatus = source?.status === 'active' ? 'paused' : 'active';
    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
        throw new Error(payload?.error || 'Failed to update source.');
      }
      await loadSourcesFromServer();
      setStatusMessage(`Source ${nextStatus === 'active' ? 'activated' : 'paused'}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to update source.', true);
    }
  }, [loadSourcesFromServer, requireAdminClient, setStatusMessage]);

  const handleDeleteSource = useCallback(async (source) => {
    if (!requireAdminClient()) {
      return;
    }

    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
        throw new Error(payload?.error || 'Failed to delete source.');
      }
      await loadSourcesFromServer();
      setStatusMessage('Source deleted.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to delete source.', true);
    }
  }, [loadSourcesFromServer, requireAdminClient, setStatusMessage]);

  const handleSyncSource = useCallback(async (source) => {
    if (!requireAdminClient()) {
      return;
    }

    setSyncingSourceId(source.id);
    setStatusMessage(`Syncing "${source.label || source.url}"...`);
    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setIsAdminAuthenticated(false);
        }
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
  }, [loadSourcesFromServer, requireAdminClient, setStatusMessage]);

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
    if (!requireAdminClient()) {
      throw new Error('Admin mode is required.');
    }

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
  }, [requireAdminClient, setStatusMessage]);

  const handleSaveBaseLocation = useCallback(async (text) => {
    if (!requireAdminClient()) {
      throw new Error('Admin mode is required.');
    }

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
  }, [tripStart, tripEnd, mapsReady, geocode, requireAdminClient, setBaseMarker]);

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
    status, statusError, mapsReady,
    allEvents, allPlaces, visibleEvents, visiblePlaces,
    selectedDate, setSelectedDate, showAllEvents, setShowAllEvents,
    travelMode, setTravelMode, baseLocationText, setBaseLocationText,
    isSyncing, placeTagFilter, setPlaceTagFilter, hiddenCategories, toggleCategory,
    calendarMonthISO, setCalendarMonthISO,
    plannerByDate, setPlannerByDate,
    activePlanId, setActivePlanId,
    routeSummary, isRouteUpdating,
    authConfigured, isAdminAuthenticated,
    plannerMode, sharedPlannerRoomId,
    sources, groupedSources,
    newSourceType, setNewSourceType, newSourceUrl, setNewSourceUrl,
    newSourceLabel, setNewSourceLabel, isSavingSource, syncingSourceId,
    tripStart, setTripStart, tripEnd, setTripEnd,
    // Derived
    placeTagOptions, filteredPlaces, eventLookup, placeLookup,
    uniqueDates, eventsByDate, planItemsByDate,
    calendarAnchorISO, effectiveDateFilter,
    dayPlanItems, plannedRouteStops, travelReadyCount,
    // Handlers
    setStatusMessage,
    refreshAuthSession, handleAdminLogin, handleAdminLogout,
    applyPlannerSettings,
    handleSync, handleDeviceLocation,
    handleCreateSource, handleToggleSourceStatus, handleDeleteSource, handleSyncSource,
    handleSaveTripDates, handleSaveBaseLocation,
    handleExportPlannerIcs, handleAddDayPlanToGoogleCalendar,
    addEventToDayPlan, addPlaceToDayPlan, removePlanItem, clearDayPlan, startPlanDrag,
    shiftCalendarMonth,
    renderCurrentSelection
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}
