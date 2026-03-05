import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runWithAuthenticatedClient } from './api-guards.ts';

describe('api guards', () => {
  it('short-circuits with denied response when auth fails', async () => {
    const deniedResponse = Response.json({ error: 'nope' }, { status: 401 });

    const result = await runWithAuthenticatedClient(
      async () => {
        throw new Error('handler should not run');
      },
      {
        requireAuth: async () => ({ client: null, deniedResponse, profile: null }),
        runWithClientContext: async (_client, fn) => fn()
      }
    );

    assert.equal(result, deniedResponse);
  });

  it('runs handler with authenticated context on success', async () => {
    const client = { id: 'client-1' };
    const result = await runWithAuthenticatedClient(
      async (auth) => Response.json({ ok: true, userId: auth.profile.userId }),
      {
        requireAuth: async () => ({ client, deniedResponse: null, profile: { userId: 'user-1' } }),
        runWithClientContext: async (providedClient, fn) => {
          assert.equal(providedClient, client);
          return fn();
        }
      }
    );

    assert.equal(result.status, 200);
    const payload = await result.json();
    assert.deepEqual(payload, { ok: true, userId: 'user-1' });
  });
});
