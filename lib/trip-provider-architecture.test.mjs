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

  it('avoids duplicate authenticated bootstrap fetches on initial mount', async () => {
    const bootstrapPath = path.join(process.cwd(), 'components', 'providers', 'trip', 'bootstrap.ts');
    const source = await readFile(bootstrapPath, 'utf-8');

    const eventFetches = source.match(/fetchJson\('\/api\/events'\)/g) || [];
    const sourceFetches = source.match(/fetchJson\('\/api\/sources'\)/g) || [];

    assert.equal(eventFetches.length, 1);
    assert.equal(source.includes('Failed to load personal events/sources.'), false);
    assert.equal(sourceFetches.length, 2);
    assert.match(source, /let bootstrapPayloadPromiseByAuth = new Map<string, Promise<any>>\(\);/);
    assert.match(source, /const bootstrapKey = isAuthenticated \? 'auth' : 'anon';/);
    assert.match(source, /if \(!bootstrapPayloadPromiseByAuth\.has\(bootstrapKey\)\) \{/);
    assert.match(source, /if \(authLoading\) \{\s*return;\s*\}/);
  });
});
