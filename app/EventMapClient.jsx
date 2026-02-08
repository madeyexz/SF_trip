'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Calendar,
  Coffee,
  House,
  MapPin,
  Martini,
  Navigation,
  PartyPopper,
  RefreshCw,
  ShoppingBag,
  UtensilsCrossed
} from 'lucide-react';
import { __iconNode as calendarIconNode } from 'lucide-react/dist/esm/icons/calendar.js';
import { __iconNode as coffeeIconNode } from 'lucide-react/dist/esm/icons/coffee.js';
import { __iconNode as houseIconNode } from 'lucide-react/dist/esm/icons/house.js';
import { __iconNode as mapPinIconNode } from 'lucide-react/dist/esm/icons/map-pin.js';
import { __iconNode as martiniIconNode } from 'lucide-react/dist/esm/icons/martini.js';
import { __iconNode as partyPopperIconNode } from 'lucide-react/dist/esm/icons/party-popper.js';
import { __iconNode as shoppingBagIconNode } from 'lucide-react/dist/esm/icons/shopping-bag.js';
import { __iconNode as utensilsCrossedIconNode } from 'lucide-react/dist/esm/icons/utensils-crossed.js';

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

const MINUTES_IN_DAY = 24 * 60;
const MIN_PLAN_BLOCK_MINUTES = 30;
const PLAN_SNAP_MINUTES = 15;
const PLAN_HOUR_HEIGHT = 50;
const PLAN_MINUTE_HEIGHT = PLAN_HOUR_HEIGHT / 60;
const PLAN_STORAGE_KEY = 'sf-trip-day-plans-v1';
const GEOCODE_CACHE_STORAGE_KEY = 'sf-trip-geocode-cache-v1';
const MAX_ROUTE_STOPS = 8;

export default function EventMapClient() {
  const mapPanelRef = useRef(null);
  const sidebarRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const distanceMatrixRef = useRef(null);
  const routePolylineRef = useRef(null);
  const infoWindowRef = useRef(null);
  const baseMarkerRef = useRef(null);
  const baseLatLngRef = useRef(null);
  const markersRef = useRef([]);
  const positionCacheRef = useRef(new Map());
  const geocodeStoreRef = useRef(new Map());
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
  const [activeMobilePanel, setActiveMobilePanel] = useState('planner');
  const [calendarMonthISO, setCalendarMonthISO] = useState('');
  const [plannerByDate, setPlannerByDate] = useState({});
  const [activePlanId, setActivePlanId] = useState('');
  const [routeSummary, setRouteSummary] = useState('');
  const [isRouteUpdating, setIsRouteUpdating] = useState(false);

  const placeTagOptions = useMemo(() => {
    const tags = new Set();
    for (const place of allPlaces) {
      tags.add(normalizePlaceTag(place.tag));
    }

    return ['all', ...Array.from(tags).sort((left, right) => left.localeCompare(right))];
  }, [allPlaces]);

  const filteredPlaces = useMemo(() => {
    if (placeTagFilter === 'all') {
      return allPlaces;
    }

    return allPlaces.filter((place) => normalizePlaceTag(place.tag) === placeTagFilter);
  }, [allPlaces, placeTagFilter]);

  const eventLookup = useMemo(
    () => new Map(visibleEvents.map((event) => [event.eventUrl, event])),
    [visibleEvents]
  );

  const placeLookup = useMemo(() => {
    const map = new Map();

    for (const place of visiblePlaces) {
      map.set(getPlaceSourceKey(place), place);
    }

    return map;
  }, [visiblePlaces]);

  const uniqueDates = useMemo(
    () =>
      Array.from(new Set(allEvents.map((event) => event.startDateISO).filter(Boolean))).sort(),
    [allEvents]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map();

    for (const date of uniqueDates) {
      map.set(date, 0);
    }

    for (const event of allEvents) {
      if (!event.startDateISO) {
        continue;
      }

      map.set(event.startDateISO, (map.get(event.startDateISO) || 0) + 1);
    }

    return map;
  }, [allEvents, uniqueDates]);

  const planItemsByDate = useMemo(() => {
    const map = new Map();

    for (const [dateISO, items] of Object.entries(plannerByDate)) {
      map.set(dateISO, Array.isArray(items) ? items.length : 0);
    }

    return map;
  }, [plannerByDate]);

  const calendarAnchorISO = useMemo(() => {
    return calendarMonthISO || selectedDate || uniqueDates[0] || toISODate(new Date());
  }, [calendarMonthISO, selectedDate, uniqueDates]);

  const calendarDays = useMemo(() => buildCalendarGridDates(calendarAnchorISO), [calendarAnchorISO]);

  useEffect(() => {
    if (uniqueDates.length === 0) {
      setSelectedDate('');
      return;
    }

    if (!selectedDate || !uniqueDates.includes(selectedDate)) {
      setSelectedDate(uniqueDates[0]);
    }
  }, [selectedDate, uniqueDates]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    const selectedMonth = toMonthISO(selectedDate);
    if (!calendarMonthISO || calendarMonthISO !== selectedMonth) {
      setCalendarMonthISO(selectedMonth);
    }
  }, [calendarMonthISO, selectedDate]);

  const selectedDateIndex = useMemo(() => {
    if (!selectedDate) {
      return 0;
    }

    const index = uniqueDates.indexOf(selectedDate);
    return index < 0 ? 0 : index;
  }, [selectedDate, uniqueDates]);

  const effectiveDateFilter = showAllEvents ? '' : selectedDate;

  const dayPlanItems = useMemo(() => {
    if (!selectedDate) {
      return [];
    }

    const items = plannerByDate[selectedDate];
    return Array.isArray(items) ? sortPlanItems(items) : [];
  }, [plannerByDate, selectedDate]);

  const plannedRouteStops = useMemo(() => {
    const stops = [];

    for (const item of dayPlanItems) {
      if (item.kind === 'event') {
        const event = eventLookup.get(item.sourceKey);
        if (event?._position) {
          stops.push({
            id: item.id,
            title: item.title,
            position: event._position
          });
        }
      } else {
        const place = placeLookup.get(item.sourceKey);
        if (place?._position) {
          stops.push({
            id: item.id,
            title: item.title,
            position: place._position
          });
        }
      }
    }

    return stops;
  }, [dayPlanItems, eventLookup, placeLookup]);

  const nearestEvent = useMemo(() => {
    const valid = visibleEvents
      .map((event) => ({
        ...event,
        _travelMins: parseDurationToMinutes(event.travelDurationText)
      }))
      .filter((event) => event._travelMins !== null)
      .sort((left, right) => left._travelMins - right._travelMins);

    return valid[0] || null;
  }, [visibleEvents]);

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
    } catch {
      // Ignore broken local planner cache.
    }

    async function loadPlannerFromServer() {
      try {
        const payload = await fetchJson('/api/planner');
        if (!mounted) {
          return;
        }

        const remotePlanner = sanitizePlannerByDate(payload?.plannerByDate || {});
        const hasRemotePlans = hasPlannerEntries(remotePlanner);
        const hasLocalPlans = hasPlannerEntries(localPlanner);

        if (hasRemotePlans || !hasLocalPlans) {
          setPlannerByDate(remotePlanner);
        }
      } catch (error) {
        console.error('Planner load failed; continuing with local planner cache.', error);
      } finally {
        if (mounted) {
          plannerHydratedRef.current = true;
        }
      }
    }

    void loadPlannerFromServer();

    return () => {
      mounted = false;
      plannerHydratedRef.current = true;
    };
  }, []);

  const savePlannerToServer = useCallback(async (nextPlannerByDate) => {
    try {
      const response = await fetch('/api/planner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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

    try {
      window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(compactPlanner));
    } catch {
      // Ignore local storage failures.
    }

    if (!plannerHydratedRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void savePlannerToServer(compactPlanner);
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [plannerByDate, savePlannerToServer]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GEOCODE_CACHE_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const cache = new Map();

      for (const [addressKey, coordinates] of Object.entries(parsed)) {
        const lat = Number(coordinates?.lat);
        const lng = Number(coordinates?.lng);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          cache.set(addressKey, { lat, lng });
        }
      }

      geocodeStoreRef.current = cache;
    } catch {
      // Ignore broken geocode cache.
    }
  }, []);

  const saveGeocodeCache = useCallback(() => {
    const payload = {};

    for (const [addressKey, coordinates] of geocodeStoreRef.current.entries()) {
      payload[addressKey] = coordinates;
    }

    try {
      window.localStorage.setItem(GEOCODE_CACHE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore local storage failures.
    }
  }, []);

  const setStatusMessage = useCallback((message, isError = false) => {
    setStatus(message);
    setStatusError(isError);
  }, []);

  const clearMapMarkers = useCallback(() => {
    for (const marker of markersRef.current) {
      marker.setMap(null);
    }

    markersRef.current = [];
  }, []);

  const clearRoute = useCallback(() => {
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    setIsRouteUpdating(false);
  }, []);

  const applyRoutePolylineStyle = useCallback((isUpdating) => {
    if (!routePolylineRef.current) {
      return;
    }

    if (isUpdating) {
      routePolylineRef.current.setOptions({
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 1,
              scale: 3
            },
            offset: '0',
            repeat: '12px'
          }
        ]
      });
      return;
    }

    routePolylineRef.current.setOptions({
      strokeOpacity: 0.86,
      icons: []
    });
  }, []);

  const geocode = useCallback(async (address) => {
    if (!geocoderRef.current || !address) {
      return null;
    }

    return new Promise((resolve) => {
      geocoderRef.current.geocode({ address }, (results, statusValue) => {
        if (statusValue !== 'OK' || !results?.length) {
          resolve(null);
          return;
        }

        resolve(results[0].geometry.location);
      });
    });
  }, []);

  const parseLatLngFromMapUrl = useCallback((url) => {
    if (!url || !window.google?.maps) {
      return null;
    }

    try {
      const parsedUrl = new URL(url);
      const queryValue = parsedUrl.searchParams.get('query') || '';
      const parts = queryValue.split(',').map((part) => Number(part));

      if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return new window.google.maps.LatLng(parts[0], parts[1]);
      }
    } catch {
      return null;
    }

    return null;
  }, []);

  const resolvePosition = useCallback(
    async ({ cacheKey, mapLink, fallbackLocation, lat, lng }) => {
      const cached = positionCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      if (Number.isFinite(lat) && Number.isFinite(lng) && window.google?.maps) {
        const fromStoredCoordinates = new window.google.maps.LatLng(lat, lng);
        positionCacheRef.current.set(cacheKey, fromStoredCoordinates);
        return fromStoredCoordinates;
      }

      const fromMapUrl = parseLatLngFromMapUrl(mapLink);
      if (fromMapUrl) {
        positionCacheRef.current.set(cacheKey, fromMapUrl);
        return fromMapUrl;
      }

      const addressKey = normalizeAddressKey(fallbackLocation);
      if (addressKey) {
        const cachedCoordinates = geocodeStoreRef.current.get(addressKey);

        if (
          cachedCoordinates &&
          Number.isFinite(cachedCoordinates.lat) &&
          Number.isFinite(cachedCoordinates.lng) &&
          window.google?.maps
        ) {
          const fromPersistentCache = new window.google.maps.LatLng(
            cachedCoordinates.lat,
            cachedCoordinates.lng
          );
          positionCacheRef.current.set(cacheKey, fromPersistentCache);
          return fromPersistentCache;
        }
      }

      const geocoded = await geocode(fallbackLocation);
      if (geocoded) {
        positionCacheRef.current.set(cacheKey, geocoded);

        if (addressKey) {
          geocodeStoreRef.current.set(addressKey, {
            lat: geocoded.lat(),
            lng: geocoded.lng()
          });
          saveGeocodeCache();
        }
      }

      return geocoded;
    },
    [geocode, parseLatLngFromMapUrl, saveGeocodeCache]
  );

  const distanceMatrixRequest = useCallback(async (request) => {
    if (!distanceMatrixRef.current) {
      return null;
    }

    return new Promise((resolve, reject) => {
      distanceMatrixRef.current.getDistanceMatrix(request, (response, statusValue) => {
        if (statusValue !== 'OK') {
          reject(new Error(`Distance matrix error: ${statusValue}`));
          return;
        }

        resolve(response);
      });
    });
  }, []);

  const fitMapToVisiblePoints = useCallback((eventsForBounds, placesForBounds) => {
    if (!mapRef.current || !window.google?.maps) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    let points = 0;

    if (baseLatLngRef.current) {
      bounds.extend(baseLatLngRef.current);
      points += 1;
    }

    for (const event of eventsForBounds) {
      if (event._position) {
        bounds.extend(event._position);
        points += 1;
      }
    }

    for (const place of placesForBounds) {
      if (place._position) {
        bounds.extend(place._position);
        points += 1;
      }
    }

    if (points === 0) {
      mapRef.current.setCenter({ lat: 37.7749, lng: -122.4194 });
      mapRef.current.setZoom(12);
      return;
    }

    if (points === 1) {
      mapRef.current.setCenter(bounds.getCenter());
      mapRef.current.setZoom(13);
      return;
    }

    mapRef.current.fitBounds(bounds, 60);
  }, []);

  const setBaseMarker = useCallback((latLng, title) => {
    if (!mapRef.current || !window.google?.maps) {
      return;
    }

    baseLatLngRef.current = latLng;

    if (baseMarkerRef.current) {
      baseMarkerRef.current.setMap(null);
    }

    baseMarkerRef.current = new window.google.maps.Marker({
      map: mapRef.current,
      position: latLng,
      title,
      icon: createLucidePinIcon(houseIconNode, '#111827')
    });
  }, []);

  const addEventToDayPlan = useCallback(
    (event) => {
      if (!selectedDate) {
        setStatusMessage('Select a specific date before adding events to your day plan.', true);
        return;
      }

      setPlannerByDate((previous) => {
        const current = Array.isArray(previous[selectedDate]) ? previous[selectedDate] : [];
        const timeFromEvent = parseEventTimeRange(event.startDateTimeText);
        const slot = getSuggestedPlanSlot(current, timeFromEvent, 90);

        const next = sortPlanItems([
          ...current,
          {
            id: createPlanId(),
            kind: 'event',
            sourceKey: event.eventUrl,
            title: event.name,
            locationText: event.address || event.locationText || '',
            link: event.eventUrl,
            startMinutes: slot.startMinutes,
            endMinutes: slot.endMinutes
          }
        ]);

        return {
          ...previous,
          [selectedDate]: next
        };
      });
    },
    [selectedDate, setStatusMessage]
  );

  const addPlaceToDayPlan = useCallback(
    (place) => {
      if (!selectedDate) {
        setStatusMessage('Select a specific date before adding places to your day plan.', true);
        return;
      }

      setPlannerByDate((previous) => {
        const current = Array.isArray(previous[selectedDate]) ? previous[selectedDate] : [];
        const slot = getSuggestedPlanSlot(current, null, 75);

        const next = sortPlanItems([
          ...current,
          {
            id: createPlanId(),
            kind: 'place',
            sourceKey: getPlaceSourceKey(place),
            title: place.name,
            locationText: place.location || '',
            link: place.mapLink || place.cornerLink || '',
            tag: normalizePlaceTag(place.tag),
            startMinutes: slot.startMinutes,
            endMinutes: slot.endMinutes
          }
        ]);

        return {
          ...previous,
          [selectedDate]: next
        };
      });
    },
    [selectedDate, setStatusMessage]
  );

  const removePlanItem = useCallback((itemId) => {
    if (!selectedDate) {
      return;
    }

    setPlannerByDate((previous) => {
      const current = Array.isArray(previous[selectedDate]) ? previous[selectedDate] : [];
      const next = current.filter((item) => item.id !== itemId);

      return {
        ...previous,
        [selectedDate]: next
      };
    });
  }, [selectedDate]);

  const clearDayPlan = useCallback(() => {
    if (!selectedDate) {
      return;
    }

    setPlannerByDate((previous) => ({
      ...previous,
      [selectedDate]: []
    }));
  }, [selectedDate]);

  const startPlanDrag = useCallback(
    (pointerEvent, item, mode) => {
      if (!selectedDate) {
        return;
      }

      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();

      const startY = pointerEvent.clientY;
      const initialStart = item.startMinutes;
      const initialEnd = item.endMinutes;

      setActivePlanId(item.id);

      const onMove = (moveEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const deltaMinutes = snapMinutes(deltaY / PLAN_MINUTE_HEIGHT);
        const duration = Math.max(MIN_PLAN_BLOCK_MINUTES, initialEnd - initialStart);

        setPlannerByDate((previous) => {
          const current = Array.isArray(previous[selectedDate]) ? previous[selectedDate] : [];
          const targetIndex = current.findIndex((candidate) => candidate.id === item.id);

          if (targetIndex < 0) {
            return previous;
          }

          const target = current[targetIndex];
          let nextStart = target.startMinutes;
          let nextEnd = target.endMinutes;

          if (mode === 'move') {
            nextStart = clampMinutes(initialStart + deltaMinutes, 0, MINUTES_IN_DAY - duration);
            nextEnd = nextStart + duration;
          } else if (mode === 'resize-start') {
            nextStart = clampMinutes(initialStart + deltaMinutes, 0, initialEnd - MIN_PLAN_BLOCK_MINUTES);
            nextEnd = initialEnd;
          } else if (mode === 'resize-end') {
            nextStart = initialStart;
            nextEnd = clampMinutes(initialEnd + deltaMinutes, initialStart + MIN_PLAN_BLOCK_MINUTES, MINUTES_IN_DAY);
          }

          const updated = {
            ...target,
            startMinutes: snapMinutes(nextStart),
            endMinutes: snapMinutes(nextEnd)
          };

          const next = [...current];
          next[targetIndex] = updated;

          return {
            ...previous,
            [selectedDate]: sortPlanItems(next)
          };
        });
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        setActivePlanId('');
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [selectedDate]
  );

  const calculateTravelTimes = useCallback(
    async (eventsWithPositions, activeTravelMode) => {
      if (!baseLatLngRef.current || !distanceMatrixRef.current) {
        return eventsWithPositions;
      }

      const withLocation = eventsWithPositions.filter((event) => event._position);
      if (!withLocation.length) {
        return eventsWithPositions;
      }

      const travelModeValue = window.google.maps.TravelMode[activeTravelMode];
      const enrichedByUrl = new Map(eventsWithPositions.map((event) => [event.eventUrl, { ...event }]));

      const chunkSize = 25;
      for (let index = 0; index < withLocation.length; index += chunkSize) {
        const chunk = withLocation.slice(index, index + chunkSize);
        const response = await distanceMatrixRequest({
          origins: [baseLatLngRef.current],
          destinations: chunk.map((event) => event._position),
          travelMode: travelModeValue
        });

        const elements = response?.rows?.[0]?.elements || [];

        for (let destinationIndex = 0; destinationIndex < chunk.length; destinationIndex += 1) {
          const chunkEvent = chunk[destinationIndex];
          const element = elements[destinationIndex];
          const target = enrichedByUrl.get(chunkEvent.eventUrl);

          if (!target) {
            continue;
          }

          if (element?.status === 'OK') {
            target.travelDurationText = element.duration?.text || '';
          } else {
            target.travelDurationText = 'Unavailable';
          }
        }
      }

      return eventsWithPositions.map((event) => enrichedByUrl.get(event.eventUrl) || event);
    },
    [distanceMatrixRequest]
  );

  const buildEventInfoWindowHtml = useCallback((event, plannerAction) => {
    const location = event.address || event.locationText || 'Location not listed';
    const time = event.startDateTimeText || 'Time not listed';
    const travel = event.travelDurationText || 'Pending';

    return `
      <div style="max-width:330px">
        <h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(event.name)}</h3>
        <p style="margin:4px 0"><strong>Time:</strong> ${escapeHtml(time)}</p>
        <p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(location)}</p>
        <p style="margin:4px 0"><strong>Travel time:</strong> ${escapeHtml(travel)}</p>
        <p style="margin:4px 0">${escapeHtml(truncate(event.description || '', 220))}</p>
        ${buildInfoWindowAddButton(plannerAction)}
        <a href="${escapeHtml(event.eventUrl)}" target="_blank" rel="noreferrer">Open event</a>
      </div>
    `;
  }, []);

  const buildPlaceInfoWindowHtml = useCallback((place, plannerAction) => {
    const displayTag = formatTag(normalizePlaceTag(place.tag));

    return `
      <div style="max-width:340px">
        <h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(place.name)}</h3>
        <p style="margin:4px 0"><strong>Tag:</strong> ${escapeHtml(displayTag)}</p>
        <p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(place.location || 'Unknown')}</p>
        ${place.curatorComment ? `<p style="margin:4px 0"><strong>Curator:</strong> ${escapeHtml(place.curatorComment)}</p>` : ''}
        ${place.description ? `<p style="margin:4px 0">${escapeHtml(place.description)}</p>` : ''}
        ${place.details ? `<p style="margin:4px 0">${escapeHtml(place.details)}</p>` : ''}
        ${buildInfoWindowAddButton(plannerAction)}
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a href="${escapeHtml(place.mapLink)}" target="_blank" rel="noreferrer">Open map</a>
          <a href="${escapeHtml(place.cornerLink)}" target="_blank" rel="noreferrer">Corner page</a>
        </div>
      </div>
    `;
  }, []);

  const renderCurrentSelection = useCallback(
    async (eventsInput, placesInput, dateFilter, activeTravelMode) => {
      if (!mapsReady || !window.google?.maps || !mapRef.current) {
        return;
      }

      clearMapMarkers();

      const filteredEvents = dateFilter
        ? eventsInput.filter((event) => event.startDateISO === dateFilter)
        : [...eventsInput];

      const eventsWithPositions = [];

      for (const event of filteredEvents) {
        const position = await resolvePosition({
          cacheKey: `event:${event.eventUrl}`,
          mapLink: event.googleMapsUrl,
          fallbackLocation: event.address || event.locationText,
          lat: event.lat,
          lng: event.lng
        });

        const eventWithPosition = {
          ...event,
          _position: position,
          travelDurationText: ''
        };

        if (position) {
          const marker = new window.google.maps.Marker({
            map: mapRef.current,
            position,
            title: event.name,
            icon: createLucidePinIcon(calendarIconNode, '#ea580c')
          });

          marker.addListener('click', () => {
            if (!infoWindowRef.current) {
              return;
            }

            const addActionId = selectedDate ? `add-${createPlanId()}` : '';
            const plannerAction = {
              id: addActionId,
              label: selectedDate ? `Add to ${formatDateDayMonth(selectedDate)}` : 'Pick planner date first',
              enabled: Boolean(selectedDate)
            };

            infoWindowRef.current.setContent(buildEventInfoWindowHtml(eventWithPosition, plannerAction));
            infoWindowRef.current.open({ map: mapRef.current, anchor: marker });

            if (addActionId && window.google?.maps?.event) {
              window.google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
                const button = document.getElementById(addActionId);
                if (!button) {
                  return;
                }

                button.addEventListener('click', (clickEvent) => {
                  clickEvent.preventDefault();
                  addEventToDayPlan(eventWithPosition);
                  setStatusMessage(`Added "${eventWithPosition.name}" to ${formatDate(selectedDate)}.`);
                });
              });
            }
          });

          markersRef.current.push(marker);
        }

        eventsWithPositions.push(eventWithPosition);
      }

      const placesWithPositions = [];

      for (const place of placesInput) {
        const position = await resolvePosition({
          cacheKey: `place:${place.id || place.name}`,
          mapLink: place.mapLink,
          fallbackLocation: place.location,
          lat: place.lat,
          lng: place.lng
        });

        const placeWithPosition = {
          ...place,
          _position: position,
          tag: normalizePlaceTag(place.tag)
        };

        if (position) {
          const marker = new window.google.maps.Marker({
            map: mapRef.current,
            position,
            title: place.name,
            icon: createLucidePinIcon(
              getTagIconNode(placeWithPosition.tag),
              getTagColor(placeWithPosition.tag)
            )
          });

          marker.addListener('click', () => {
            if (!infoWindowRef.current) {
              return;
            }

            const addActionId = selectedDate ? `add-${createPlanId()}` : '';
            const plannerAction = {
              id: addActionId,
              label: selectedDate ? `Add to ${formatDateDayMonth(selectedDate)}` : 'Pick planner date first',
              enabled: Boolean(selectedDate)
            };

            infoWindowRef.current.setContent(buildPlaceInfoWindowHtml(placeWithPosition, plannerAction));
            infoWindowRef.current.open({ map: mapRef.current, anchor: marker });

            if (addActionId && window.google?.maps?.event) {
              window.google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
                const button = document.getElementById(addActionId);
                if (!button) {
                  return;
                }

                button.addEventListener('click', (clickEvent) => {
                  clickEvent.preventDefault();
                  addPlaceToDayPlan(placeWithPosition);
                  setStatusMessage(`Added "${placeWithPosition.name}" to ${formatDate(selectedDate)}.`);
                });
              });
            }
          });

          markersRef.current.push(marker);
        }

        placesWithPositions.push(placeWithPosition);
      }

      try {
        const eventsWithTravelTimes = await calculateTravelTimes(eventsWithPositions, activeTravelMode);
        setVisibleEvents(eventsWithTravelTimes);
        setVisiblePlaces(placesWithPositions);
        fitMapToVisiblePoints(eventsWithTravelTimes, placesWithPositions);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Could not calculate travel times.', true);
        setVisibleEvents(eventsWithPositions);
        setVisiblePlaces(placesWithPositions);
        fitMapToVisiblePoints(eventsWithPositions, placesWithPositions);
      }
    },
    [
      mapsReady,
      buildEventInfoWindowHtml,
      buildPlaceInfoWindowHtml,
      calculateTravelTimes,
      clearMapMarkers,
      fitMapToVisiblePoints,
      resolvePosition,
      addEventToDayPlan,
      addPlaceToDayPlan,
      selectedDate,
      setStatusMessage
    ]
  );

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const [config, eventsPayload] = await Promise.all([
          fetchJson('/api/config'),
          fetchJson('/api/events')
        ]);

        if (!mounted) {
          return;
        }

        setBaseLocationText(config.baseLocation || '');

        const loadedEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
        const loadedPlaces = Array.isArray(eventsPayload.places) ? eventsPayload.places : [];

        setAllEvents(loadedEvents);
        setAllPlaces(loadedPlaces);

        if (!config.mapsBrowserKey) {
          setStatusMessage('Missing GOOGLE_MAPS_BROWSER_KEY in .env. Map cannot load.', true);
          return;
        }

        await loadGoogleMapsScript(config.mapsBrowserKey);

        if (!mounted || !mapElementRef.current || !window.google?.maps) {
          return;
        }

        mapRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: { lat: 37.7749, lng: -122.4194 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });

        geocoderRef.current = new window.google.maps.Geocoder();
        distanceMatrixRef.current = new window.google.maps.DistanceMatrixService();
        infoWindowRef.current = new window.google.maps.InfoWindow();

        const geocodedBaseLocation = await geocode(config.baseLocation || '');
        if (geocodedBaseLocation) {
          setBaseMarker(geocodedBaseLocation, `Base location: ${config.baseLocation}`);
        }

        setMapsReady(true);

        const sampleDataNote = eventsPayload?.meta?.sampleData
          ? ' Showing sample data until you sync.'
          : '';

        setStatusMessage(
          `Loaded ${loadedEvents.length} events and ${loadedPlaces.length} curated places.${sampleDataNote}`
        );
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'Failed to initialize app.', true);
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
      clearMapMarkers();
      clearRoute();

      if (baseMarkerRef.current) {
        baseMarkerRef.current.setMap(null);
      }
    };
  }, [clearMapMarkers, clearRoute, geocode, setBaseMarker, setStatusMessage]);

  useEffect(() => {
    if (!mapsReady) {
      return;
    }

    void renderCurrentSelection(allEvents, filteredPlaces, effectiveDateFilter, travelMode);
  }, [allEvents, effectiveDateFilter, filteredPlaces, mapsReady, renderCurrentSelection, travelMode]);

  useEffect(() => {
    if (!mapsReady || !window.google?.maps) {
      return;
    }

    let cancelled = false;

    async function drawPlannedRoute() {
      if (!mapRef.current) {
        setIsRouteUpdating(false);
        return;
      }

      if (!selectedDate || dayPlanItems.length === 0) {
        clearRoute();
        setRouteSummary('');
        return;
      }

      if (!baseLatLngRef.current) {
        clearRoute();
        setRouteSummary('Set your home location before drawing a route.');
        return;
      }

      const routeStops = plannedRouteStops.slice(0, MAX_ROUTE_STOPS);

      if (routeStops.length === 0) {
        clearRoute();
        setRouteSummary('Route needs map-ready items with known coordinates.');
        return;
      }

      try {
        setIsRouteUpdating(true);
        applyRoutePolylineStyle(true);

        const route = await requestPlannedRoute({
          origin: baseLatLngRef.current,
          destination: baseLatLngRef.current,
          waypoints: routeStops.map((stop) => stop.position),
          travelMode
        });

        if (cancelled) {
          return;
        }

        if (!routePolylineRef.current) {
          routePolylineRef.current = new window.google.maps.Polyline({
            path: route.path,
            strokeColor: '#1d4ed8',
            strokeOpacity: 0.86,
            strokeWeight: 5
          });
          routePolylineRef.current.setMap(mapRef.current);
        } else {
          routePolylineRef.current.setPath(route.path);
          routePolylineRef.current.setMap(mapRef.current);
        }

        applyRoutePolylineStyle(false);
        setIsRouteUpdating(false);

        const routeSuffix =
          plannedRouteStops.length > MAX_ROUTE_STOPS ? ` (showing first ${MAX_ROUTE_STOPS})` : '';

        setRouteSummary(
          `${routeStops.length} stops${routeSuffix} · ${formatDistance(route.totalDistanceMeters)} · ${formatDurationFromSeconds(route.totalDurationSeconds)}`
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        applyRoutePolylineStyle(false);
        setIsRouteUpdating(false);
        const message =
          error instanceof Error
            ? error.message
            : 'Could not draw route for the current plan and travel mode.';
        setRouteSummary(message);
      }
    }

    void drawPlannedRoute();

    return () => {
      cancelled = true;
    };
  }, [
    applyRoutePolylineStyle,
    clearRoute,
    dayPlanItems.length,
    mapsReady,
    plannedRouteStops,
    selectedDate,
    travelMode
  ]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setStatusMessage('Syncing latest events with Firecrawl...');

    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Sync failed');
      }

      const syncedEvents = Array.isArray(payload.events) ? payload.events : [];
      setAllEvents(syncedEvents);

      if (Array.isArray(payload.places)) {
        setAllPlaces(payload.places);
      }

      setStatusMessage(`Synced ${syncedEvents.length} events at ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Sync failed', true);
    } finally {
      setIsSyncing(false);
    }
  }, [setStatusMessage]);

  const handleDeviceLocation = useCallback(() => {
    if (!navigator.geolocation || !window.google?.maps) {
      setStatusMessage('Geolocation is not supported in this browser.', true);
      return;
    }

    setStatusMessage('Finding your current location...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latLng = new window.google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        setBaseMarker(latLng, 'My current location');
        await renderCurrentSelection(allEvents, filteredPlaces, effectiveDateFilter, travelMode);
        setStatusMessage('Using your live device location as trip origin.');
      },
      (error) => {
        setStatusMessage(error.message || 'Could not get device location.', true);
      }
    );
  }, [allEvents, effectiveDateFilter, filteredPlaces, renderCurrentSelection, setBaseMarker, setStatusMessage, travelMode]);

  const handleExportPlannerIcs = useCallback(() => {
    if (!selectedDate || dayPlanItems.length === 0) {
      setStatusMessage('Add planner stops before exporting iCal.', true);
      return;
    }

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
    if (!selectedDate || dayPlanItems.length === 0) {
      setStatusMessage('Add planner stops before opening Google Calendar.', true);
      return;
    }

    const draftUrls = buildGoogleCalendarStopUrls({
      dateISO: selectedDate,
      planItems: dayPlanItems,
      baseLocationText
    });

    let openedCount = 0;
    for (const calendarUrl of draftUrls) {
      const draftWindow = window.open(calendarUrl, '_blank', 'noopener,noreferrer');
      if (draftWindow) {
        openedCount += 1;
      }
    }

    if (openedCount === 0) {
      setStatusMessage('Google Calendar pop-up blocked. Allow pop-ups and try again.', true);
      return;
    }

    if (openedCount < draftUrls.length) {
      setStatusMessage(
        `Opened ${openedCount}/${draftUrls.length} Google drafts. Your browser blocked some pop-ups.`,
        true
      );
      return;
    }

    setStatusMessage(`Opened ${openedCount} Google Calendar drafts for ${formatDate(toDateOnlyISO(selectedDate))}.`);
  }, [baseLocationText, dayPlanItems, selectedDate, setStatusMessage]);

  const goToSidebarTab = useCallback((tab) => {
    setActiveMobilePanel(tab);
    sidebarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const goToMap = useCallback(() => {
    mapPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const shiftCalendarMonth = useCallback((offset) => {
    const shifted = addMonthsToMonthISO(calendarAnchorISO, offset);
    setCalendarMonthISO(shifted);
  }, [calendarAnchorISO]);

  const dateLabel = selectedDate ? formatDate(selectedDate) : 'No dated events';
  const travelReadyCount = visibleEvents.filter(
    (event) => event.travelDurationText && event.travelDurationText !== 'Unavailable'
  ).length;
  const routeSummaryText =
    routeSummary || (selectedDate && dayPlanItems.length ? 'Waiting for routable stops...' : 'Add stops to draw route');

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>SF Trip Planner</h1>
        <nav className="topbar-nav" aria-label="App navigator">
          <button
            type="button"
            className="topbar-nav-item"
            onClick={goToMap}
          >
            <MapPin size={14} />
            Map
          </button>
          <button
            type="button"
            className={`topbar-nav-item${activeMobilePanel === 'calendar' ? ' topbar-nav-item-active' : ''}`}
            onClick={() => { goToSidebarTab('calendar'); }}
          >
            <Calendar size={14} />
            Calendar
          </button>
          <button
            type="button"
            className={`topbar-nav-item${activeMobilePanel === 'planner' ? ' topbar-nav-item-active' : ''}`}
            onClick={() => { goToSidebarTab('planner'); }}
          >
            <Navigation size={14} />
            Day Route
          </button>
          <button
            type="button"
            className={`topbar-nav-item${activeMobilePanel === 'events' ? ' topbar-nav-item-active' : ''}`}
            onClick={() => { goToSidebarTab('events'); }}
          >
            <PartyPopper size={14} />
            Events
          </button>
          <button
            type="button"
            className={`topbar-nav-item${activeMobilePanel === 'places' ? ' topbar-nav-item-active' : ''}`}
            onClick={() => { goToSidebarTab('places'); }}
          >
            <Coffee size={14} />
            Spots
          </button>
        </nav>
        <div className="topbar-actions">
          <Button id="sync-button" type="button" size="sm" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw size={14} className={isSyncing ? 'spin-icon' : ''} />
            {isSyncing ? 'Syncing…' : 'Sync'}
          </Button>
          <Button variant="secondary" id="use-device-location" type="button" size="sm" onClick={handleDeviceLocation}>
            <Navigation size={14} />
            My Location
          </Button>
        </div>
      </header>

      <section className="layout">
        <section className="map-panel" ref={mapPanelRef}>
          <div className="map-legend">
            <span className="legend-item">
              <Calendar className="legend-icon" size={14} strokeWidth={2} /> Event
            </span>
            <span className="legend-item">
              <House className="legend-icon" size={14} strokeWidth={2} /> Your origin
            </span>
            {Object.keys(TAG_COLORS).map((tag) => {
              const TagIcon = getTagIconComponent(tag);

              return (
                <span className="legend-item" key={tag}>
                  <TagIcon className="legend-icon" size={14} strokeWidth={2} /> {formatTag(tag)}
                </span>
              );
            })}
          </div>
          <div className="map-container">
            <div id="map" ref={mapElementRef} />
            <div className="map-status-overlay" role="status">
              <span className={`status-dot${statusError ? ' status-dot-error' : ''}`} />
              <span style={{ color: statusError ? '#e11d48' : undefined }}>{status}</span>
            </div>
          </div>
        </section>

        <aside className="sidebar" ref={sidebarRef}>
          <Tabs className="sidebar-switch" value={activeMobilePanel} onValueChange={setActiveMobilePanel}>
            <TabsList>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="planner">Day Route</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="places">Spots</TabsTrigger>
            </TabsList>
          </Tabs>

          <section className={`panel ${activeMobilePanel !== 'calendar' ? 'panel-hidden' : ''}`}>
            <div className="calendar-panel-header">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => { shiftCalendarMonth(-1); }}
              >
                Prev
              </Button>
              <h2>{formatMonthYear(calendarAnchorISO)}</h2>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => { shiftCalendarMonth(1); }}
              >
                Next
              </Button>
            </div>

            <div className="calendar-weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarDays.map((dayISO) => {
                const isCurrentMonth = toMonthISO(dayISO) === toMonthISO(calendarAnchorISO);
                const isSelected = dayISO === selectedDate;
                const eventCount = eventsByDate.get(dayISO) || 0;
                const planCount = planItemsByDate.get(dayISO) || 0;

                return (
                  <button
                    key={dayISO}
                    type="button"
                    className={[
                      'calendar-day',
                      isCurrentMonth ? '' : 'calendar-day-outside',
                      isSelected ? 'calendar-day-selected' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      setSelectedDate(dayISO);
                      setShowAllEvents(false);
                    }}
                  >
                    <span className="calendar-day-num">{formatDayOfMonth(dayISO)}</span>
                    <span className="calendar-day-meta">{eventCount} e</span>
                    <span className="calendar-day-meta calendar-day-plan">{planCount} p</span>
                  </button>
                );
              })}
            </div>

            <p className="event-meta panel-subtitle">
              Tap a date to set planner day. `e` = events, `p` = planned stops.
            </p>
          </section>

          <section className={`panel ${activeMobilePanel !== 'planner' ? 'panel-hidden' : ''}`}>
            <div className="planner-panel-header">
              <div>
                <h2>Day Route Builder</h2>
                <p className="event-meta panel-subtitle">
                  {selectedDate
                    ? `Planning for ${formatDate(selectedDate)}`
                    : 'Pick a date from the calendar to start planning.'}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={clearDayPlan}
                disabled={!selectedDate || dayPlanItems.length === 0}
              >
                Clear
              </Button>
            </div>

            <div className="panel-inline-controls">
              <div className="panel-control-row">
                <label htmlFor="travel-mode">Travel</label>
                <Select value={travelMode} onValueChange={setTravelMode}>
                  <SelectTrigger id="travel-mode">
                    <SelectValue placeholder="Travel mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRIVING">Driving</SelectItem>
                    <SelectItem value="TRANSIT">Transit</SelectItem>
                    <SelectItem value="WALKING">Walking</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="date-strip" role="tablist" aria-label="Planner dates">
              {uniqueDates.length === 0 ? (
                <span className="date-strip-empty">No event dates</span>
              ) : (
                uniqueDates.map((dateISO) => {
                  const isActive = dateISO === selectedDate;
                  const eventCount = eventsByDate.get(dateISO) || 0;

                  return (
                    <button
                      key={dateISO}
                      type="button"
                      className={`date-pill${isActive ? ' date-pill-active' : ''}`}
                      onClick={() => { setSelectedDate(dateISO); }}
                    >
                      <span className="date-pill-weekday">{formatDateWeekday(dateISO)}</span>
                      <span className="date-pill-day">{formatDateDayMonth(dateISO)}</span>
                      <span className="date-pill-count">{eventCount} ev</span>
                    </button>
                  );
                })
              )}
            </div>

            {selectedDate ? (
              <div className="planner-calendar">
                <div className="planner-time-grid">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div className="planner-hour-row" key={hour} style={{ top: `${hour * PLAN_HOUR_HEIGHT}px` }}>
                      <span className="planner-hour-label">{formatHour(hour)}</span>
                    </div>
                  ))}
                </div>

                <div className="planner-block-layer">
                  {dayPlanItems.map((item) => {
                    const top = item.startMinutes * PLAN_MINUTE_HEIGHT;
                    const height = Math.max(28, (item.endMinutes - item.startMinutes) * PLAN_MINUTE_HEIGHT);
                    const itemClass = [
                      'planner-item',
                      item.kind === 'event' ? 'planner-item-event' : 'planner-item-place',
                      activePlanId === item.id ? 'planner-item-active' : ''
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <article
                        className={itemClass}
                        key={item.id}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onPointerDown={(event) => { startPlanDrag(event, item, 'move'); }}
                      >
                        <button
                          type="button"
                          className="planner-resize planner-resize-top"
                          aria-label="Adjust start time"
                          onPointerDown={(event) => { startPlanDrag(event, item, 'resize-start'); }}
                        />
                        <button
                          type="button"
                          className="planner-remove"
                          aria-label="Remove from plan"
                          onClick={(event) => { event.stopPropagation(); removePlanItem(item.id); }}
                        >
                          ×
                        </button>
                        <div className="planner-item-time">{formatMinuteLabel(item.startMinutes)} - {formatMinuteLabel(item.endMinutes)}</div>
                        <div className="planner-item-title">{item.title}</div>
                        {item.locationText ? <div className="planner-item-location">{item.locationText}</div> : null}
                        <button
                          type="button"
                          className="planner-resize planner-resize-bottom"
                          aria-label="Adjust end time"
                          onPointerDown={(event) => { startPlanDrag(event, item, 'resize-end'); }}
                        />
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="empty-state">Pick a date to start your day plan.</p>
            )}

            <div className="planner-route-summary" role="status" aria-live="polite">
              <strong>Route:</strong> {routeSummaryText}
              {isRouteUpdating ? <span className="route-update-indicator">Updating...</span> : null}
            </div>
            <div className="planner-export-actions">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleExportPlannerIcs}
                disabled={!selectedDate || dayPlanItems.length === 0}
              >
                Download .ics
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleAddDayPlanToGoogleCalendar}
                disabled={!selectedDate || dayPlanItems.length === 0}
              >
                Google Calendar
              </Button>
            </div>
          </section>

          <section className={`panel ${activeMobilePanel !== 'events' ? 'panel-hidden' : ''}`}>
            <div className="panel-section-header">
              <h2>Events</h2>
              <div className="panel-stat-chips">
                <span className="stat-chip">{visibleEvents.length} showing</span>
                <span className="stat-chip">{travelReadyCount} with travel</span>
              </div>
            </div>

            <div className="panel-inline-controls">
              <div className="panel-control-row">
                <label>View</label>
                <ToggleGroup
                  className="tag-filter-list"
                  type="single"
                  value={showAllEvents ? 'all' : 'day'}
                  onValueChange={(value) => {
                    if (value === 'all') { setShowAllEvents(true); }
                    if (value === 'day') { setShowAllEvents(false); }
                  }}
                >
                  <ToggleGroupItem className="tag-chip" value="day">Planner Day</ToggleGroupItem>
                  <ToggleGroupItem className="tag-chip" value="all">All Dates</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            <p className="event-meta panel-subtitle">
              <strong>Origin:</strong> {baseLocationText || 'Not set'}
            </p>
            <div className="card-list">
              {visibleEvents.length === 0 ? (
                <p className="empty-state">No events found for this date filter.</p>
              ) : (
                visibleEvents.map((event) => {
                  const location = event.address || event.locationText || 'Location not listed';
                  const time = event.startDateTimeText || 'Time not listed';

                  return (
                    <Card className="item-card" key={event.eventUrl}>
                      <h3>{event.name}</h3>
                      <p className="event-meta">
                        <strong>Time:</strong> {time}
                      </p>
                      <p className="event-meta">
                        <strong>Location:</strong> {location}
                      </p>
                      {event.travelDurationText ? (
                        <p className="event-meta">
                          <strong>Travel:</strong> {event.travelDurationText}
                        </p>
                      ) : null}
                      <p className="event-meta">{truncate(event.description || '', 170)}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => { addEventToDayPlan(event); }}
                      >
                        Add to day
                      </Button>
                      <a className="event-link" href={event.eventUrl} target="_blank" rel="noreferrer">
                        Open event
                      </a>
                    </Card>
                  );
                })
              )}
            </div>
          </section>

          <section className={`panel ${activeMobilePanel !== 'places' ? 'panel-hidden' : ''}`}>
            <div className="panel-section-header">
              <h2>Curated Spots</h2>
              <span className="stat-chip">{visiblePlaces.length} places</span>
            </div>

            <div className="panel-inline-controls">
              <div className="panel-control-row">
                <label>Category</label>
                <ToggleGroup
                  className="tag-filter-list"
                  type="single"
                  value={placeTagFilter}
                  onValueChange={(value) => { if (value) { setPlaceTagFilter(value); } }}
                >
                  {placeTagOptions.map((tag) => (
                    <ToggleGroupItem key={tag} className="tag-chip" value={tag}>
                      {formatTag(tag)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            <div className="card-list">
              {visiblePlaces.length === 0 ? (
                <p className="empty-state">No curated places in this category.</p>
              ) : (
                visiblePlaces.map((place) => (
                  <Card className="item-card" key={place.id || `${place.name}-${place.location}`}>
                    <div className="item-topline">
                      <h3>{place.name}</h3>
                      <Badge
                        className="tag-pill"
                        variant="secondary"
                        style={{ backgroundColor: `${getTagColor(place.tag)}22`, color: getTagColor(place.tag) }}
                      >
                        {formatTag(place.tag)}
                      </Badge>
                    </div>
                    <p className="event-meta">
                      <strong>Location:</strong> {place.location}
                    </p>
                    {place.curatorComment ? (
                      <p className="event-meta">
                        <strong>Curator note:</strong> {place.curatorComment}
                      </p>
                    ) : null}
                    {place.description ? <p className="event-meta">{truncate(place.description, 180)}</p> : null}
                    {place.details ? <p className="event-meta">{truncate(place.details, 220)}</p> : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => { addPlaceToDayPlan(place); }}
                    >
                      Add to day
                    </Button>
                    <p className="event-meta links-row">
                      <a className="event-link" href={place.mapLink} target="_blank" rel="noreferrer">
                        Open map
                      </a>
                      <a className="event-link" href={place.cornerLink} target="_blank" rel="noreferrer">
                        Corner page
                      </a>
                    </p>
                  </Card>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function getTagColor(tag) {
  return TAG_COLORS[normalizePlaceTag(tag)] || '#2563eb';
}

function getTagIconComponent(tag) {
  return TAG_ICON_COMPONENTS[normalizePlaceTag(tag)] || MapPin;
}

function getTagIconNode(tag) {
  return TAG_ICON_NODES[normalizePlaceTag(tag)] || mapPinIconNode;
}

function buildInfoWindowAddButton(plannerAction) {
  if (!plannerAction) {
    return '';
  }

  if (!plannerAction.enabled || !plannerAction.id) {
    return `<p style="margin:6px 0;color:#64748b;font-size:12px;">Pick a planner date first to add this stop.</p>`;
  }

  return `
    <button
      id="${escapeHtml(plannerAction.id)}"
      type="button"
      style="margin:6px 0 8px;padding:6px 10px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;"
    >
      ${escapeHtml(plannerAction.label || 'Add to selected date')}
    </button>
  `;
}

function createLucidePinIcon(iconNode, color) {
  const iconSvg = renderLucideIconNode(iconNode);
  const svg = `
    <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"38\" height=\"48\" viewBox=\"0 0 38 48\">
      <path d=\"M19 1C9.6 1 2 8.6 2 18c0 11.7 14.1 26.9 16.2 29.1a1.2 1.2 0 0 0 1.6 0C21.9 44.9 36 29.7 36 18 36 8.6 28.4 1 19 1z\" fill=\"${color}\" stroke=\"#ffffff\" stroke-width=\"2\" />
      <circle cx=\"19\" cy=\"18\" r=\"10\" fill=\"rgba(255,255,255,0.16)\" />
      <g transform=\"translate(7 6)\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">
        ${iconSvg}
      </g>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(38, 48),
    anchor: new window.google.maps.Point(19, 47)
  };
}

function renderLucideIconNode(iconNode) {
  if (!Array.isArray(iconNode)) {
    return '';
  }

  return iconNode
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs || {})
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${toKebabCase(key)}="${escapeHtml(String(value))}"`)
        .join(' ');

      return `<${tag} ${attributes} />`;
    })
    .join('');
}

function toKebabCase(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function normalizePlaceTag(tag) {
  const value = String(tag || '').toLowerCase().trim();
  if (value === 'bars' || value === 'bar') return 'bar';
  if (value === 'cafe' || value === 'cafes') return 'cafes';
  if (value === 'eat' || value === 'food' || value === 'restaurant' || value === 'restaurants') return 'eat';
  if (value === 'go out' || value === 'nightlife') return 'go out';
  if (value === 'shop' || value === 'shops') return 'shops';
  return 'cafes';
}

function normalizeAddressKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s,.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTag(tag) {
  if (tag === 'all') {
    return 'All';
  }

  return String(tag)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getPlaceSourceKey(place) {
  return place.id || `${place.name}|${place.location}`;
}

function createPlanId() {
  return `plan-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizePlannerByDate(value) {
  const result = {};

  for (const [dateISO, items] of Object.entries(value || {})) {
    if (!Array.isArray(items) || !dateISO) {
      continue;
    }

    const cleanedItems = items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const startMinutes = clampMinutes(Number(item.startMinutes), 0, MINUTES_IN_DAY);
        const endMinutes = clampMinutes(
          Number(item.endMinutes),
          startMinutes + MIN_PLAN_BLOCK_MINUTES,
          MINUTES_IN_DAY
        );

        return {
          id: typeof item.id === 'string' && item.id ? item.id : createPlanId(),
          kind: item.kind === 'event' ? 'event' : 'place',
          sourceKey: String(item.sourceKey || ''),
          title: String(item.title || 'Untitled stop'),
          locationText: String(item.locationText || ''),
          link: String(item.link || ''),
          tag: normalizePlaceTag(item.tag),
          startMinutes,
          endMinutes
        };
      })
      .filter((item) => item.sourceKey);

    result[dateISO] = sortPlanItems(cleanedItems);
  }

  return result;
}

function compactPlannerByDate(value) {
  const compacted = {};

  for (const [dateISO, items] of Object.entries(value || {})) {
    if (!Array.isArray(items) || items.length === 0) {
      continue;
    }

    compacted[dateISO] = items;
  }

  return compacted;
}

function hasPlannerEntries(value) {
  return Object.values(value || {}).some((items) => Array.isArray(items) && items.length > 0);
}

function sortPlanItems(items) {
  return [...items].sort((left, right) => left.startMinutes - right.startMinutes);
}

function clampMinutes(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function snapMinutes(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value / PLAN_SNAP_MINUTES) * PLAN_SNAP_MINUTES;
}

function parseEventTimeRange(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const matches = [...value.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi)];
  if (!matches.length) {
    return null;
  }

  const start = toMinuteOfDay(matches[0]);
  const fallbackEnd = clampMinutes(start + 90, start + MIN_PLAN_BLOCK_MINUTES, MINUTES_IN_DAY);
  const endFromText = matches[1] ? toMinuteOfDay(matches[1]) : fallbackEnd;
  const end = endFromText > start ? endFromText : fallbackEnd;

  return {
    startMinutes: start,
    endMinutes: end
  };
}

function toMinuteOfDay(match) {
  const hourRaw = Number(match?.[1] || 0);
  const minuteRaw = Number(match?.[2] || 0);
  const period = String(match?.[3] || '').toUpperCase();

  let hour = hourRaw % 12;
  if (period === 'PM') {
    hour += 12;
  }

  return clampMinutes(hour * 60 + minuteRaw, 0, MINUTES_IN_DAY - MIN_PLAN_BLOCK_MINUTES);
}

function getSuggestedPlanSlot(existingItems, preferredRange, fallbackDurationMinutes) {
  const duration = Math.max(MIN_PLAN_BLOCK_MINUTES, fallbackDurationMinutes);
  const sorted = sortPlanItems(existingItems || []);

  if (preferredRange) {
    const preferredStart = clampMinutes(preferredRange.startMinutes, 0, MINUTES_IN_DAY - MIN_PLAN_BLOCK_MINUTES);
    const preferredEnd = clampMinutes(
      preferredRange.endMinutes,
      preferredStart + MIN_PLAN_BLOCK_MINUTES,
      MINUTES_IN_DAY
    );

    if (!hasOverlappingSlot(sorted, preferredStart, preferredEnd)) {
      return {
        startMinutes: preferredStart,
        endMinutes: preferredEnd
      };
    }
  }

  let cursor = 9 * 60;
  const maxStart = MINUTES_IN_DAY - duration;

  while (cursor <= maxStart) {
    const start = snapMinutes(cursor);
    const end = start + duration;

    if (!hasOverlappingSlot(sorted, start, end)) {
      return {
        startMinutes: start,
        endMinutes: end
      };
    }

    cursor += PLAN_SNAP_MINUTES;
  }

  return {
    startMinutes: clampMinutes(MINUTES_IN_DAY - duration, 0, MINUTES_IN_DAY - MIN_PLAN_BLOCK_MINUTES),
    endMinutes: MINUTES_IN_DAY
  };
}

function hasOverlappingSlot(items, startMinutes, endMinutes) {
  return items.some(
    (item) =>
      Math.max(startMinutes, item.startMinutes) < Math.min(endMinutes, item.endMinutes)
  );
}

function formatMinuteLabel(minutesValue) {
  const minutes = clampMinutes(minutesValue, 0, MINUTES_IN_DAY);
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  const minuteText = minute.toString().padStart(2, '0');
  return `${hour12}:${minuteText} ${period}`;
}

function formatHour(hourValue) {
  const hour = Number(hourValue);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12} ${period}`;
}

function parseDurationToMinutes(durationText) {
  if (!durationText || typeof durationText !== 'string') {
    return null;
  }

  if (durationText.toLowerCase() === 'unavailable') {
    return null;
  }

  const hourMatch = durationText.match(/(\d+)\s*hour/i);
  const minMatch = durationText.match(/(\d+)\s*min/i);

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const mins = minMatch ? Number(minMatch[1]) : 0;

  if (!Number.isFinite(hours) || !Number.isFinite(mins)) {
    return null;
  }

  const total = hours * 60 + mins;
  return total > 0 ? total : null;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(isoDate) {
  const parsedDate = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return parsedDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatDateWeekday(isoDate) {
  const parsedDate = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return parsedDate.toLocaleDateString(undefined, {
    weekday: 'short'
  });
}

function formatDateDayMonth(isoDate) {
  const parsedDate = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function formatMonthYear(isoDate) {
  const parsedDate = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
}

function formatDayOfMonth(isoDate) {
  const parsedDate = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return String(parsedDate.getDate());
}

function toISODate(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function toMonthISO(isoDate) {
  if (typeof isoDate !== 'string' || isoDate.length < 7) {
    return '';
  }

  return `${isoDate.slice(0, 7)}-01`;
}

function addMonthsToMonthISO(monthISO, offset) {
  const parsed = new Date(`${monthISO}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return toMonthISO(toISODate(new Date()));
  }

  parsed.setMonth(parsed.getMonth() + offset);
  parsed.setDate(1);
  return toISODate(parsed);
}

function buildCalendarGridDates(anchorISO) {
  const anchor = new Date(`${toMonthISO(anchorISO)}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) {
    return [];
  }

  const start = new Date(anchor);
  start.setDate(1 - start.getDay());

  const dates = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    dates.push(toISODate(date));
  }

  return dates;
}

function formatDistance(totalMeters) {
  if (!Number.isFinite(totalMeters) || totalMeters <= 0) {
    return 'n/a';
  }

  const miles = totalMeters / 1609.344;
  if (miles >= 10) {
    return `${miles.toFixed(0)} mi`;
  }

  return `${miles.toFixed(1)} mi`;
}

function formatDurationFromSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return 'n/a';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function buildPlannerIcs(dateISO, planItems) {
  const dateOnlyISO = toDateOnlyISO(dateISO);
  const sortedItems = sortPlanItems(planItems);
  const timestamp = toIcsUtcTimestamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SF Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  for (const item of sortedItems) {
    const startValue = toCalendarDateTime(dateOnlyISO, item.startMinutes);
    const endValue = toCalendarDateTime(dateOnlyISO, item.endMinutes);
    const descriptionParts = [
      `Type: ${item.kind === 'event' ? 'Event' : 'Place'}`,
      item.link ? `Link: ${item.link}` : ''
    ].filter(Boolean);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(`${item.id}-${dateOnlyISO}@sf-trip.local`)}`,
      `DTSTAMP:${timestamp}`,
      `DTSTART:${startValue}`,
      `DTEND:${endValue}`,
      `SUMMARY:${escapeIcsText(item.title || 'Trip stop')}`,
      `LOCATION:${escapeIcsText(item.locationText || 'San Francisco')}`,
      `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function buildGoogleCalendarStopUrls({ dateISO, planItems, baseLocationText }) {
  const dateOnlyISO = toDateOnlyISO(dateISO);
  const sortedItems = sortPlanItems(planItems);
  return sortedItems.map((item) => {
    const startValue = toCalendarDateTime(dateOnlyISO, item.startMinutes);
    const endMinutes = Math.max(item.endMinutes, item.startMinutes + MIN_PLAN_BLOCK_MINUTES);
    const endValue = toCalendarDateTime(dateOnlyISO, endMinutes);
    const detailsParts = [
      `Planned time: ${formatMinuteLabel(item.startMinutes)} - ${formatMinuteLabel(item.endMinutes)}`,
      item.kind === 'event' ? 'Type: Event' : 'Type: Place',
      item.link || ''
    ].filter(Boolean);

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${item.title} - ${formatDate(dateOnlyISO)}`,
      dates: `${startValue}/${endValue}`,
      details: detailsParts.join('\n'),
      location: item.locationText || baseLocationText || 'San Francisco, CA',
      ctz: 'America/Los_Angeles'
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  });
}

function toCalendarDateTime(dateISO, minutesFromMidnight) {
  const normalizedDateISO = toDateOnlyISO(dateISO);
  const [year, month, day] = normalizedDateISO
    .split('-')
    .map((part) => Number(part));
  const clampedMinutes = clampMinutes(minutesFromMidnight, 0, MINUTES_IN_DAY);
  const hours = Math.floor(clampedMinutes / 60);
  const minutes = clampedMinutes % 60;

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('') + `T${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}00`;
}

function toIcsUtcTimestamp(dateInput) {
  return new Date(dateInput).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function toDateOnlyISO(value) {
  const text = String(value || '').trim();
  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return [
      parsedDate.getFullYear(),
      String(parsedDate.getMonth() + 1).padStart(2, '0'),
      String(parsedDate.getDate()).padStart(2, '0')
    ].join('-');
  }

  return toISODate(new Date());
}

function escapeIcsText(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\n')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

async function requestPlannedRoute({ origin, destination, waypoints, travelMode }) {
  const originPoint = toLatLngLiteral(origin);
  const destinationPoint = toLatLngLiteral(destination);

  if (!originPoint || !destinationPoint) {
    throw new Error('Set your home location before drawing a route.');
  }

  const waypointPoints = Array.isArray(waypoints)
    ? waypoints.map(toLatLngLiteral).filter(Boolean)
    : [];

  const response = await fetch('/api/route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      origin: originPoint,
      destination: destinationPoint,
      waypoints: waypointPoints,
      travelMode
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `Route request failed: ${response.status}`);
  }

  const path = decodeEncodedPolyline(payload.encodedPolyline || '');
  if (!path.length) {
    throw new Error('No route geometry returned for this plan.');
  }

  return {
    path,
    totalDistanceMeters: Number(payload.totalDistanceMeters) || 0,
    totalDurationSeconds: Number(payload.totalDurationSeconds) || 0
  };
}

function toLatLngLiteral(position) {
  if (!position) {
    return null;
  }

  const latValue = typeof position.lat === 'function' ? position.lat() : position.lat;
  const lngValue = typeof position.lng === 'function' ? position.lng() : position.lng;
  const lat = Number(latValue);
  const lng = Number(lngValue);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function decodeEncodedPolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') {
    return [];
  }

  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const latitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += latitudeDelta;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const longitudeDelta = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += longitudeDelta;

    coordinates.push({
      lat: latitude / 1e5,
      lng: longitude / 1e5
    });
  }

  return coordinates;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

function loadGoogleMapsScript(apiKey) {
  if (window.google?.maps) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const callbackName = `initGoogleMaps_${Math.random().toString(36).slice(2)}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete window[callbackName];
      reject(new Error('Failed to load Google Maps script.'));
    };

    document.head.appendChild(script);
  });
}
