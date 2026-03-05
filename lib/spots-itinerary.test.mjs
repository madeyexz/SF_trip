import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('spots itinerary custom spot controls', () => {
  it('shows a delete action for saved custom spots in the main spots list', async () => {
    const componentPath = path.join(process.cwd(), 'components', 'SpotsItinerary.tsx');
    const source = await readFile(componentPath, 'utf-8');

    assert.match(source, /handleDeleteCustomSpot,/);
    assert.match(source, /place\.sourceType === 'custom_spot'/);
    assert.match(source, /handleDeleteCustomSpot\(place\.id\)/);
    assert.match(source, /Delete Spot/);
  });
});
