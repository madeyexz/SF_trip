import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConvexHttpClient } from 'convex/browser';

import {
  loadPlannerPayload,
  normalizePlannerRoomId,
  savePlannerPayload
} from './events.js';

const ORIGINAL_ENV = {
  CONVEX_URL: process.env.CONVEX_URL,
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL
};
const ORIGINAL_CONVEX_QUERY = ConvexHttpClient.prototype.query;
const ORIGINAL_CONVEX_MUTATION = ConvexHttpClient.prototype.mutation;

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  process.env.CONVEX_URL = '';
  process.env.NEXT_PUBLIC_CONVEX_URL = '';
});

afterEach(() => {
  restoreEnv();
  ConvexHttpClient.prototype.query = ORIGINAL_CONVEX_QUERY;
  ConvexHttpClient.prototype.mutation = ORIGINAL_CONVEX_MUTATION;
});

describe('normalizePlannerRoomId', () => {
  it('normalizes case and removes unsupported characters', () => {
    assert.equal(normalizePlannerRoomId('  My-Room_01  '), 'my-room_01');
    assert.equal(normalizePlannerRoomId('A!B@C#123'), 'abc123');
  });

  it('rejects ids outside supported length range', () => {
    assert.equal(normalizePlannerRoomId('a'), '');
    assert.equal(normalizePlannerRoomId(''), '');
    assert.equal(normalizePlannerRoomId('x'.repeat(65)), '');
  });
});

describe('planner payload behavior without Convex client', () => {
  it('returns local planner payload when room id is missing', async () => {
    const payload = await loadPlannerPayload('');
    assert.deepEqual(payload, {
      plannerByDate: {},
      source: 'local',
      roomId: ''
    });
  });

  it('returns room-scoped payload with local fallback when room id is present', async () => {
    const payload = await loadPlannerPayload('Room-ABC');
    assert.equal(payload.roomId, 'room-abc');
    assert.equal(payload.source, 'local');
    assert.deepEqual(payload.plannerByDate, {});
  });

  it('sanitizes planner payload and keeps local persistence when room id missing', async () => {
    const payload = await savePlannerPayload(
      {
        '2026-02-12': [
          {
            id: 'x1',
            kind: 'event',
            sourceKey: 'https://example.com/event/1',
            title: 'Dinner',
            locationText: 'SF',
            link: 'https://example.com/event/1',
            tag: 'eat',
            startMinutes: 60,
            endMinutes: 120
          },
          {
            id: 'x2',
            kind: 'place',
            sourceKey: '',
            title: 'Invalid',
            locationText: 'SF',
            link: '',
            tag: 'cafes',
            startMinutes: 120,
            endMinutes: 180
          }
        ]
      },
      ''
    );

    assert.equal(payload.persisted, 'local');
    assert.equal(payload.roomId, '');
    assert.equal(Array.isArray(payload.plannerByDate['2026-02-12']), true);
    assert.equal(payload.plannerByDate['2026-02-12'].length, 1);
  });

  it('uses normalized room id and still falls back to local when convex is unavailable', async () => {
    const payload = await savePlannerPayload(
      {
        '2026-02-12': [
          {
            id: 'x1',
            kind: 'event',
            sourceKey: 'event-key',
            title: 'Event',
            locationText: 'SF',
            link: 'https://example.com',
            tag: 'go out',
            startMinutes: 540,
            endMinutes: 615
          }
        ]
      },
      'Our ROOM!!'
    );

    assert.equal(payload.roomId, 'ourroom');
    assert.equal(payload.persisted, 'local');
    assert.equal(payload.plannerByDate['2026-02-12'].length, 1);
  });
});

describe('planner persistence round-trip with mocked Convex client', () => {
  it('saves and reloads planner state for a shared room', async () => {
    process.env.CONVEX_URL = 'https://mock.convex.cloud';

    const byRoom = new Map();

    ConvexHttpClient.prototype.query = async function query(functionName, args) {
      if (functionName === 'planner:getPlannerState') {
        const plannerByDate = byRoom.get(args.roomId) || {};
        return {
          plannerByDate,
          updatedAt: '2026-02-11T12:00:00.000Z'
        };
      }

      throw new Error(`Unexpected Convex query in test: ${functionName}`);
    };

    ConvexHttpClient.prototype.mutation = async function mutation(functionName, args) {
      if (functionName === 'planner:replacePlannerState') {
        byRoom.set(args.roomId, args.plannerByDate);
        return {
          updatedAt: args.updatedAt,
          dateCount: Object.keys(args.plannerByDate || {}).length
        };
      }

      throw new Error(`Unexpected Convex mutation in test: ${functionName}`);
    };

    const plannerByDateInput = {
      '2026-02-12': [
        {
          id: 'plan-1',
          kind: 'event',
          sourceKey: 'event-1',
          title: 'Dinner',
          locationText: 'SF',
          link: 'https://example.com/event/1',
          tag: 'eat',
          startMinutes: 1080,
          endMinutes: 1170
        }
      ]
    };

    const savePayload = await savePlannerPayload(plannerByDateInput, 'our-room');
    assert.equal(savePayload.roomId, 'our-room');
    assert.equal(savePayload.persisted, 'convex');
    assert.equal(savePayload.plannerByDate['2026-02-12'].length, 1);

    const loadPayload = await loadPlannerPayload('our-room');
    assert.equal(loadPayload.roomId, 'our-room');
    assert.equal(loadPayload.source, 'convex');
    assert.equal(loadPayload.plannerByDate['2026-02-12'].length, 1);
    assert.equal(loadPayload.plannerByDate['2026-02-12'][0].title, 'Dinner');
  });
});
