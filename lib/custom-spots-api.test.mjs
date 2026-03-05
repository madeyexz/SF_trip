import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPostCustomSpotsHandler } from './custom-spots-api.ts';

describe('custom spots API handler', () => {
  it('returns denied response when authentication fails', async () => {
    const denied = Response.json({ error: 'Sign in required.' }, { status: 401 });
    const POST = createPostCustomSpotsHandler({
      runWithAuthenticatedClient: async () => denied,
      createCustomSpotPayload: async () => {
        throw new Error('createCustomSpotPayload should not run');
      }
    });

    const result = await POST(new Request('https://example.com/api/custom-spots', {
      method: 'POST',
      body: JSON.stringify({})
    }));
    assert.equal(result, denied);
  });

  it('returns 400 when the request body is invalid JSON', async () => {
    const POST = createPostCustomSpotsHandler({
      runWithAuthenticatedClient: async (handler) => handler(),
      createCustomSpotPayload: async () => {
        throw new Error('createCustomSpotPayload should not run');
      }
    });

    const result = await POST(new Request('https://example.com/api/custom-spots', {
      method: 'POST',
      body: '{'
    }));

    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), { error: 'Invalid custom spot payload.' });
  });

  it('returns the saved custom spot on success', async () => {
    const savedSpot = {
      id: 'custom-sightglass',
      tag: 'cafes',
      name: 'Sightglass Coffee'
    };
    let receivedPayload = null;
    const POST = createPostCustomSpotsHandler({
      runWithAuthenticatedClient: async (handler) => handler(),
      createCustomSpotPayload: async (payload) => {
        receivedPayload = payload;
        return savedSpot;
      }
    });

    const requestBody = {
      id: 'place-1',
      tag: 'cafes',
      name: 'Sightglass Coffee',
      location: '270 7th St, San Francisco, CA',
      mapLink: 'https://www.google.com/maps/search/?api=1&query=Sightglass+Coffee'
    };

    const result = await POST(new Request('https://example.com/api/custom-spots', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' }
    }));

    assert.deepEqual(receivedPayload, requestBody);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { spot: savedSpot });
  });

  it('returns 400 when payload normalization or persistence fails', async () => {
    const POST = createPostCustomSpotsHandler({
      runWithAuthenticatedClient: async (handler) => handler(),
      createCustomSpotPayload: async () => {
        throw new Error('Tag must be one of eat, bar, cafes, go out, shops, sightseeing.');
      }
    });

    const result = await POST(new Request('https://example.com/api/custom-spots', {
      method: 'POST',
      body: JSON.stringify({
        id: 'place-1',
        tag: 'unknown'
      }),
      headers: { 'Content-Type': 'application/json' }
    }));

    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), {
      error: 'Tag must be one of eat, bar, cafes, go out, shops, sightseeing.'
    });
  });
});
