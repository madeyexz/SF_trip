import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTripBootstrapPayload } from './trip-bootstrap.ts';

describe('authenticated bootstrap isolation', () => {
  it('loads fresh private payloads after an account switch', async () => {
    let user = 'A';
    let calls = 0;
    const fetcher = async url => {
      calls += 1;
      return url === '/api/me'
        ? { authenticated: true, profile: { userId: user } }
        : { user, privateData: `private-${user}` };
    };
    const first = await loadTripBootstrapPayload(fetcher);
    user = 'B';
    const second = await loadTripBootstrapPayload(fetcher);
    assert.equal(calls, 8);
    assert.equal(first.eventsPayload.privateData, 'private-A');
    assert.equal(second.eventsPayload.privateData, 'private-B');
    assert.equal(second.mePayload.profile.userId, 'B');
  });

  it('does not retain a stale successful response after a later load failure', async () => {
    await loadTripBootstrapPayload(async url => url === '/api/me'
      ? { authenticated: true, profile: { userId: 'A' } } : { user: 'A' });
    await assert.rejects(
      loadTripBootstrapPayload(async () => { throw new Error('offline'); }),
      /offline/
    );
  });

  it('requires verified current account identity and forwards cancellation', async () => {
    const controller = new AbortController();
    await assert.rejects(loadTripBootstrapPayload(async (_url, options) => {
      assert.equal(options.signal, controller.signal);
      return {};
    }, controller.signal), /account could not be verified/);
  });
});
