'use client';

import { useEffect, useRef } from 'react';

export const MAP_SEARCH_PREFERENCES_STORAGE_KEY = 'mapSearchPreferences';

export function readMapSearchPreferences(rawValue: string | null) {
  try {
    const stored = JSON.parse(rawValue || 'null');
    if (!stored || typeof stored !== 'object') {
      return null;
    }

    return {
      query: typeof stored.query === 'string' ? stored.query : '',
      scope: typeof stored.scope === 'string' ? stored.scope : '',
      sort: typeof stored.sort === 'string' ? stored.sort : ''
    };
  } catch {
    return null;
  }
}

export function serializeMapSearchPreferences({
  query,
  scope,
  sort
}: {
  query: string;
  scope: string;
  sort: string;
}) {
  return JSON.stringify({ query, scope, sort });
}

export function useMapSearchPreferencesPersistence({
  mapSearchQuery,
  setMapSearchQuery,
  mapSearchScope,
  setMapSearchScope,
  mapSearchSort,
  setMapSearchSort
}: {
  mapSearchQuery: string;
  setMapSearchQuery: (value: string) => void;
  mapSearchScope: string;
  setMapSearchScope: (value: string) => void;
  mapSearchSort: string;
  setMapSearchSort: (value: string) => void;
}) {
  const hydratedRef = useRef(false);

  useEffect(() => {
    const stored = readMapSearchPreferences(
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(MAP_SEARCH_PREFERENCES_STORAGE_KEY)
    );

    if (stored) {
      if (stored.query) setMapSearchQuery(stored.query);
      if (stored.scope) setMapSearchScope(stored.scope);
      if (stored.sort) setMapSearchSort(stored.sort);
    }

    hydratedRef.current = true;
  }, [setMapSearchQuery, setMapSearchScope, setMapSearchSort]);

  useEffect(() => {
    if (!hydratedRef.current || typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(
        MAP_SEARCH_PREFERENCES_STORAGE_KEY,
        serializeMapSearchPreferences({
          query: mapSearchQuery,
          scope: mapSearchScope,
          sort: mapSearchSort
        })
      );
    } catch {
      // Ignore storage failures.
    }
  }, [mapSearchQuery, mapSearchScope, mapSearchSort]);
}
