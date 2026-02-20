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

  it('passes room code to loadEventsPayload when present in query string', async () => {
    let seenRoomCode = '';
    const payload = {
      meta: { syncedAt: null, calendars: [], eventCount: 0, spotCount: 0 },
      events: [],
      places: []
    };
    const GET = createGetEventsHandler({
      runWithAuthenticatedClient: async (handler) => handler({ client: {}, deniedResponse: null, profile: {} }),
      loadEventsPayload: async (roomCode) => {
        seenRoomCode = roomCode;
        return payload;
      }
    });

    const request = new Request('https://example.com/api/events?roomCode=Trip_Room-1');
    const result = await GET(request);
    assert.equal(result.status, 200);
    assert.equal(seenRoomCode, 'trip_room-1');
  });
});
