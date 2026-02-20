import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasPairRoomUser,
  mergePairRoomMembers,
  normalizePairRoomMembers,
  pairRoomMembersFingerprint,
  roomHasEveryLegacyMember
} from './pairRoomMembers.ts';

describe('pair room member helpers', () => {
  it('normalizes, deduplicates, and sorts members deterministically', () => {
    const members = normalizePairRoomMembers([
      { userId: 'user-b', joinedAt: '2026-02-20T11:00:00.000Z' },
      { userId: 'user-a', joinedAt: '2026-02-20T12:00:00.000Z' },
      { userId: 'user-a', joinedAt: '2026-02-20T10:00:00.000Z' },
      { userId: '', joinedAt: '2026-02-20T09:00:00.000Z' }
    ]);

    assert.deepEqual(members, [
      { userId: 'user-a', joinedAt: '2026-02-20T10:00:00.000Z' },
      { userId: 'user-b', joinedAt: '2026-02-20T11:00:00.000Z' }
    ]);
    assert.equal(pairRoomMembersFingerprint(members), 'user-a@2026-02-20T10:00:00.000Z|user-b@2026-02-20T11:00:00.000Z');
  });

  it('merges legacy and embedded members while preserving first join timestamp', () => {
    const merged = mergePairRoomMembers(
      [{ userId: 'owner', joinedAt: '2026-02-20T09:00:00.000Z' }],
      [
        { userId: 'owner', joinedAt: '2026-02-20T12:00:00.000Z' },
        { userId: 'partner', joinedAt: '2026-02-20T09:30:00.000Z' }
      ]
    );

    assert.deepEqual(merged, [
      { userId: 'owner', joinedAt: '2026-02-20T09:00:00.000Z' },
      { userId: 'partner', joinedAt: '2026-02-20T09:30:00.000Z' }
    ]);
    assert.equal(hasPairRoomUser(merged, 'owner'), true);
    assert.equal(hasPairRoomUser(merged, 'missing'), false);
    assert.equal(roomHasEveryLegacyMember(merged, [{ userId: 'partner', joinedAt: 'ignored' }]), true);
    assert.equal(roomHasEveryLegacyMember([{ userId: 'owner', joinedAt: 'x' }], merged), false);
  });
});
