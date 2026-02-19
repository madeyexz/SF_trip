import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlannerRoomCodeFromUrl,
  normalizePlannerRoomCode,
  parsePlannerPostPayload
} from './planner-api.ts';

describe('planner-api', () => {
  it('normalizes room code', () => {
    assert.equal(normalizePlannerRoomCode('  Room_AB-9  '), 'room_ab-9');
  });

  it('rejects invalid room code lengths', () => {
    assert.equal(normalizePlannerRoomCode('a'), '');
    assert.equal(normalizePlannerRoomCode('x'.repeat(80)), '');
  });

  it('parses room code from url query', () => {
    const valueA = getPlannerRoomCodeFromUrl('https://example.com/api/planner?roomId=Trip_Room-1');
    const valueB = getPlannerRoomCodeFromUrl('https://example.com/api/planner?roomCode=Trip_Room-1');
    assert.equal(valueA, 'trip_room-1');
    assert.equal(valueB, 'trip_room-1');
  });

  it('requires plannerByDate object in post payload', () => {
    const resultA = parsePlannerPostPayload(null, '');
    const resultB = parsePlannerPostPayload({ plannerByDate: [] }, '');
    assert.equal(resultA.ok, false);
    assert.equal(resultB.ok, false);
    assert.equal(resultA.error, 'plannerByDate object is required.');
  });

  it('uses room code from body over query and normalizes it', () => {
    const result = parsePlannerPostPayload(
      {
        roomId: ' Body_Room-2 ',
        plannerByDate: {
          '2026-02-10': []
        }
      },
      'query-room'
    );
    assert.equal(result.ok, true);
    assert.equal(result.roomCode, 'body_room-2');
    assert.deepEqual(result.plannerByDate, { '2026-02-10': [] });
  });

  it('falls back to query room code when body omits room', () => {
    const result = parsePlannerPostPayload(
      {
        plannerByDate: {
          '2026-02-10': []
        }
      },
      'query_room'
    );
    assert.equal(result.ok, true);
    assert.equal(result.roomCode, 'query_room');
  });

  it('sanitizes planner items and strips client-only fields', () => {
    const result = parsePlannerPostPayload(
      {
        roomCode: 'trip-room',
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
