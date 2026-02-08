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
  const [activeView, setActiveView] = useState('dayroute');
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

  const groupedSources = useMemo(() => {
    const groups = {
      event: [],
      spot: []
    };

    for (const source of sources) {
      const key = source?.sourceType === 'spot' ? 'spot' : 'event';
      groups[key].push(source);
    }

    return groups;
  }, [sources]);

  const uniqueDates = useMemo(
    () =>
      Array.from(
        new Set(
          allEvents
            .map((event) => normalizeDateKey(event.startDateISO))
            .filter(Boolean)
        )
      ).sort(),
    [allEvents]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map();

    for (const date of uniqueDates) {
      map.set(date, 0);
    }

    for (const event of allEvents) {
      const normalizedDateISO = normalizeDateKey(event.startDateISO);
      if (!normalizedDateISO) {
        continue;
      }

      map.set(normalizedDateISO, (map.get(normalizedDateISO) || 0) + 1);
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

  const loadSourcesFromServer = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/sources');
      const nextSources = Array.isArray(payload?.sources) ? payload.sources : [];
      setSources(nextSources);
    } catch (error) {
      console.error('Failed to load sources.', error);
    }
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
    if (!address || !window.google?.maps) {
      return null;
    }

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ address })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        return null;
      }

      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return new window.google.maps.LatLng(lat, lng);
    } catch {
      return null;
    }
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
      const baseKey = toCoordinateKey(baseLatLngRef.current);

      if (!travelModeValue || !baseKey) {
        return eventsWithPositions;
      }

      const enrichedByUrl = new Map(eventsWithPositions.map((event) => [event.eventUrl, { ...event }]));
      const missingEvents = [];

      for (const event of withLocation) {
        const destinationKey = toCoordinateKey(event._position);
        if (!destinationKey) {
          missingEvents.push(event);
          continue;
        }

        const cacheKey = createTravelTimeCacheKey({
          travelMode: activeTravelMode,
          baseKey,
          destinationKey
        });
        const cachedDuration = travelTimeCacheRef.current.get(cacheKey);

        if (typeof cachedDuration === 'string') {
          const target = enrichedByUrl.get(event.eventUrl);
          if (target) {
            target.travelDurationText = cachedDuration;
          }
        } else {
          missingEvents.push(event);
        }
      }

      const chunkSize = 25;
      for (let index = 0; index < missingEvents.length; index += chunkSize) {
        const chunk = missingEvents.slice(index, index + chunkSize);
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

          const destinationKey = toCoordinateKey(chunkEvent._position);
          if (element?.status === 'OK') {
            const durationText = element.duration?.text || '';
            target.travelDurationText = durationText;

            if (destinationKey) {
              const cacheKey = createTravelTimeCacheKey({
                travelMode: activeTravelMode,
                baseKey,
                destinationKey
              });
              travelTimeCacheRef.current.set(cacheKey, durationText);
            }
          } else {
            target.travelDurationText = 'Unavailable';

            if (destinationKey) {
              const cacheKey = createTravelTimeCacheKey({
                travelMode: activeTravelMode,
                baseKey,
                destinationKey
              });
              travelTimeCacheRef.current.set(cacheKey, 'Unavailable');
            }
          }
        }
      }

      if (travelTimeCacheRef.current.size > 4000) {
        travelTimeCacheRef.current.clear();
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
        ? eventsInput.filter((event) => normalizeDateKey(event.startDateISO) === dateFilter)
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
        const [config, eventsPayload, sourcesPayload] = await Promise.all([
          fetchJson('/api/config'),
          fetchJson('/api/events'),
          fetchJson('/api/sources').catch(() => ({ sources: [] }))
        ]);

        if (!mounted) {
          return;
        }

        setBaseLocationText(config.baseLocation || '');

        const loadedEvents = Array.isArray(eventsPayload.events) ? eventsPayload.events : [];
        const loadedPlaces = Array.isArray(eventsPayload.places) ? eventsPayload.places : [];
        const loadedSources = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : [];

        setAllEvents(loadedEvents);
        setAllPlaces(loadedPlaces);
        setSources(loadedSources);

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
    const timeoutId = window.setTimeout(() => {
      void drawPlannedRoute();
    }, 320);

    async function drawPlannedRoute() {
      if (!mapRef.current) {
        setIsRouteUpdating(false);
        return;
      }

      if (activePlanId) {
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

        const routeRequestInput = {
          origin: baseLatLngRef.current,
          destination: baseLatLngRef.current,
          waypoints: routeStops.map((stop) => stop.position),
          travelMode
        };
        const routeCacheKey = createRouteRequestCacheKey(routeRequestInput);
        let route = routeCacheKey ? plannedRouteCacheRef.current.get(routeCacheKey) : null;

        if (!route) {
          route = await requestPlannedRoute(routeRequestInput);

          if (routeCacheKey) {
            plannedRouteCacheRef.current.set(routeCacheKey, route);
          }
        }

        if (plannedRouteCacheRef.current.size > 1000) {
          plannedRouteCacheRef.current.clear();
        }

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
      window.clearTimeout(timeoutId);
    };
  }, [
    activePlanId,
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

      const ingestionErrors = Array.isArray(payload?.meta?.ingestionErrors)
        ? payload.meta.ingestionErrors
        : [];
      if (ingestionErrors.length > 0) {
        console.error('Sync ingestion errors:', ingestionErrors);
      }

      await loadSourcesFromServer();

      const errorSuffix = ingestionErrors.length > 0 ? ` (${ingestionErrors.length} ingestion errors)` : '';
      setStatusMessage(
        `Synced ${syncedEvents.length} events at ${new Date().toLocaleTimeString()}${errorSuffix}.`,
        ingestionErrors.length > 0
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Sync failed', true);
    } finally {
      setIsSyncing(false);
    }
  }, [loadSourcesFromServer, setStatusMessage]);

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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceType: newSourceType,
          url,
          label
        })
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
  }, [loadSourcesFromServer, newSourceLabel, newSourceType, newSourceUrl, setStatusMessage]);

  const handleToggleSourceStatus = useCallback(async (source) => {
    const nextStatus = source?.status === 'active' ? 'paused' : 'active';

    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: nextStatus
        })
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
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, {
        method: 'DELETE'
      });
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

  const [syncingSourceId, setSyncingSourceId] = useState('');

  const handleSyncSource = useCallback(async (source) => {
    setSyncingSourceId(source.id);
    setStatusMessage(`Syncing "${source.label || source.url}"...`);

    try {
      const response = await fetch(`/api/sources/${encodeURIComponent(source.id)}`, {
        method: 'POST'
      });
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

  const showsMap = activeView === 'map' || activeView === 'dayroute' || activeView === 'events' || activeView === 'spots';
  const showsSidebar = activeView === 'dayroute' || activeView === 'events' || activeView === 'spots';

  const shiftCalendarMonth = useCallback((offset) => {
    const shifted = addMonthsToMonthISO(calendarAnchorISO, offset);
    setCalendarMonthISO(shifted);
  }, [calendarAnchorISO]);

  const travelReadyCount = visibleEvents.filter(
    (event) => event.travelDurationText && event.travelDurationText !== 'Unavailable'
  ).length;
  const routeSummaryText =
    routeSummary || (selectedDate && dayPlanItems.length ? 'Waiting for routable stops...' : 'Add stops to draw route');

  const renderDayList = () => (
    <div className="flex flex-col gap-0.5 p-2 overflow-y-auto border-r border-border bg-bg-subtle scrollbar-thin day-list-responsive">
      {uniqueDates.length === 0 ? (
        <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-[10px] border border-dashed border-border">No event dates</p>
      ) : (
        uniqueDates.map((dateISO) => {
          const isActive = dateISO === selectedDate;
          const eventCount = eventsByDate.get(dateISO) || 0;
          const planCount = planItemsByDate.get(dateISO) || 0;

          return (
            <button
              key={dateISO}
              type="button"
              className={`flex flex-col gap-px px-2.5 py-2 border rounded-lg text-left cursor-pointer transition-all duration-200 day-list-item-responsive ${isActive ? 'bg-accent-light border-accent-border shadow-[0_0_0_2px_var(--color-accent-glow)]' : 'bg-transparent border-transparent hover:bg-card hover:border-border'}`}
              onClick={() => { setSelectedDate(dateISO); setShowAllEvents(false); }}
            >
              <span className="text-[0.65rem] font-bold text-muted uppercase tracking-wider">{formatDateWeekday(dateISO)}</span>
              <span className="text-[0.84rem] font-bold text-foreground">{formatDateDayMonth(dateISO)}</span>
              <span className="text-[0.65rem] text-foreground-secondary">{eventCount} ev · {planCount} plan</span>
            </button>
          );
        })
      )}
    </div>
  );

  const renderPlannerItinerary = () => (
    <div className="flex flex-col p-3 overflow-y-auto min-h-0 scrollbar-thin">
      <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight">{selectedDate ? formatDate(selectedDate) : 'No date selected'}</h2>
          <div className="flex gap-1.5 items-center mt-1">
            <Select value={travelMode} onValueChange={setTravelMode}>
              <SelectTrigger id="travel-mode" className="min-h-[30px] min-w-[110px]">
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
        <div className="flex gap-1 shrink-0">
          <Button type="button" size="sm" variant="secondary" onClick={clearDayPlan} disabled={!selectedDate || dayPlanItems.length === 0}>Clear</Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleExportPlannerIcs} disabled={!selectedDate || dayPlanItems.length === 0}>.ics</Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleAddDayPlanToGoogleCalendar} disabled={!selectedDate || dayPlanItems.length === 0}>GCal</Button>
        </div>
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
              ].filter(Boolean).join(' ');

              return (
                <article className={itemClass} key={item.id} style={{ top: `${top}px`, height: `${height}px` }} onPointerDown={(event) => { startPlanDrag(event, item, 'move'); }}>
                  <button type="button" className="absolute left-0 right-0 top-0 h-2 border-none bg-transparent cursor-ns-resize" aria-label="Adjust start time" onPointerDown={(event) => { startPlanDrag(event, item, 'resize-start'); }} />
                  <button type="button" className="absolute top-1 right-1.5 border-none bg-transparent text-slate-600 text-base leading-none cursor-pointer hover:text-slate-900" aria-label="Remove from plan" onClick={(event) => { event.stopPropagation(); removePlanItem(item.id); }}>×</button>
                  <div className="text-[0.72rem] font-bold text-gray-800 tracking-wide">{formatMinuteLabel(item.startMinutes)} - {formatMinuteLabel(item.endMinutes)}</div>
                  <div className="mt-0.5 text-[0.82rem] font-bold text-slate-900 leading-tight break-words">{item.title}</div>
                  {item.locationText ? <div className="mt-0.5 text-[0.72rem] text-slate-700 leading-tight break-words">{item.locationText}</div> : null}
                  <button type="button" className="absolute left-0 right-0 bottom-0 h-2 border-none bg-transparent cursor-ns-resize" aria-label="Adjust end time" onPointerDown={(event) => { startPlanDrag(event, item, 'resize-end'); }} />
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-[10px] border border-dashed border-border">Pick a date from the left to start planning.</p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap p-2 border border-border rounded-[10px] bg-bg-subtle text-foreground-secondary text-[0.8rem]" role="status" aria-live="polite">
        <strong>Route:</strong> {routeSummaryText}
        {isRouteUpdating ? <span className="inline-flex items-center ml-2 text-[0.78rem] font-semibold text-accent before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:mr-1.5 before:animate-[statusPulse_1.1s_ease-in-out_infinite]">Updating...</span> : null}
      </div>
    </div>
  );

  const renderEventsItinerary = () => (
    <div className="flex flex-col p-3 overflow-y-auto min-h-0 scrollbar-thin">
      <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight">Events {selectedDate ? `· ${formatDateDayMonth(selectedDate)}` : ''}</h2>
          <div className="flex gap-1.5 items-center mt-1">
            <ToggleGroup
              className="flex flex-nowrap overflow-x-auto gap-1.5 scrollbar-none"
              type="single"
              value={showAllEvents ? 'all' : 'day'}
              onValueChange={(value) => {
                if (value === 'all') { setShowAllEvents(true); }
                if (value === 'day') { setShowAllEvents(false); }
              }}
            >
              <ToggleGroupItem className="shrink-0 min-w-[84px] justify-center px-5 py-1 text-[0.8rem] font-medium rounded-full" value="day">Day</ToggleGroupItem>
              <ToggleGroupItem className="shrink-0 min-w-[84px] justify-center px-5 py-1 text-[0.8rem] font-medium rounded-full" value="all">All</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="flex gap-1.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-subtle text-muted text-[0.7rem] font-semibold whitespace-nowrap">{visibleEvents.length} showing</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-subtle text-muted text-[0.7rem] font-semibold whitespace-nowrap">{travelReadyCount} travel</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {visibleEvents.length === 0 ? (
          <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-[10px] border border-dashed border-border">No events found for this filter.</p>
        ) : (
          visibleEvents.map((event) => {
            const location = event.address || event.locationText || 'Location not listed';
            const time = event.startDateTimeText || 'Time not listed';
            return (
              <Card className="p-3.5 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)]" key={event.eventUrl}>
                <h3 className="m-0 mb-1.5 text-[0.92rem] font-semibold leading-snug">{event.name}</h3>
                <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Time:</strong> {time}</p>
                <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Location:</strong> {location}</p>
                {event.travelDurationText ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Travel:</strong> {event.travelDurationText}</p> : null}
                <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{event.description || ''}</p>
                <Button type="button" size="sm" variant="secondary" onClick={() => { addEventToDayPlan(event); }}>Add to day</Button>
                <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={event.eventUrl} target="_blank" rel="noreferrer">Open event</a>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );

  const renderSpotsItinerary = () => (
    <div className="flex flex-col p-3 overflow-y-auto min-h-0 scrollbar-thin">
      <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight">Curated Spots</h2>
          <div className="flex gap-1.5 items-center mt-1">
            <ToggleGroup
              className="flex flex-nowrap overflow-x-auto gap-1.5 scrollbar-none"
              type="single"
              value={placeTagFilter}
              onValueChange={(value) => { if (value) { setPlaceTagFilter(value); } }}
            >
              {placeTagOptions.map((tag) => (
                <ToggleGroupItem key={tag} className="shrink-0 px-3 py-1 text-[0.8rem] font-medium rounded-full" value={tag}>{formatTag(tag)}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg-subtle text-muted text-[0.7rem] font-semibold whitespace-nowrap">{visiblePlaces.length} places</span>
      </div>
      <div className="flex flex-col gap-2">
        {visiblePlaces.length === 0 ? (
          <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-[10px] border border-dashed border-border">No curated places in this category.</p>
        ) : (
          visiblePlaces.map((place) => (
            <Card className="p-3.5 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)]" key={place.id || `${place.name}-${place.location}`}>
              <div className="flex gap-2 justify-between items-start">
                <h3 className="m-0 mb-1.5 text-[0.92rem] font-semibold leading-snug">{place.name}</h3>
                <Badge className="uppercase tracking-wider shrink-0" variant="secondary" style={{ backgroundColor: `${getTagColor(place.tag)}22`, color: getTagColor(place.tag) }}>{formatTag(place.tag)}</Badge>
              </div>
              <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Location:</strong> {place.location}</p>
              {place.curatorComment ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed"><strong>Curator note:</strong> {place.curatorComment}</p> : null}
              {place.description ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{truncate(place.description, 180)}</p> : null}
              {place.details ? <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed">{truncate(place.details, 220)}</p> : null}
              <Button type="button" size="sm" variant="secondary" onClick={() => { addPlaceToDayPlan(place); }}>Add to day</Button>
              <p className="my-0.5 text-[0.82rem] text-foreground-secondary leading-relaxed flex flex-wrap gap-3">
                <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={place.mapLink} target="_blank" rel="noreferrer">Open map</a>
                <a className="inline-flex items-center gap-0.5 mt-1.5 text-accent no-underline font-semibold text-[0.82rem] hover:text-accent-hover hover:underline hover:underline-offset-2" href={place.cornerLink} target="_blank" rel="noreferrer">Corner page</a>
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  const renderSourceCard = (source) => {
    const isEvent = source.sourceType === 'event';
    const isActive = source.status === 'active';
    const isSyncingThis = syncingSourceId === source.id;
    const displayTitle = source.label || safeHostname(source.url);

    return (
      <div
        className={`rounded-[10px] border border-border bg-card transition-all duration-150 hover:border-border-hover hover:shadow-[0_1px_4px_rgba(12,18,34,0.05)] ${source.status === 'paused' ? 'opacity-60' : ''}`}
        style={{ borderLeft: `3px solid ${isEvent ? 'rgba(59,108,245,0.5)' : 'rgba(13,148,136,0.5)'}`, padding: '10px 12px' }}
        key={source.id || `${source.sourceType}-${source.url}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="m-0 text-[0.86rem] font-bold text-foreground leading-snug">{displayTitle}</h4>
            <a className="block mt-0.5 text-muted text-[0.72rem] no-underline truncate hover:text-accent hover:underline" href={source.url} target="_blank" rel="noreferrer" title={source.url}>{source.url}</a>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1 text-[0.66rem] font-semibold capitalize px-1.5 py-0.5 rounded-md ${isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`} />
            {source.status}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-muted text-[0.7rem]">
          <span>{source.lastSyncedAt ? `Synced ${new Date(source.lastSyncedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Never synced'}</span>
          {source.lastError ? <span className="text-rose-600">· {source.lastError}</span> : null}
          {source.readonly ? <span className="italic">· Read-only</span> : null}
        </div>
        <div className="flex gap-1.5 mt-2">
          <button type="button" className="px-2 py-0.5 rounded-md border border-accent/30 bg-accent-light text-accent text-[0.7rem] font-semibold cursor-pointer transition-all duration-150 hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed" disabled={isSyncingThis || Boolean(source.readonly)} onClick={() => { void handleSyncSource(source); }}>
            {isSyncingThis ? <><RefreshCw size={10} className="inline animate-spin mr-1" />Syncing...</> : 'Sync'}
          </button>
          <button type="button" className="px-2 py-0.5 rounded-md border border-border bg-card text-foreground-secondary text-[0.7rem] font-semibold cursor-pointer transition-all duration-150 hover:bg-bg-subtle hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed" disabled={Boolean(source.readonly)} onClick={() => { void handleToggleSourceStatus(source); }}>
            {isActive ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="px-2 py-0.5 rounded-md border border-rose-200 bg-rose-50 text-rose-600 text-[0.7rem] font-semibold cursor-pointer transition-all duration-150 hover:bg-rose-100 hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed" disabled={Boolean(source.readonly)} onClick={() => { void handleDeleteSource(source); }}>
            Remove
          </button>
        </div>
      </div>
    );
  };

  const renderSourcesManager = () => (
    <section className="flex-1 min-h-0 overflow-y-auto p-8 max-sm:p-4 bg-bg">
      <div className="w-full max-w-[860px] mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Sources</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Manage your event and spot feeds.</p>
          </div>
        </div>

        {/* Add source form */}
        <form className="flex items-center gap-2 p-2.5 px-3 bg-card border border-border rounded-xl max-sm:flex-col" onSubmit={handleCreateSource}>
          <Select value={newSourceType} onValueChange={setNewSourceType}>
            <SelectTrigger className="min-h-[36px] min-w-[100px] rounded-lg">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
            </SelectContent>
          </Select>
          <input className="sources-input" placeholder="https://example.com/source" value={newSourceUrl} onChange={(event) => setNewSourceUrl(event.target.value)} />
          <input className="sources-input max-w-[160px] max-sm:max-w-none" placeholder="Label (optional)" value={newSourceLabel} onChange={(event) => setNewSourceLabel(event.target.value)} />
          <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[100px] shrink-0 max-sm:w-full" disabled={isSavingSource}>
            {isSavingSource ? 'Adding...' : 'Add Source'}
          </Button>
        </form>

        {/* Two-column grid: events | spots */}
        <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
          {[
            { key: 'event', title: 'Events', dotColor: 'bg-accent' },
            { key: 'spot', title: 'Spots', dotColor: 'bg-teal-600' }
          ].map((group) => (
            <section className="flex flex-col" key={group.key}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="m-0 text-[0.78rem] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <span className={`inline-block w-[7px] h-[7px] rounded-full ${group.dotColor}`} />
                  {group.title}
                </h3>
                <Badge variant="secondary" className="text-[0.68rem] tabular-nums">{groupedSources[group.key].length}</Badge>
              </div>

              {groupedSources[group.key].length === 0 ? (
                <p className="border border-dashed border-border rounded-[10px] p-5 text-center text-muted text-[0.82rem] bg-bg-subtle">No {group.key} sources yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {groupedSources[group.key].map((source) => renderSourceCard(source))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </section>
  );

  return (
    <main className="min-h-dvh h-dvh flex flex-col w-full overflow-hidden">
      <header className="flex items-center gap-3 px-5 h-[52px] min-h-[52px] border-b border-border bg-card shadow-[0_1px_2px_rgba(12,18,34,0.04)] relative z-30 topbar-responsive">
        <h1 className="m-0 text-lg font-extrabold tracking-tight shrink-0 bg-gradient-to-br from-foreground from-40% to-accent bg-clip-text text-transparent">SF Trip Planner</h1>
        <nav className="flex items-center gap-0.5 mx-auto overflow-x-auto scrollbar-none topbar-nav-responsive" aria-label="App navigator">
          {[
            { id: 'map', icon: MapPin, label: 'Map' },
            { id: 'calendar', icon: Calendar, label: 'Calendar' },
            { id: 'dayroute', icon: Navigation, label: 'Day Route' },
            { id: 'events', icon: PartyPopper, label: 'Events' },
            { id: 'spots', icon: Coffee, label: 'Spots' },
            { id: 'sources', icon: RefreshCw, label: 'Sources' }
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              className={`inline-flex items-center gap-1 px-3.5 py-1.5 border-none rounded-full text-[0.82rem] font-medium cursor-pointer transition-all duration-200 whitespace-nowrap shrink-0 topbar-nav-item-responsive ${activeView === id ? 'bg-accent-light text-accent font-semibold' : 'bg-transparent text-muted hover:bg-bg-subtle hover:text-foreground'}`}
              onClick={() => { setActiveView(id); }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex gap-1.5 shrink-0 topbar-actions-responsive">
          <Button id="sync-button" type="button" size="sm" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing…' : 'Sync'}
          </Button>
          <Button variant="secondary" id="use-device-location" type="button" size="sm" onClick={handleDeviceLocation}>
            <Navigation size={14} />
            My Location
          </Button>
        </div>
      </header>

      {activeView === 'calendar' && (
        <section className="flex-1 min-h-0 overflow-y-auto flex justify-center p-8 max-sm:p-3.5 bg-bg">
          <div className="w-full max-w-[960px]">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 mb-4">
              <Button type="button" size="sm" variant="secondary" onClick={() => { shiftCalendarMonth(-1); }}>Prev</Button>
              <h2 className="text-center m-0 text-xl font-bold">{formatMonthYear(calendarAnchorISO)}</h2>
              <Button type="button" size="sm" variant="secondary" onClick={() => { shiftCalendarMonth(1); }}>Next</Button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-muted text-[0.72rem] font-bold uppercase tracking-wider">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => (
                <span key={weekday} className="text-center">{weekday}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((dayISO) => {
                const isCurrentMonth = toMonthISO(dayISO) === toMonthISO(calendarAnchorISO);
                const isSelected = dayISO === selectedDate;
                const eventCount = eventsByDate.get(dayISO) || 0;
                const planCount = planItemsByDate.get(dayISO) || 0;

                return (
                  <button
                    key={dayISO}
                    type="button"
                    className={`border border-border bg-card rounded-[10px] min-h-[90px] max-sm:min-h-[70px] p-2.5 text-left flex flex-col gap-px cursor-pointer transition-all duration-200 hover:border-accent-border hover:shadow-[0_0_0_3px_var(--color-accent-glow)] ${!isCurrentMonth ? 'opacity-50' : ''} ${isSelected ? 'cal-day-selected' : ''}`}
                    onClick={() => { setSelectedDate(dayISO); setShowAllEvents(false); setActiveView('dayroute'); }}
                  >
                    <span className="text-[0.84rem] font-bold text-foreground">{formatDayOfMonth(dayISO)}</span>
                    <span className="text-[0.68rem] text-foreground-secondary leading-tight">{eventCount} events</span>
                    <span className="text-[0.68rem] text-teal-700 leading-tight">{planCount} planned</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-center text-muted text-[0.82rem]">Click a date to jump to its day route.</p>
          </div>
        </section>
      )}

      {activeView === 'sources' && renderSourcesManager()}

      {showsMap && (
        <section className={`min-h-0 grid gap-0 flex-1 items-stretch layout-sidebar ${showsSidebar ? 'grid-cols-[minmax(0,1fr)_480px]' : 'grid-cols-1'}`}>
          <section className="flex flex-col min-h-0 h-full" ref={mapPanelRef}>
            <div className="flex flex-wrap gap-x-3 gap-y-1 bg-card border-b border-border px-4 py-1.5">
              <span className="inline-flex items-center gap-1 text-[0.76rem] font-medium text-muted"><Calendar className="w-[18px] h-[18px]" size={14} strokeWidth={2} /> Event</span>
              <span className="inline-flex items-center gap-1 text-[0.76rem] font-medium text-muted"><House className="w-[18px] h-[18px]" size={14} strokeWidth={2} /> Origin</span>
              {Object.keys(TAG_COLORS).map((tag) => {
                const TagIcon = getTagIconComponent(tag);
                return <span className="inline-flex items-center gap-1 text-[0.76rem] font-medium text-muted" key={tag}><TagIcon className="w-[18px] h-[18px]" size={14} strokeWidth={2} /> {formatTag(tag)}</span>;
              })}
            </div>
            <div className="relative flex-1 min-h-0 map-container-responsive">
              <div id="map" ref={mapElementRef} />
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-3 py-1.5 bg-card-glass backdrop-blur-sm rounded-[10px] border border-border shadow-sm text-[0.78rem] text-foreground-secondary max-w-[calc(100%-24px)] z-10" role="status">
                <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${statusError ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)] animate-[statusPulse_2.5s_ease-in-out_infinite]'}`} />
                <span style={{ color: statusError ? '#e11d48' : undefined }}>{status}</span>
              </div>
            </div>
          </section>

          {showsSidebar && (
            <aside className="border-l border-border bg-card h-full min-h-0 overflow-hidden sidebar-responsive" ref={sidebarRef}>
              <div className="grid grid-cols-[180px_minmax(0,1fr)] h-full min-h-0 sidebar-grid-responsive">
                {renderDayList()}
                {activeView === 'dayroute' && renderPlannerItinerary()}
                {activeView === 'events' && renderEventsItinerary()}
                {activeView === 'spots' && renderSpotsItinerary()}
              </div>
            </aside>
          )}
        </section>
      )}
    </main>
  );
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
      <path d="M19 1C9.6 1 2 8.6 2 18c0 11.7 14.1 26.9 16.2 29.1a1.2 1.2 0 0 0 1.6 0C21.9 44.9 36 29.7 36 18 36 8.6 28.4 1 19 1z" fill="${color}" stroke="#ffffff" stroke-width="2" />
      <circle cx="19" cy="18" r="10" fill="rgba(255,255,255,0.16)" />
      <g transform="translate(7 6)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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
    const normalizedDateISO = normalizeDateKey(dateISO);
    if (!Array.isArray(items) || !normalizedDateISO) {
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

    const previousItems = Array.isArray(result[normalizedDateISO]) ? result[normalizedDateISO] : [];
    result[normalizedDateISO] = sortPlanItems([...previousItems, ...cleanedItems]);
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
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) {
    return isoDate;
  }

  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
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
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) {
    return isoDate;
  }

  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return parsedDate.toLocaleDateString(undefined, {
    weekday: 'short'
  });
}

function formatDateDayMonth(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) {
    return isoDate;
  }

  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function formatMonthYear(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) {
    return isoDate;
  }

  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return isoDate;
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
}

function formatDayOfMonth(isoDate) {
  const normalizedDateISO = normalizeDateKey(isoDate);
  if (!normalizedDateISO) {
    return isoDate;
  }

  const parsedDate = new Date(`${normalizedDateISO}T00:00:00`);
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
  return normalizeDateKey(value) || toISODate(new Date());
}

function normalizeDateKey(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, '0'),
    String(parsedDate.getDate()).padStart(2, '0')
  ].join('-');
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

function createRouteRequestCacheKey({ origin, destination, waypoints, travelMode }) {
  const originPoint = toLatLngLiteral(origin);
  const destinationPoint = toLatLngLiteral(destination);
  const waypointPoints = Array.isArray(waypoints)
    ? waypoints.map(toLatLngLiteral).filter(Boolean)
    : [];

  if (!originPoint || !destinationPoint) {
    return '';
  }

  const normalizePoint = (point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;

  return [
    String(travelMode || ''),
    normalizePoint(originPoint),
    normalizePoint(destinationPoint),
    waypointPoints.map(normalizePoint).join('|')
  ].join(';');
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

function toCoordinateKey(position) {
  const point = toLatLngLiteral(position);
  if (!point) {
    return '';
  }

  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

function createTravelTimeCacheKey({ travelMode, baseKey, destinationKey }) {
  return `${String(travelMode || '')};${baseKey};${destinationKey}`;
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
