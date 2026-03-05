import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePlannerPostPayload
} from './planner-api.ts';

describe('planner-api', () => {
  it('requires plannerByDate object in post payload', () => {
    const resultA = parsePlannerPostPayload(null);
    const resultB = parsePlannerPostPayload({ plannerByDate: [] });
    assert.equal(resultA.ok, false);
    assert.equal(resultB.ok, false);
    assert.equal(resultA.error, 'plannerByDate object is required.');
  });

  it('ignores legacy room identifiers in the post payload', () => {
    const result = parsePlannerPostPayload(
      {
        roomId: ' Body_Room-2 ',
        plannerByDate: {
          '2026-02-10': []
        }
      }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.plannerByDate, { '2026-02-10': [] });
    assert.equal('roomCode' in result, false);
  });

  it('does not accept query room code fallback anymore', () => {
    const result = parsePlannerPostPayload(
      {
        plannerByDate: {
          '2026-02-10': []
        }
      }
    );
    assert.equal(result.ok, true);
    assert.equal('roomCode' in result, false);
  });

  it('sanitizes planner items and strips client-only fields', () => {
    const result = parsePlannerPostPayload(
      {
        plannerByDate: {
          '2026-02-10': [
            {
              id: 'plan-1',
              kind: 'place',
              sourceKey: 'corner-42',
              title: 'Saint Frank Coffee',
              locationText: '2340 Polk St, San Francisco',
              link: 'https://maps.example/saint-frank',
              tag: 'cafes',
              startMinutes: 540,
              endMinutes: 615,
              ownerUserId: 'should-not-be-sent',
              extraField: 'ignore-me'
            }
          ]
        }
      },
      ''
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.plannerByDate, {
      '2026-02-10': [
        {
          id: 'plan-1',
          kind: 'place',
          sourceKey: 'corner-42',
          title: 'Saint Frank Coffee',
          locationText: '2340 Polk St, San Francisco',
          link: 'https://maps.example/saint-frank',
          tag: 'cafes',
          startMinutes: 540,
          endMinutes: 615
        }
      ]
    });
  });
});
