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

  it('manages search result markers and saved custom-spot actions separately from the base marker', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.match(source, /const searchResultMarkersRef = useRef<any\[\]>\(\[\]\);/);
    assert.match(source, /const searchShortcutQueries = \[/);
    assert.match(source, /const \[mapSearchScope, setMapSearchScope\] = useState/);
    assert.match(source, /const \[mapSearchSort, setMapSearchSort\] = useState/);
    assert.match(source, /const \[mapSearchAreaDirty, setMapSearchAreaDirty\] = useState/);
    assert.match(source, /const \[searchResultSelectionIds, setSearchResultSelectionIds\] = useState/);
    assert.match(source, /const \[expandedSearchResultEditorId, setExpandedSearchResultEditorId\] = useState/);
    assert.match(source, /const \[activeSearchResultId, setActiveSearchResultId\] = useState/);
    assert.match(source, /const clearSearchResultMarkers = useCallback\(\(\) => \{/);
    assert.match(source, /const renderSearchResultMarkers = useCallback\(\(results\) => \{/);
    assert.match(source, /setActiveSearchResultId\(result\.id\);/);
    assert.match(source, /scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/);
    assert.match(source, /createLucidePinIconWithLabel\(mapPinIconNode, activeSearchResultId === result\.id \? '#00FF88' : '#FFFFFF'/);
    assert.match(source, /const handleSearchMapLocation = useCallback\(async \(queryInput\) => \{/);
    assert.match(source, /const handleSearchVisibleArea = useCallback\(\(\) => \{/);
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
    assert.match(source, /window\.google\.maps\.importLibrary\('places'\)/);
    assert.match(source, /normalizePlacesTextSearchResults\(places\)/);
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
    assert.match(source, /setPlaceSearchResults\(normalizedResults\);/);
    assert.match(source, /clearSearchResultMarkers\(\);/);
    assert.match(source, /Saved "\$\{savedSpot\.name\}" to \$\{formatTag\(savedSpot\.tag\)\}\./);
    assert.match(source, /Deleted custom spot "\$\{deletedSpotName \|\| 'Saved spot'\}"\./);
    assert.match(source, /localStorage\.getItem\('mapSearchPreferences'\)/);
    assert.match(source, /localStorage\.setItem\('mapSearchPreferences'/);
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
});
