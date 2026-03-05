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
    assert.match(source, /const clearSearchResultMarkers = useCallback\(\(\) => \{/);
    assert.match(source, /const renderSearchResultMarkers = useCallback\(\(results\) => \{/);
    assert.match(source, /const handleSearchMapLocation = useCallback\(async \(queryInput\) => \{/);
    assert.match(source, /window\.google\.maps\.importLibrary\('places'\)/);
    assert.match(source, /normalizePlacesTextSearchResults\(places\)/);
    assert.match(source, /const handleSaveSearchResultAsSpot = useCallback\(async \(resultId\) => \{/);
    assert.match(source, /fetchJson\('\/api\/custom-spots'/);
    assert.match(source, /buildCustomSpotPayloadFromSearchResult\(result, selectedTag\)/);
    assert.match(source, /const handleClearSearchLocation = useCallback\(\(\) => \{/);
    assert.match(source, /setPlaceSearchResults\(normalizedResults\);/);
    assert.match(source, /clearSearchResultMarkers\(\);/);
    assert.match(source, /Saved "\$\{savedSpot\.name\}" to \$\{formatTag\(savedSpot\.tag\)\}\./);
    assert.equal(source.includes('body: JSON.stringify({ tripStart, tripEnd, baseLocation: trimmedQuery })'), false);
  });
});
