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

export default function EventMapClient() {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const distanceMatrixRef = useRef(null);
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
  const [travelMode, setTravelMode] = useState('DRIVING');
  const [baseLocationText, setBaseLocationText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [placeTagFilter, setPlaceTagFilter] = useState('all');
  const [activeMobilePanel, setActiveMobilePanel] = useState('events');

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

      if (baseMarkerRef.current) {
        baseMarkerRef.current.setMap(null);
      }
    };
  }, [clearMapMarkers, geocode, setBaseMarker, setStatusMessage]);

  useEffect(() => {
    if (!mapsReady) {
      return;
    }

    void renderCurrentSelection(allEvents, filteredPlaces, selectedDate, travelMode);
  }, [allEvents, filteredPlaces, mapsReady, renderCurrentSelection, selectedDate, travelMode]);

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

        <div className="status" style={{ color: statusError ? '#b00020' : '#1d1d1d' }}>
          {status}
          <span className="status-meta"> Travel times ready for {travelReadyCount}/{visibleEvents.length} events.</span>
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
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="places">Places</TabsTrigger>
            </TabsList>
          </Tabs>

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
