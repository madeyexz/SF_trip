import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('trip provider storage hardening', () => {
  it('does not persist planner or pair-room data in localStorage', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.equal(source.includes('window.localStorage'), false);
  });

  it('does not retain pair-room implementation details', async () => {
    const providerPath = path.join(process.cwd(), 'components', 'providers', 'TripProvider.tsx');
    const source = await readFile(providerPath, 'utf-8');

    assert.equal(source.includes('/api/pair'), false);
    assert.equal(source.includes('currentPairRoomId'), false);
    assert.equal(source.includes('plannerByDatePartner'), false);
    assert.equal(source.includes('plannerByDateMine'), false);
  });
});
