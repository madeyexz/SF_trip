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
const MAX_ROUTE_STOPS = 8;

export default function EventMapClient() {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const distanceMatrixRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const infoWindowRef = useRef(null);
  const baseMarkerRef = useRef(null);
  const baseLatLngRef = useRef(null);
  const markersRef = useRef([]);
  const positionCacheRef = useRef(new Map());

  const [status, setStatus] = useState('Loading trip map...');
  const [statusError, setStatusError] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [allPlaces, setAllPlaces] = useState([]);
  const [visibleEvents, setVisibleEvents] = useState([]);
  const [visiblePlaces, setVisiblePlaces] = useState([]);
  const [dates, setDates] = useState(['']);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [travelMode, setTravelMode] = useState('WALKING');
  const [baseLocationText, setBaseLocationText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [placeTagFilter, setPlaceTagFilter] = useState('all');
  const [activeMobilePanel, setActiveMobilePanel] = useState('planner');
  const [plannerByDate, setPlannerByDate] = useState({});
  const [activePlanId, setActivePlanId] = useState('');
  const [routeSummary, setRouteSummary] = useState('');

  const selectedDate = useMemo(() => dates[selectedIndex] || '', [dates, selectedIndex]);

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
    try {
      const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      setPlannerByDate(sanitizePlannerByDate(parsed));
    } catch {
      // Ignore broken local planner cache.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plannerByDate));
    } catch {
      // Ignore local storage failures.
    }
  }, [plannerByDate]);

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
    if (directionsRendererRef.current) {
      directionsRendererRef.current.set('directions', null);
    }
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
    async (cacheKey, mapLink, fallbackLocation) => {
      const cached = positionCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const fromMapUrl = parseLatLngFromMapUrl(mapLink);
      if (fromMapUrl) {
        positionCacheRef.current.set(cacheKey, fromMapUrl);
        return fromMapUrl;
      }

      const geocoded = await geocode(fallbackLocation);
      if (geocoded) {
        positionCacheRef.current.set(cacheKey, geocoded);
      }

      return geocoded;
    },
    [geocode, parseLatLngFromMapUrl]
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

  const buildEventInfoWindowHtml = useCallback((event) => {
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
        <a href="${escapeHtml(event.eventUrl)}" target="_blank" rel="noreferrer">Open event</a>
      </div>
    `;
  }, []);

  const buildPlaceInfoWindowHtml = useCallback((place) => {
    const displayTag = formatTag(normalizePlaceTag(place.tag));

    return `
      <div style="max-width:340px">
        <h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(place.name)}</h3>
        <p style="margin:4px 0"><strong>Tag:</strong> ${escapeHtml(displayTag)}</p>
        <p style="margin:4px 0"><strong>Location:</strong> ${escapeHtml(place.location || 'Unknown')}</p>
        ${place.curatorComment ? `<p style="margin:4px 0"><strong>Curator:</strong> ${escapeHtml(place.curatorComment)}</p>` : ''}
        ${place.description ? `<p style="margin:4px 0">${escapeHtml(place.description)}</p>` : ''}
        ${place.details ? `<p style="margin:4px 0">${escapeHtml(place.details)}</p>` : ''}
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
        const position = await resolvePosition(
          `event:${event.eventUrl}`,
          event.googleMapsUrl,
          event.address || event.locationText
        );

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

            infoWindowRef.current.setContent(buildEventInfoWindowHtml(eventWithPosition));
            infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
          });

          markersRef.current.push(marker);
        }

        eventsWithPositions.push(eventWithPosition);
      }

      const placesWithPositions = [];

      for (const place of placesInput) {
        const position = await resolvePosition(
          `place:${place.id || place.name}`,
          place.mapLink,
          place.location
        );

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

            infoWindowRef.current.setContent(buildPlaceInfoWindowHtml(placeWithPosition));
            infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
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

        const uniqueDates = Array.from(
          new Set(loadedEvents.map((event) => event.startDateISO).filter(Boolean))
        ).sort();

        setDates(['', ...uniqueDates]);
        setSelectedIndex(0);

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
        directionsServiceRef.current = new window.google.maps.DirectionsService();
        directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
          suppressMarkers: true,
          preserveViewport: false,
          polylineOptions: {
            strokeColor: '#1d4ed8',
            strokeOpacity: 0.86,
            strokeWeight: 5
          }
        });
        directionsRendererRef.current.setMap(mapRef.current);
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

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
    };
  }, [clearMapMarkers, clearRoute, geocode, setBaseMarker, setStatusMessage]);

  useEffect(() => {
    if (!mapsReady) {
      return;
    }

    void renderCurrentSelection(allEvents, filteredPlaces, selectedDate, travelMode);
  }, [allEvents, filteredPlaces, mapsReady, renderCurrentSelection, selectedDate, travelMode]);

  useEffect(() => {
    if (!mapsReady || !window.google?.maps) {
      return;
    }

    let cancelled = false;

    async function drawPlannedRoute() {
      if (!directionsRendererRef.current || !directionsServiceRef.current) {
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
        const waypoints = routeStops.map((stop) => ({
          location: stop.position,
          stopover: true
        }));

        const travelModeValue =
          window.google.maps.TravelMode[travelMode] || window.google.maps.TravelMode.WALKING;

        const directions = await requestGoogleDirections(directionsServiceRef.current, {
          origin: baseLatLngRef.current,
          destination: baseLatLngRef.current,
          waypoints,
          optimizeWaypoints: false,
          travelMode: travelModeValue
        });

        if (cancelled) {
          return;
        }

        directionsRendererRef.current.setDirections(directions);

        const route = directions.routes?.[0];
        const legs = Array.isArray(route?.legs) ? route.legs : [];

        const totalSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
        const totalMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);

        const routeSuffix =
          plannedRouteStops.length > MAX_ROUTE_STOPS ? ` (showing first ${MAX_ROUTE_STOPS})` : '';

        setRouteSummary(
          `${routeStops.length} stops${routeSuffix} · ${formatDistance(totalMeters)} · ${formatDurationFromSeconds(totalSeconds)}`
        );
      } catch {
        if (cancelled) {
          return;
        }

        clearRoute();
        setRouteSummary('Could not draw route for the current plan and travel mode.');
      }
    }

    void drawPlannedRoute();

    return () => {
      cancelled = true;
    };
  }, [clearRoute, dayPlanItems.length, mapsReady, plannedRouteStops, selectedDate, travelMode]);

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

      const uniqueDates = Array.from(
        new Set(syncedEvents.map((event) => event.startDateISO).filter(Boolean))
      ).sort();

      setDates(['', ...uniqueDates]);
      setSelectedIndex(0);
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
        await renderCurrentSelection(allEvents, filteredPlaces, selectedDate, travelMode);
        setStatusMessage('Using your live device location as trip origin.');
      },
      (error) => {
        setStatusMessage(error.message || 'Could not get device location.', true);
      }
    );
  }, [allEvents, filteredPlaces, renderCurrentSelection, selectedDate, setBaseMarker, setStatusMessage, travelMode]);

  const dateLabel = selectedDate ? formatDate(selectedDate) : 'All dates';
  const travelReadyCount = visibleEvents.filter(
    (event) => event.travelDurationText && event.travelDurationText !== 'Unavailable'
  ).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>SF Trip Planner</h1>
          <p className="subtitle">See what is happening, what is nearby, and how long it takes from your stay.</p>
        </div>
        <div className="topbar-actions">
          <Button id="sync-button" type="button" onClick={handleSync} disabled={isSyncing}>
            <RefreshCw size={15} className={isSyncing ? 'spin-icon' : ''} />
            {isSyncing ? 'Syncing…' : 'Sync Events'}
          </Button>
          <Button variant="secondary" id="use-device-location" type="button" onClick={handleDeviceLocation}>
            <Navigation size={15} />
            Use My Location
          </Button>
        </div>
      </header>

      <section className="snapshot-grid">
        <Card className="snapshot-card">
          <p className="snapshot-label">Day</p>
          <p className="snapshot-value">{dateLabel}</p>
        </Card>
        <Card className="snapshot-card">
          <p className="snapshot-label">Events</p>
          <p className="snapshot-value">{visibleEvents.length}</p>
        </Card>
        <Card className="snapshot-card">
          <p className="snapshot-label">Curated Places</p>
          <p className="snapshot-value">{visiblePlaces.length}</p>
        </Card>
        <Card className="snapshot-card">
          <p className="snapshot-label">Closest Event</p>
          <p className="snapshot-value">{nearestEvent ? nearestEvent.travelDurationText : 'n/a'}</p>
          {nearestEvent ? <p className="snapshot-subtle">{nearestEvent.name}</p> : null}
        </Card>
      </section>

      <section className="controls">
        <div className="control-group">
          <label htmlFor="travel-mode">Travel mode</label>
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

        <div className="control-group slider-group">
          <label htmlFor="date-slider">Events by date</label>
          <input
            id="date-slider"
            type="range"
            min="0"
            max={Math.max(0, dates.length - 1)}
            step="1"
            value={selectedIndex}
            disabled={dates.length <= 1}
            onChange={(event) => {
              setSelectedIndex(Number(event.target.value));
            }}
          />
          <div id="date-label">{dateLabel}</div>
        </div>

        <div className="control-group tag-filter-group">
          <label>Place category</label>
          <ToggleGroup
            className="tag-filter-list"
            type="single"
            value={placeTagFilter}
            onValueChange={(value) => {
              if (value) {
                setPlaceTagFilter(value);
              }
            }}
          >
            {placeTagOptions.map((tag) => (
              <ToggleGroupItem
                key={tag}
                className="tag-chip"
                value={tag}
              >
                {formatTag(tag)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="status">
          <span className={`status-dot${statusError ? ' status-dot-error' : ''}`} />
          <span style={{ color: statusError ? '#e11d48' : undefined }}>{status}</span>
          <span className="status-meta">Travel times ready for {travelReadyCount}/{visibleEvents.length} events.</span>
        </div>
      </section>

      <section className="layout">
        <section className="map-panel">
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
          <div id="map" ref={mapElementRef} />
        </section>

        <aside className="sidebar">
          <Tabs className="sidebar-switch" value={activeMobilePanel} onValueChange={setActiveMobilePanel}>
            <TabsList>
              <TabsTrigger value="planner">Planner</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="places">Places</TabsTrigger>
            </TabsList>
          </Tabs>

          <section className={`panel ${activeMobilePanel !== 'planner' ? 'panel-mobile-hidden' : ''}`}>
            <div className="planner-panel-header">
              <div>
                <h2>Day Route Builder</h2>
                <p className="event-meta panel-subtitle">
                  {selectedDate
                    ? `Planning for ${formatDate(selectedDate)}`
                    : 'Pick a specific date from the slider to start planning.'}
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
                        onPointerDown={(event) => {
                          startPlanDrag(event, item, 'move');
                        }}
                      >
                        <button
                          type="button"
                          className="planner-resize planner-resize-top"
                          aria-label="Adjust start time"
                          onPointerDown={(event) => {
                            startPlanDrag(event, item, 'resize-start');
                          }}
                        />
                        <button
                          type="button"
                          className="planner-remove"
                          aria-label="Remove from plan"
                          onClick={(event) => {
                            event.stopPropagation();
                            removePlanItem(item.id);
                          }}
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
                          onPointerDown={(event) => {
                            startPlanDrag(event, item, 'resize-end');
                          }}
                        />
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="empty-state">Move the date slider off “All dates” to plan a specific day.</p>
            )}

            <p className="event-meta planner-route-summary">
              <strong>Route:</strong>{' '}
              {routeSummary || (selectedDate && dayPlanItems.length ? 'Waiting for routable stops...' : 'Add stops to draw route')}
            </p>
          </section>

          <section className={`panel ${activeMobilePanel !== 'events' ? 'panel-mobile-hidden' : ''}`}>
            <h2>Event Plan</h2>
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
                        onClick={() => {
                          addEventToDayPlan(event);
                        }}
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

          <section className={`panel ${activeMobilePanel !== 'places' ? 'panel-mobile-hidden' : ''}`}>
            <h2>Curated Spots</h2>
            <p className="event-meta panel-subtitle">One-time traveler list with curator notes.</p>
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
                      onClick={() => {
                        addPlaceToDayPlan(place);
                      }}
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

async function requestGoogleDirections(directionsService, request) {
  return new Promise((resolve, reject) => {
    directionsService.route(request, (response, statusValue) => {
      if (statusValue === 'OK') {
        resolve(response);
      } else {
        reject(new Error(`Directions request failed: ${statusValue}`));
      }
    });
  });
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
