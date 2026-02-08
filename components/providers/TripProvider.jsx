'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { __iconNode as calendarIconNode } from 'lucide-react/dist/esm/icons/calendar.js';
import { __iconNode as coffeeIconNode } from 'lucide-react/dist/esm/icons/coffee.js';
import { __iconNode as houseIconNode } from 'lucide-react/dist/esm/icons/house.js';
import { __iconNode as mapPinIconNode } from 'lucide-react/dist/esm/icons/map-pin.js';
import { __iconNode as martiniIconNode } from 'lucide-react/dist/esm/icons/martini.js';
import { __iconNode as partyPopperIconNode } from 'lucide-react/dist/esm/icons/party-popper.js';
import { __iconNode as shoppingBagIconNode } from 'lucide-react/dist/esm/icons/shopping-bag.js';
import { __iconNode as utensilsCrossedIconNode } from 'lucide-react/dist/esm/icons/utensils-crossed.js';
import {
  Coffee, Martini, PartyPopper, ShoppingBag, UtensilsCrossed
} from 'lucide-react';

import {
  normalizePlaceTag, normalizeAddressKey, getPlaceSourceKey, normalizeDateKey,
  fetchJson, toISODate, toMonthISO, toDateOnlyISO, addMonthsToMonthISO, escapeHtml, truncate,
  formatTag, formatDate, formatDateDayMonth, formatDistance, formatDurationFromSeconds,
  buildISODateRange
} from '@/lib/helpers';
import {
  createPlanId, sortPlanItems, sanitizePlannerByDate, compactPlannerByDate,
  hasPlannerEntries, parseEventTimeRange, getSuggestedPlanSlot,
  buildPlannerIcs, buildGoogleCalendarStopUrls,
  PLAN_STORAGE_KEY, GEOCODE_CACHE_STORAGE_KEY, MAX_ROUTE_STOPS
} from '@/lib/planner-helpers';
import {
  createLucidePinIcon, toCoordinateKey, createTravelTimeCacheKey,
  createRouteRequestCacheKey, requestPlannedRoute,
  loadGoogleMapsScript, buildInfoWindowAddButton
} from '@/lib/map-helpers';

const TAG_COLORS = {
  eat: '#d97706',
  bar: '#7c3aed',
  cafes: '#2563eb',
  'go out': '#db2777',
  shops: '#0f766e'
};

const TAG_ICON_COMPONENTS = {
  eat: UtensilsCrossed,
  bar: Martini,
  cafes: Coffee,
  'go out': PartyPopper,
  shops: ShoppingBag
};

const TAG_ICON_NODES = {
  eat: utensilsCrossedIconNode,
  bar: martiniIconNode,
  cafes: coffeeIconNode,
  'go out': partyPopperIconNode,
  shops: shoppingBagIconNode
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

const TripContext = createContext(null);

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside TripProvider');
  return ctx;
}

export default function TripProvider({ children }) {
  const mapPanelRef = useRef(null);
  const sidebarRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const distanceMatrixRef = useRef(null);
  const routePolylineRef = useRef(null);
  const infoWindowRef = useRef(null);
  const baseMarkerRef = useRef(null);
  const baseLatLngRef = useRef(null);
  const markersRef = useRef([]);
  const positionCacheRef = useRef(new Map());
  const geocodeStoreRef = useRef(new Map());
  const travelTimeCacheRef = useRef(new Map());
  const plannedRouteCacheRef = useRef(new Map());
  const plannerHydratedRef = useRef(false);

  const [status, setStatus] = useState('Loading trip map...');
  const [statusError, setStatusError] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [allPlaces, setAllPlaces] = useState([]);
  const [visibleEvents, setVisibleEvents] = useState([]);
  const [visiblePlaces, setVisiblePlaces] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(true);
  const [travelMode, setTravelMode] = useState('WALKING');
  const [baseLocationText, setBaseLocationText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [placeTagFilter, setPlaceTagFilter] = useState('all');
  const [calendarMonthISO, setCalendarMonthISO] = useState('');
  const [plannerByDate, setPlannerByDate] = useState({});
  const [activePlanId, setActivePlanId] = useState('');
  const [routeSummary, setRouteSummary] = useState('');
  const [isRouteUpdating, setIsRouteUpdating] = useState(false);
  const [sources, setSources] = useState([]);
  const [newSourceType, setNewSourceType] = useState('event');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceLabel, setNewSourceLabel] = useState('');
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');

  const placeTagOptions = useMemo(() => {
    const tags = new Set();
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

  const uniqueDates = useMemo(() => {
    if (tripStart && tripEnd) {
      return buildISODateRange(tripStart, tripEnd);
    }
    const dateSet = new Set();
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
    let mounted = true;
    let localPlanner = {};
    try {
      const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          localPlanner = sanitizePlannerByDate(parsed);
          setPlannerByDate(localPlanner);
        }
      }
    } catch { /* ignore */ }

    async function loadPlannerFromServer() {
      try {
        const payload = await fetchJson('/api/planner');
        if (!mounted) return;
        const remotePlanner = sanitizePlannerByDate(payload?.plannerByDate || {});
        if (hasPlannerEntries(remotePlanner) || !hasPlannerEntries(localPlanner)) {
          setPlannerByDate(remotePlanner);
        }
      } catch (error) {
        console.error('Planner load failed; continuing with local planner cache.', error);
      } finally {
        if (mounted) plannerHydratedRef.current = true;
      }
    }
    void loadPlannerFromServer();
    return () => { mounted = false; plannerHydratedRef.current = true; };
  }, []);

  const savePlannerToServer = useCallback(async (nextPlannerByDate) => {
    try {
      const response = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plannerByDate: compactPlannerByDate(nextPlannerByDate) })
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
    try { window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(compactPlanner)); } catch { /* ignore */ }
    if (!plannerHydratedRef.current) return;
    const timeoutId = window.setTimeout(() => { void savePlannerToServer(compactPlanner); }, 450);
    return () => { window.clearTimeout(timeoutId); };
  }, [plannerByDate, savePlannerToServer]);

  // ---- Geocode cache ----
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GEOCODE_CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const cache = new Map();
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

  const loadSourcesFromServer = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/sources');
      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
    } catch (error) {
      console.error('Failed to load sources.', error);
    }
  }, []);

  const clearMapMarkers = useCallback(() => {
    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
  }, []);

  const clearRoute = useCallback(() => {
    if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null; }
    setIsRouteUpdating(false);
  }, []);

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

  const distanceMatrixRequest = useCallback(async (request) => {
    if (!distanceMatrixRef.current) return null;
    return new Promise((resolve, reject) => {
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
    if (!mapRef.current || !window.google?.maps) return;
    baseLatLngRef.current = latLng;
    if (baseMarkerRef.current) baseMarkerRef.current.setMap(null);
    baseMarkerRef.current = new window.google.maps.Marker({
      map: mapRef.current, position: latLng, title,
      icon: createLucidePinIcon(houseIconNode, '#111827')
    });
  }, []);

  const addEventToDayPlan = useCallback((event) => {
    if (!selectedDate) { setStatusMessage('Select a specific date before adding events to your day plan.', true); return; }
    setPlannerByDate((prev) => {
      const current = Array.isArray(prev[selectedDate]) ? prev[selectedDate] : [];
      const timeFromEvent = parseEventTimeRange(event.startDateTimeText);
      const slot = getSuggestedPlanSlot(current, timeFromEvent, 90);
      const next = sortPlanItems([...current, {
        id: createPlanId(), kind: 'event', sourceKey: event.eventUrl,
        title: event.name, locationText: event.address || event.locationText || '',
        link: event.eventUrl, startMinutes: slot.startMinutes, endMinutes: slot.endMinutes
      }]);
      return { ...prev, [selectedDate]: next };
    });
  }, [selectedDate, setStatusMessage]);

  const addPlaceToDayPlan = useCallback((place) => {
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

  const calculateTravelTimes = useCallback(async (evtsWithPositions, activeTravelMode) => {
    if (!baseLatLngRef.current || !distanceMatrixRef.current) return evtsWithPositions;
    const withLocation = evtsWithPositions.filter((e) => e._position);
    if (!withLocation.length) return evtsWithPositions;
    const travelModeValue = window.google.maps.TravelMode[activeTravelMode];
    const baseKey = toCoordinateKey(baseLatLngRef.current);
    if (!travelModeValue || !baseKey) return evtsWithPositions;

    const enriched = new Map(evtsWithPositions.map((e) => [e.eventUrl, { ...e }]));
    const missing = [];
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
    return `<div style="max-width:330px"><h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(event.name)}</h3><p style="margin:4px 0"><strong>Time:</strong> ${escapeHtml(time)}</p><p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(location)}</p><p style="margin:4px 0"><strong>Travel time:</strong> ${escapeHtml(travel)}</p><p style="margin:4px 0">${escapeHtml(truncate(event.description || '', 220))}</p>${buildInfoWindowAddButton(plannerAction)}<a href="${escapeHtml(event.eventUrl)}" target="_blank" rel="noreferrer">Open event</a></div>`;
  }, []);

  const buildPlaceInfoWindowHtml = useCallback((place, plannerAction) => {
    const displayTag = formatTag(normalizePlaceTag(place.tag));
    return `<div style="max-width:340px"><h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(place.name)}</h3><p style="margin:4px 0"><strong>Tag:</strong> ${escapeHtml(displayTag)}</p><p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(place.location || 'Unknown')}</p>${place.curatorComment ? `<p style="margin:4px 0"><strong>Curator:</strong> ${escapeHtml(place.curatorComment)}</p>` : ''}${place.description ? `<p style="margin:4px 0">${escapeHtml(place.description)}</p>` : ''}${place.details ? `<p style="margin:4px 0">${escapeHtml(place.details)}</p>` : ''}${buildInfoWindowAddButton(plannerAction)}<div style="display:flex;gap:10px;flex-wrap:wrap"><a href="${escapeHtml(place.mapLink)}" target="_blank" rel="noreferrer">Open map</a><a href="${escapeHtml(place.cornerLink)}" target="_blank" rel="noreferrer">Corner page</a></div></div>`;
  }, []);

  const renderCurrentSelection = useCallback(
    async (eventsInput, placesInput, dateFilter, activeTravelMode) => {
      if (!mapsReady || !window.google?.maps || !mapRef.current) return;
      clearMapMarkers();
      const filteredEvents = dateFilter
        ? eventsInput.filter((e) => normalizeDateKey(e.startDateISO) === dateFilter)
        : [...eventsInput];

      const evtsWithPositions = [];
      for (const event of filteredEvents) {
        const position = await resolvePosition({
          cacheKey: `event:${event.eventUrl}`, mapLink: event.googleMapsUrl,
          fallbackLocation: event.address || event.locationText, lat: event.lat, lng: event.lng
        });
        const ewp = { ...event, _position: position, travelDurationText: '' };
        if (position) {
          const marker = new window.google.maps.Marker({
            map: mapRef.current, position, title: event.name,
            icon: createLucidePinIcon(calendarIconNode, '#ea580c')
          });
          marker.addListener('click', () => {
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
        if (position) {
          const marker = new window.google.maps.Marker({
            map: mapRef.current, position, title: place.name,
            icon: createLucidePinIcon(getTagIconNode(pwp.tag), getTagColor(pwp.tag))
          });
          marker.addListener('click', () => {
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
        fitMapToVisiblePoints(evtsWithTravel, placesWithPositions);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Could not calculate travel times.', true);
        setVisibleEvents(evtsWithPositions);
        setVisiblePlaces(placesWithPositions);
        fitMapToVisiblePoints(evtsWithPositions, placesWithPositions);
      }
    },
    [mapsReady, buildEventInfoWindowHtml, buildPlaceInfoWindowHtml, calculateTravelTimes,
     clearMapMarkers, fitMapToVisiblePoints, resolvePosition,
     addEventToDayPlan, addPlaceToDayPlan, selectedDate, setStatusMessage]
  );

  // ---- Bootstrap ----
  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const [config, eventsPayload, sourcesPayload] = await Promise.all([
          fetchJson('/api/config'),
          fetchJson('/api/events'),
          fetchJson('/api/sources').catch(() => ({ sources: [] }))
        ]);
        if (!mounted) return;
        setTripStart(config.tripStart || '');
        setTripEnd(config.tripEnd || '');
        setBaseLocationText(config.baseLocation || '');
        const loadedEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
        const loadedPlaces = Array.isArray(eventsPayload.places) ? eventsPayload.places : [];
        const loadedSources = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : [];
        setAllEvents(loadedEvents);
        setAllPlaces(loadedPlaces);
        setSources(loadedSources);
        if (!config.mapsBrowserKey) { setStatusMessage('Missing GOOGLE_MAPS_BROWSER_KEY in .env. Map cannot load.', true); return; }
        await loadGoogleMapsScript(config.mapsBrowserKey);
        if (!mounted || !mapElementRef.current || !window.google?.maps) return;
        mapRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: { lat: 37.7749, lng: -122.4194 }, zoom: 12,
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
        setStatusMessage(`Loaded ${loadedEvents.length} events and ${loadedPlaces.length} curated places.${sampleNote}`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Failed to initialize app.', true);
      }
    }
    void bootstrap();
    return () => { mounted = false; clearMapMarkers(); clearRoute(); if (baseMarkerRef.current) baseMarkerRef.current.setMap(null); };
  }, [clearMapMarkers, clearRoute, geocode, setBaseMarker, setStatusMessage]);

  // ---- Re-render on filter changes ----
  useEffect(() => {
    if (!mapsReady) return;
    void renderCurrentSelection(allEvents, filteredPlaces, effectiveDateFilter, travelMode);
  }, [allEvents, effectiveDateFilter, filteredPlaces, mapsReady, renderCurrentSelection, travelMode]);

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
  }, [activePlanId, applyRoutePolylineStyle, clearRoute, dayPlanItems.length, mapsReady, plannedRouteStops, selectedDate, travelMode]);

  // ---- Handlers ----
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setStatusMessage('Syncing latest events...');
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Sync failed');
      const syncedEvents = Array.isArray(payload.events) ? payload.events : [];
      setAllEvents(syncedEvents);
      if (Array.isArray(payload.places)) setAllPlaces(payload.places);
      const ingestionErrors = Array.isArray(payload?.meta?.ingestionErrors) ? payload.meta.ingestionErrors : [];
      if (ingestionErrors.length > 0) console.error('Sync ingestion errors:', ingestionErrors);
      await loadSourcesFromServer();
      const errSuffix = ingestionErrors.length > 0 ? ` (${ingestionErrors.length} ingestion errors)` : '';
      setStatusMessage(`Synced ${syncedEvents.length} events at ${new Date().toLocaleTimeString()}${errSuffix}.`, ingestionErrors.length > 0);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Sync failed', true);
    } finally {
      setIsSyncing(false);
    }
  }, [loadSourcesFromServer, setStatusMessage]);

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
      if (!response.ok) throw new Error(payload?.error || 'Failed to add source.');
      await loadSourcesFromServer();
      setNewSourceUrl('');
      setNewSourceLabel('');
      setStatusMessage('Added source. Run Sync to ingest data.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to add source.', true);
    } finally {
      setIsSavingSource(false);
    }
  }, [loadSourcesFromServer, newSourceLabel, newSourceType, newSourceUrl, setStatusMessage]);

  const handleToggleSourceStatus = useCallback(async (source) => {
    const nextStatus = source?.status === 'active' ? 'paused' : 'active';
    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Failed to update source.');
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
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete source.');
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
      if (!response.ok) throw new Error(payload?.error || 'Failed to sync source.');
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
    travelMode, setTravelMode, baseLocationText,
    isSyncing, placeTagFilter, setPlaceTagFilter,
    calendarMonthISO, setCalendarMonthISO,
    plannerByDate, setPlannerByDate,
    activePlanId, setActivePlanId,
    routeSummary, isRouteUpdating,
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
    handleSync, handleDeviceLocation,
    handleCreateSource, handleToggleSourceStatus, handleDeleteSource, handleSyncSource,
    handleSaveTripDates,
    handleExportPlannerIcs, handleAddDayPlanToGoogleCalendar,
    addEventToDayPlan, addPlaceToDayPlan, removePlanItem, clearDayPlan, startPlanDrag,
    shiftCalendarMonth,
    renderCurrentSelection
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}
