import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('trip provider map runtime guardrails', () => {
  it('does not tear down the Google Map inside the initialization effect cleanup', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    const initEffectStart = source.indexOf("  useEffect(() => {\n    if (!mapRuntimeActive || mapsReady || mapRef.current || !mapElementRef.current || isInitializing) {");
    const nextEffectStart = source.indexOf("  useEffect(() => {\n    if (!mapsReady || !window.google?.maps || !mapRef.current) return;");
    assert.notEqual(initEffectStart, -1);
    assert.notEqual(nextEffectStart, -1);
    const initEffectSource = source.slice(initEffectStart, nextEffectStart);

    assert.match(initEffectSource, /return \(\) => \{\s*cancelled = true;\s*\};/);
    assert.equal(initEffectSource.includes('cleanupMapRuntime();'), false);
  });

  it('keeps cleanupMapRuntime in dedicated disable or unmount effects instead', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.match(source, /if \(mapRuntimeActive\) return;\s*cleanupMapRuntime\(\);/);
    assert.match(source, /useEffect\(\(\) => \{\s*return \(\) => \{\s*cleanupMapRuntime\(\);\s*\};\s*\}, \[cleanupMapRuntime\]\);/);
  });

  it('registers a map background click listener and centralizes popup teardown through a shared helper', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.match(source, /const mapClickListenerRef = useRef<any>\(null\);/);
    assert.match(source, /const closeActiveInfoWindow = useCallback\(\(\) => \{/);
    assert.match(source, /if \(infoWindowRef\.current\?\.close\) \{\s*infoWindowRef\.current\.close\(\);\s*\}/);
    assert.match(source, /activePlaceInfoWindowKeyRef\.current = '';/);
    assert.match(source, /mapClickListenerRef\.current = mapRef\.current\.addListener\('click', closeActiveInfoWindow\);/);
    assert.match(source, /if \(mapClickListenerRef\.current\?\.remove\) \{\s*mapClickListenerRef\.current\.remove\(\);\s*mapClickListenerRef\.current = null;\s*\}/);
    assert.match(source, /clearSearchResultMarkers = useCallback\(\(\) => \{[\s\S]*closeActiveInfoWindow\(\);[\s\S]*\}, \[closeActiveInfoWindow\]\);/);
    assert.equal((source.match(/infoWindowRef\.current\.close\(\);/g) || []).length, 1);
  });

  it('manages search result markers and saved custom-spot actions separately from the base marker', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');
    const searchPreferencesPath = path.join(
      process.cwd(),
      'components',
      'providers',
      'trip',
      'map-search-preferences.ts'
    );
    const searchPreferencesSource = await readFile(searchPreferencesPath, 'utf-8');

    assert.match(source, /const searchResultMarkersRef = useRef<any\[\]>\(\[\]\);/);
    assert.match(source, /const searchShortcutQueries = \[/);
    assert.match(source, /const placePhotoInFlightRef = useRef<Map<string, Promise<PlacePhotoGalleryEntry\[\]>>>\(new Map\(\)\);/);
    assert.match(source, /const activeSearchResultInfoWindowRef = useRef<\{ resultId: string; index: number; anchor: any \} \| null>\(null\);/);
    assert.match(source, /const activeSearchResultIdRef = useRef\(''\);/);
    assert.match(source, /const placeSearchResultsRef = useRef<any\[\]>\(\[\]\);/);
    assert.match(source, /const \[mapSearchScope, setMapSearchScope\] = useState/);
    assert.match(source, /const \[mapSearchSort, setMapSearchSort\] = useState/);
    assert.match(source, /const \[mapSearchAreaDirty, setMapSearchAreaDirty\] = useState/);
    assert.match(source, /const \[searchResultSelectionIds, setSearchResultSelectionIds\] = useState/);
    assert.match(source, /const \[expandedSearchResultEditorId, setExpandedSearchResultEditorId\] = useState/);
    assert.match(source, /const \[activeSearchResultId, setActiveSearchResultId\] = useState/);
    assert.match(source, /const clearSearchResultMarkers = useCallback\(\(\) => \{/);
    assert.match(source, /const renderSearchResultMarkers = useCallback\(\(results\) => \{/);
    assert.match(source, /const updateSearchResultMarkerStyles = useCallback\(\(\) => \{/);
    assert.match(source, /setActiveSearchResultId\(result\.id\);/);
    assert.match(source, /scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/);
    assert.match(source, /activeSearchResultIdRef\.current === result\.id \? '#00FF88' : '#FFFFFF'/);
    assert.match(source, /marker\.searchResultId = result\.id;/);
    assert.match(source, /marker\.searchResultLabel = markerLabel;/);
    assert.match(source, /placeSearchResultsRef\.current\.find\(\(candidate\) => candidate\.id === result\.id\)/);
    assert.match(source, /const handleSearchMapLocation = useCallback\(async \(queryInput\) => \{/);
    assert.match(source, /const handleSearchVisibleArea = useCallback\(\(\) => \{/);
    assert.match(source, /const handleLoadSearchResultPhotos = useCallback\(async \(resultId\) => \{/);
    assert.match(source, /const openSearchResultInfoWindow = useCallback\(\(result, index, anchor\) => \{/);
    assert.match(source, /const setSearchResultPhotoState = useCallback\(\(resultId, nextState\) => \{/);
    assert.match(source, /startTransition\(\(\) => \{/);
    assert.match(source, /photoLoadState: hasCachedPhotoGallery \? 'loaded' : 'idle'/);
    assert.match(source, /photoGallery: cachedPhotoGallery/);
    assert.match(source, /placePhotoCacheRef\.current\.has\(photoCacheKey\)/);
    assert.match(source, /getOrCreateCoalescedPromise\(placePhotoInFlightRef\.current, photoCacheKey/);
    assert.match(source, /buildPlacePhotoGalleryHtml\(\{/);
    assert.match(source, /activePlaceInfoWindowKeyRef\.current = `search-result:\$\{result\.id\}`;/);
    assert.match(source, /activeSearchResultInfoWindowRef\.current = \{ resultId: result\.id, index, anchor };/);
    assert.match(source, /openSearchResultInfoWindow\(activeResult, index, marker\);/);
    assert.match(source, /const handlePreviewSearchResult = useCallback\(\(resultId\) => \{/);
    assert.match(source, /const handleToggleSearchResultSelection = useCallback\(\(resultId\) => \{/);
    assert.match(source, /const handleSaveSelectedSearchResults = useCallback\(async \(\) => \{/);
    assert.match(source, /const handleOpenSearchResultTagEditor = useCallback\(\(resultId\) => \{/);
    assert.match(source, /const handleApplySearchShortcut = useCallback\(\(query\) => \{/);
    assert.match(source, /navigator\.geolocation\.getCurrentPosition/);
    assert.match(source, /mapSearchScope === 'near_me'/);
    assert.match(source, /deviceLocationLatLngRef\.current/);
    assert.match(source, /baseLatLngRef\.current/);
    assert.match(source, /setMapSearchAreaDirty\(true\)/);
    assert.match(source, /setMapSearchAreaDirty\(false\)/);
    assert.match(source, /activeSearchResultIdRef\.current = activeSearchResultId;/);
    assert.match(source, /placeSearchResultsRef\.current = placeSearchResults;/);
    assert.match(source, /window\.google\.maps\.importLibrary\('places'\)/);
    assert.match(source, /normalizePlacesTextSearchResults\(places\)/);
    assert.match(source, /createPlacePhotoCacheKey\(result\)/);
    assert.match(source, /sortPlaceSearchResults\(/);
    assert.match(source, /buildSearchResultTypeChips\(/);
    assert.match(source, /estimateWalkDurationMinutes\(/);
    assert.match(source, /distanceMeters/);
    assert.match(source, /walkDurationMinutes/);
    assert.match(source, /searchResultsOriginLabel/);
    assert.match(source, /const handleSaveSearchResultAsSpot = useCallback\(async \(resultId\) => \{/);
    assert.match(source, /fetchJson\('\/api\/custom-spots'/);
    assert.match(source, /buildCustomSpotPayloadFromSearchResult\(result, selectedTag\)/);
    assert.match(source, /const handleDeleteCustomSpot = useCallback\(async \(spotId\) => \{/);
    assert.match(source, /fetchJson\(`\/api\/custom-spots\/\$\{encodeURIComponent\(spotId\)\}`,\s*\{/);
    assert.match(source, /method: 'DELETE'/);
    assert.match(source, /setAllPlaces\(\(prev\) => prev\.filter\(\(place\) => place\.id !== spotId\)\)/);
    assert.match(source, /savedSpotId: ''/);
    assert.match(source, /savedTag: ''/);
    assert.match(source, /const handleClearSearchLocation = useCallback\(\(\) => \{/);
    assert.match(source, /const searchResultMarkerSnapshot = useMemo\(\(\) => \{/);
    assert.match(source, /renderSearchResultMarkers\(placeSearchResultsRef\.current\);/);
    assert.match(source, /updateSearchResultMarkerStyles\(\);/);
    assert.match(source, /setPlaceSearchResults\(normalizedResults\);/);
    assert.match(source, /clearSearchResultMarkers\(\);/);
    assert.match(source, /Saved "\$\{savedSpot\.name\}" to \$\{formatTag\(savedSpot\.tag\)\}\./);
    assert.match(source, /Deleted custom spot "\$\{deletedSpotName \|\| 'Saved spot'\}"\./);
    assert.match(searchPreferencesSource, /MAP_SEARCH_PREFERENCES_STORAGE_KEY = 'mapSearchPreferences'/);
    assert.match(searchPreferencesSource, /window\.localStorage\.getItem\(MAP_SEARCH_PREFERENCES_STORAGE_KEY\)/);
    assert.match(searchPreferencesSource, /window\.localStorage\.setItem\(\s*MAP_SEARCH_PREFERENCES_STORAGE_KEY,/);
    assert.equal(source.includes('body: JSON.stringify({ tripStart, tripEnd, baseLocation: trimmedQuery })'), false);
  });

  it('ties planned route visibility to the home layer toggle without clearing route state', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.match(source, /const syncRoutePolylineVisibility = useCallback\(\(\) => \{/);
    assert.match(source, /routePolylineRef\.current\.setMap\(hiddenCategoriesRef\.current\.has\('home'\) \? null : mapRef\.current\);/);
    assert.match(source, /if \(routePolylineRef\.current\) \{\s*routePolylineRef\.current\.setMap\(hiddenCategories\.has\('home'\) \? null : mapRef\.current\);\s*\}/);
    assert.match(source, /routePolylineRef\.current = new window\.google\.maps\.Polyline\(\{/);
    assert.match(source, /syncRoutePolylineVisibility\(\);/);
  });

  it('skips duplicate forced crime refreshes on the initial mount after the runtime effect performs the first load', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.match(source, /const crimeVisibilityRefreshHydratedRef = useRef\(false\);/);
    assert.match(source, /const crimeControlsRefreshHydratedRef = useRef\(false\);/);
    assert.match(source, /const crimeLookbackRefreshHydratedRef = useRef\(false\);/);
    assert.match(source, /if \(!crimeVisibilityRefreshHydratedRef\.current\) \{\s*crimeVisibilityRefreshHydratedRef\.current = true;\s*\}/);
    assert.match(source, /if \(!crimeControlsRefreshHydratedRef\.current\) \{\s*crimeControlsRefreshHydratedRef\.current = true;\s*return;\s*\}/);
    assert.match(source, /if \(!crimeLookbackRefreshHydratedRef\.current\) \{\s*crimeLookbackRefreshHydratedRef\.current = true;\s*return;\s*\}/);
    assert.match(source, /const lastCrimeIncidentsRef = useRef<any\[\]>\(\[\]\);/);
    assert.match(source, /lastCrimeIncidentsRef\.current = incidents;/);
    assert.match(source, /applyCrimeHeatmapData\(lastCrimeIncidentsRef\.current, crimeLayerMeta\.generatedAt, crimeLookbackHours\);/);
  });

  it('drops the deprecated browser DistanceMatrix service in favor of the app travel-time request helper', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.equal(source.includes('DistanceMatrixService'), false);
    assert.equal(source.includes('distanceMatrixRef'), false);
    assert.match(source, /requestTravelTimeMatrix/);
  });
});
