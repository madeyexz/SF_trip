import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { requireAuthenticatedUserId, requireOwnerUserId } from './authz.ts';

function createQueryResult(profile) {
  return {
    withIndex() {
      return {
        async first() {
          return profile;
        }
      };
    }
  };
}

describe('convex authz helpers', () => {
  it('requires authentication for sensitive mutations', async () => {
    await assert.rejects(
      () => requireAuthenticatedUserId({}, { getUserId: async () => null }),
      /Authentication required/i
    );
  });

  it('requires owner role for owner-locked mutations', async () => {
    const ctx = {
      db: {
        async get() {
          return { role: 'member' };
        },
        query() {
          return createQueryResult({ userId: 'user-1', role: 'member' });
        }
      }
    };

    await assert.rejects(
      () => requireOwnerUserId(ctx, { getUserId: async () => 'user-1' }),
      /Owner role required/i
    );
  });

  it('returns user id when caller is owner', async () => {
    const ctx = {
      db: {
        async get() {
          return { role: 'owner' };
        },
        query() {
          return createQueryResult({ userId: 'owner-1', role: 'owner' });
        }
      }
    };

    const userId = await requireOwnerUserId(ctx, { getUserId: async () => 'owner-1' });
    assert.equal(userId, 'owner-1');
  });
});
