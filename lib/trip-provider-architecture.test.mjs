import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('trip provider architecture', () => {
  it('composes TripProvider from extracted trip feature modules', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.match(source, /from '\.\/trip\/context\.ts'/);
    assert.match(source, /from '\.\/trip\/bootstrap\.ts'/);
    assert.match(source, /from '\.\/trip\/planner-persistence\.ts'/);
    assert.match(source, /from '\.\/trip\/map-search-preferences\.ts'/);
  });

  it('keeps planner persistence, bootstrap loading, and map-search storage out of TripProvider', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.equal(source.includes("fetchJson('/api/planner')"), false);
    assert.equal(source.includes("fetchJson('/api/config')"), false);
    assert.equal(source.includes("localStorage.getItem('mapSearchPreferences')"), false);
    assert.equal(source.includes("localStorage.setItem('mapSearchPreferences'"), false);
  });
});
