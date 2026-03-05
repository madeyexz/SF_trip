import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { requireAuthenticatedUserId } from './authz.ts';

describe('convex authz helpers', () => {
  it('requires authentication for sensitive mutations', async () => {
    await assert.rejects(
      () => requireAuthenticatedUserId({}, { getUserId: async () => null }),
      /Authentication required/i
    );
  });

  it('returns the authenticated user id', async () => {
    const userId = await requireAuthenticatedUserId({}, { getUserId: async () => 'user-1' });
    assert.equal(userId, 'user-1');
  });
});
