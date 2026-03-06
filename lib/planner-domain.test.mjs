import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePlannerPayload,
  sanitizePlannerByDate,
  sortPlanItems,
} from './planner-domain.ts';

describe('planner domain contracts', () => {
  it('rejects a missing plannerByDate object', () => {
    assert.deepEqual(parsePlannerPayload({}), {
      ok: false,
      plannerByDate: null,
      error: 'plannerByDate object is required.'
    });
  });

  it('sanitizes and sorts planner rows through a shared domain helper', () => {
    const payload = parsePlannerPayload({
      plannerByDate: {
        '2026-03-05': [
          {
            id: 'later',
            kind: 'place',
            sourceKey: 'place:later',
            title: 'Later stop',
            locationText: 'Somewhere',
            link: 'https://example.com/later',
            tag: 'CAFES',
            startMinutes: 720,
            endMinutes: 810,
            ignored: 'client-only'
          },
          {
            id: 'earlier',
            kind: 'event',
            sourceKey: 'event:earlier',
            title: 'Earlier stop',
            locationText: 'Elsewhere',
            link: 'https://example.com/earlier',
            tag: 'EVENT',
            startMinutes: 540,
            endMinutes: 600
          },
          {
            id: '',
            kind: 'place',
            sourceKey: '',
            title: 'Invalid row',
            locationText: '',
            link: '',
            tag: 'eat',
            startMinutes: 0,
            endMinutes: 10
          }
        ]
      }
    });

    assert.equal(payload.ok, true);
    assert.deepEqual(payload.plannerByDate, {
      '2026-03-05': [
        {
          id: 'earlier',
          kind: 'event',
          sourceKey: 'event:earlier',
          title: 'Earlier stop',
          locationText: 'Elsewhere',
          link: 'https://example.com/earlier',
          tag: 'event',
          startMinutes: 540,
          endMinutes: 600
        },
        {
          id: 'later',
          kind: 'place',
          sourceKey: 'place:later',
          title: 'Later stop',
          locationText: 'Somewhere',
          link: 'https://example.com/later',
          tag: 'cafes',
          startMinutes: 720,
          endMinutes: 810
        }
      ]
    });
  });

  it('exports the shared sort and sanitize helpers for client and server consumers', () => {
    assert.deepEqual(
      sortPlanItems([
        { id: 'b', startMinutes: 600 },
        { id: 'a', startMinutes: 540 }
      ]),
      [
        { id: 'a', startMinutes: 540 },
        { id: 'b', startMinutes: 600 }
      ]
    );

    assert.deepEqual(
      sanitizePlannerByDate({
        '2026-03-06': [
          {
            id: 'clamped',
            kind: 'event',
            sourceKey: 'event:clamped',
            title: 'Clamped',
            locationText: '',
            link: '',
            tag: 'event',
            startMinutes: -50,
            endMinutes: 10
          }
        ]
      }),
      {
        '2026-03-06': [
          {
            id: 'clamped',
            kind: 'event',
            sourceKey: 'event:clamped',
            title: 'Clamped',
            locationText: '',
            link: '',
            tag: 'event',
            startMinutes: 0,
            endMinutes: 30
          }
        ]
      }
    );
  });
});
