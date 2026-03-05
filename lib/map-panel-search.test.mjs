import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('map panel search overlay', () => {
  it('renders a submit-based places search form on the map', async () => {
    const panelPath = path.join(process.cwd(), 'components', 'MapPanel.tsx');
    const source = await readFile(panelPath, 'utf-8');

    assert.match(source, /mapSearchQuery,/);
    assert.match(source, /isSearchingMapLocation,/);
    assert.match(source, /placeSearchResults,/);
    assert.match(source, /searchResultTagDrafts,/);
    assert.match(source, /savingSearchResultId,/);
    assert.match(source, /searchLocationError,/);
    assert.match(source, /handleSearchMapLocation,/);
    assert.match(source, /handleClearSearchLocation,/);
    assert.match(source, /handleSetSearchResultTag,/);
    assert.match(source, /handleFocusSearchResult,/);
    assert.match(source, /handleSaveSearchResultAsSpot,/);
    assert.match(source, /<form/);
    assert.match(source, /void handleSearchMapLocation\(mapSearchQuery\);/);
    assert.match(source, /TRY "CAFE NEARBY" OR "SUSHI MISSION"/);
    assert.match(source, /\{'\/\/ Search Location'\}/);
    assert.match(source, /Searches return multiple pinned places\./);
  });

  it('shows per-result save controls when places search results exist', async () => {
    const panelPath = path.join(process.cwd(), 'components', 'MapPanel.tsx');
    const source = await readFile(panelPath, 'utf-8');

    assert.match(source, /hasSearchLocation,/);
    assert.match(source, /\{hasSearchLocation \? \(/);
    assert.match(source, /placeSearchResults\.map\(\(result, index\)/);
    assert.match(source, /handleSetSearchResultTag\(result\.id, value\)/);
    assert.match(source, /handleFocusSearchResult\(result\.id\)/);
    assert.match(source, /handleSaveSearchResultAsSpot\(result\.id\)/);
    assert.match(source, /handleDeleteCustomSpot\(result\.savedSpotId\)/);
    assert.match(source, /Save Spot/);
    assert.match(source, /Remove Spot/);
    assert.match(source, /onClick=\{handleClearSearchLocation\}/);
    assert.match(source, /aria-label="Clear search pin"/);
  });
});
