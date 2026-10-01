'use client';

import { useCallback, useEffect, useRef } from 'react';
import { fetchJson } from '@/lib/helpers';
import { loadTripBootstrapPayload } from '@/lib/trip-bootstrap';
import { buildSyncStatus } from '@/lib/sync-status';

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

async function loadBootstrapPayload(signal: AbortSignal) {
  return normalizeBootstrapPayload(await loadTripBootstrapPayload(fetchJson, signal));
}

export function useTripBootstrap({
  authLoading,
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
  authLoading: boolean;
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
  const authGenerationRef = useRef(0);
  const sourceRequestRef = useRef<AbortController | null>(null);
  const loadSourcesFromServer = useCallback(async () => {
    const generation = authGenerationRef.current;
    sourceRequestRef.current?.abort();
    const controller = new AbortController();
    sourceRequestRef.current = controller;
    try {
      const payload = await fetchJson('/api/sources', { signal: controller.signal });
      if (controller.signal.aborted || generation !== authGenerationRef.current) return;
      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
    } catch (error) {
      if (controller.signal.aborted || generation !== authGenerationRef.current) return;
      setStatusMessage(
        error instanceof Error ? `Sources could not be refreshed: ${error.message}` : 'Sources could not be refreshed. Please retry.',
        true
      );
    } finally {
      if (sourceRequestRef.current === controller) sourceRequestRef.current = null;
    }
  }, [setSources, setStatusMessage]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let mounted = true;
    const controller = new AbortController();
    authGenerationRef.current += 1;
    sourceRequestRef.current?.abort();
    setProfile(null);
    setAuthUserId('');
    setAllEvents([]);
    setAllPlaces([]);
    setSources([]);
    setTripStart('');
    setTripEnd('');
    setBaseLocationText('');
    if (!isAuthenticated) {
      setIsInitializing(false);
      setIsSyncing(false);
      return () => {
        mounted = false;
        controller.abort();
        authGenerationRef.current += 1;
        sourceRequestRef.current?.abort();
      };
    }

    async function runBackgroundSync() {
      setIsSyncing(true);
      try {
        const response = await fetch('/api/sync', { method: 'POST', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Sync failed');
        if (!mounted) return;

        const syncedEvents = Array.isArray(payload?.events) ? payload.events : [];
        setAllEvents(syncedEvents);
        if (Array.isArray(payload?.places)) setAllPlaces(payload.places);

        const ingestionErrors = Array.isArray(payload?.meta?.ingestionErrors) ? payload.meta.ingestionErrors : [];
        await loadSourcesFromServer();
        if (!mounted) return;
        const result = buildSyncStatus({
          count: syncedEvents.length,
          noun: 'events',
          timeLabel: new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' }),
          errors: ingestionErrors
        });
        setStatusMessage(result.message, result.isError);
      } catch (error) {
        if (mounted) {
          setStatusMessage(
            error instanceof Error ? `Background sync failed: ${error.message}` : 'Background sync failed. Please retry.',
            true
          );
        }
      } finally {
        if (mounted) setIsSyncing(false);
      }
    }

    async function bootstrapData() {
      setIsInitializing(true);
      try {
        const normalized = await loadBootstrapPayload(controller.signal);
        if (!mounted) return;
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
        return true;
      } catch (error) {
        if (mounted) {
          setStatusMessage(
            error instanceof Error ? `${error.message} Reload to retry loading your account.` : 'Account loading failed. Reload to retry.',
            true
          );
        }
        return false;
      } finally {
        if (mounted) setIsInitializing(false);
      }
    }

    void bootstrapData().then(loaded => {
      if (loaded && mounted) void runBackgroundSync();
    });

    return () => {
      mounted = false;
      controller.abort();
      authGenerationRef.current += 1;
      sourceRequestRef.current?.abort();
    };
  }, [
    authLoading,
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

  return {
    loadSourcesFromServer
  };
}
