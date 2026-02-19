import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createGetEventsHandler } from './events-api.ts';

describe('events API handler', () => {
  it('returns denied response when authentication fails', async () => {
    const denied = Response.json({ error: 'Sign in required.' }, { status: 401 });
    const GET = createGetEventsHandler({
      runWithAuthenticatedClient: async () => denied,
      loadEventsPayload: async () => {
        throw new Error('loadEventsPayload should not run');
      }
    });

    const result = await GET();
    assert.equal(result, denied);
  });

  it('returns payload when authentication succeeds', async () => {
    const payload = {
      meta: { syncedAt: null, calendars: [], eventCount: 0, spotCount: 0 },
      events: [],
      places: []
    };
    const GET = createGetEventsHandler({
      runWithAuthenticatedClient: async (handler) => handler({ client: {}, deniedResponse: null, profile: {} }),
      loadEventsPayload: async () => payload
    });

    const result = await GET();
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), payload);
  });
});
