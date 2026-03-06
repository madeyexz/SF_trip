'use client';

import { useCallback, useEffect } from 'react';
import { fetchJson } from '@/lib/helpers';

export function normalizeBootstrapPayload({
  config,
  eventsPayload,
  sourcesPayload,
  mePayload
}: {
  config: any;
  eventsPayload: any;
  sourcesPayload: any;
  mePayload: any;
}) {
  const profile = mePayload?.profile || null;

  return {
    profile,
    authUserId: String(profile?.userId || ''),
    mapsBrowserKey: String(config?.mapsBrowserKey || ''),
    mapsMapId: String(config?.mapsMapId || ''),
    tripStart: String(config?.tripStart || ''),
    tripEnd: String(config?.tripEnd || ''),
    baseLocationText: String(config?.baseLocation || ''),
    showSharedPlaceRecommendations: config?.showSharedPlaceRecommendations ?? true,
    allEvents: Array.isArray(eventsPayload?.events) ? eventsPayload.events : [],
    allPlaces: Array.isArray(eventsPayload?.places) ? eventsPayload.places : [],
    sources: Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : []
  };
}

export function useTripBootstrap({
  isAuthenticated,
  setAuthUserId,
  setProfile,
  setMapsBrowserKey,
  setMapsMapId,
  setTripStart,
  setTripEnd,
  setBaseLocationText,
  setShowSharedPlaceRecommendations,
  setAllEvents,
  setAllPlaces,
  setSources,
  setIsInitializing,
  setIsSyncing,
  setStatusMessage
}: {
  isAuthenticated: boolean;
  setAuthUserId: (value: string) => void;
  setProfile: (value: any) => void;
  setMapsBrowserKey: (value: string) => void;
  setMapsMapId: (value: string) => void;
  setTripStart: (value: string) => void;
  setTripEnd: (value: string) => void;
  setBaseLocationText: (value: string) => void;
  setShowSharedPlaceRecommendations: (value: boolean) => void;
  setAllEvents: (value: any[]) => void;
  setAllPlaces: (value: any[]) => void;
  setSources: (value: any[]) => void;
  setIsInitializing: (value: boolean) => void;
  setIsSyncing: (value: boolean) => void;
  setStatusMessage: (message: string, isError?: boolean) => void;
}) {
  const loadSourcesFromServer = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/sources');
      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
    } catch (error) {
      console.error('Failed to load sources.', error);
      setSources([]);
    }
  }, [setSources]);

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
        setStatusMessage(
          `Synced ${syncedEvents.length} events at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })}${errSuffix}.`,
          ingestionErrors.length > 0
        );
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

        const normalized = normalizeBootstrapPayload({
          config,
          eventsPayload,
          sourcesPayload,
          mePayload
        });
        setProfile(normalized.profile);
        setAuthUserId(normalized.authUserId);
        setMapsBrowserKey(normalized.mapsBrowserKey);
        setMapsMapId(normalized.mapsMapId);
        setTripStart(normalized.tripStart);
        setTripEnd(normalized.tripEnd);
        setBaseLocationText(normalized.baseLocationText);
        setShowSharedPlaceRecommendations(normalized.showSharedPlaceRecommendations);
        setAllEvents(normalized.allEvents);
        setAllPlaces(normalized.allPlaces);
        setSources(normalized.sources);
      } catch (error) {
        console.error('Bootstrap failed', error);
        if (mounted) setStatusMessage(error instanceof Error ? error.message : 'Bootstrap failed', true);
      } finally {
        if (mounted) setIsInitializing(false);
      }
    }

    void bootstrapData();
    if (isAuthenticated) {
      void runBackgroundSync();
    }

    return () => {
      mounted = false;
    };
  }, [
    isAuthenticated,
    loadSourcesFromServer,
    setAllEvents,
    setAllPlaces,
    setAuthUserId,
    setBaseLocationText,
    setIsInitializing,
    setIsSyncing,
    setMapsBrowserKey,
    setMapsMapId,
    setProfile,
    setShowSharedPlaceRecommendations,
    setSources,
    setStatusMessage,
    setTripEnd,
    setTripStart
  ]);

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

        setAllEvents(Array.isArray(eventsPayload?.events) ? eventsPayload.events : []);
        setAllPlaces(Array.isArray(eventsPayload?.places) ? eventsPayload.places : []);
        setSources(Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : []);
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
  }, [isAuthenticated, setAllEvents, setAllPlaces, setSources]);

  return {
    loadSourcesFromServer
  };
}
