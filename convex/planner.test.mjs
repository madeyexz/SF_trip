import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlannerStateForUser,
  replacePlannerStateForUser
} from './planner.ts';

function createPlannerQueryCtx(rows) {
  return {
    db: {
      query(tableName) {
        assert.equal(tableName, 'plannerEntries');
        return {
          withIndex(indexName, buildQuery) {
            assert.equal(indexName, 'by_user');
            const probe = {
              eq(fieldName, value) {
                assert.equal(fieldName, 'userId');
                assert.equal(value, 'user-1');
                return probe;
              }
            };
            buildQuery(probe);
            return {
              async collect() {
                return rows;
              }
            };
          }
        };
      }
    }
  };
}

describe('planner query helpers', () => {
  it('groups and sorts planner entries by date for one user', async () => {
    const result = await getPlannerStateForUser(
      createPlannerQueryCtx([
        {
          dateISO: '2026-03-10',
          itemId: 'late',
          kind: 'place',
          sourceKey: 'place:late',
          title: 'Late stop',
          locationText: 'Mission',
          link: '',
          tag: 'food',
          startMinutes: 720,
          endMinutes: 780
        },
        {
          dateISO: '2026-03-10',
          itemId: 'early',
          kind: 'event',
          sourceKey: 'event:early',
          title: 'Early stop',
          locationText: 'SOMA',
          link: '',
          tag: 'tech',
          startMinutes: 540,
          endMinutes: 600
        },
        {
          dateISO: 'bad-date',
          itemId: 'ignored',
          kind: 'event',
          sourceKey: 'event:ignored',
          title: 'Ignored',
          locationText: '',
          link: '',
          tag: '',
          startMinutes: 0,
          endMinutes: 30
        }
      ]),
      'user-1'
    );

    assert.deepEqual(result, {
      userId: 'user-1',
      plannerByDate: {
        '2026-03-10': [
          {
            id: 'early',
            kind: 'event',
            sourceKey: 'event:early',
            title: 'Early stop',
            locationText: 'SOMA',
            link: '',
            tag: 'tech',
            startMinutes: 540,
            endMinutes: 600
          },
          {
            id: 'late',
            kind: 'place',
            sourceKey: 'place:late',
            title: 'Late stop',
            locationText: 'Mission',
            link: '',
            tag: 'food',
            startMinutes: 720,
            endMinutes: 780
          }
        ]
      }
    });
  });
});

describe('planner mutation helpers', () => {
  it('replaces all planner entries for the authenticated user with sanitized rows', async () => {
    const deletedIds = [];
    const insertedRows = [];
    const ctx = {
      db: {
        query(tableName) {
          assert.equal(tableName, 'plannerEntries');
          return {
            withIndex(indexName, buildQuery) {
              assert.equal(indexName, 'by_user');
              const probe = {
                eq(fieldName, value) {
                  assert.equal(fieldName, 'userId');
                  assert.equal(value, 'user-1');
                  return probe;
                }
              };
              buildQuery(probe);
              return {
                async collect() {
                  return [{ _id: 'old-row' }];
                }
              };
            }
          };
        },
        async delete(id) {
          deletedIds.push(id);
        },
        async insert(tableName, row) {
          assert.equal(tableName, 'plannerEntries');
          insertedRows.push(row);
        }
      }
    };

    const result = await replacePlannerStateForUser(ctx, 'user-1', {
      '2026-03-10': [
        {
          id: 'later',
          kind: 'place',
          sourceKey: 'place:later',
          title: 'Later',
          locationText: 'Mission',
          link: '',
          tag: 'FOOD',
          startMinutes: 900,
          endMinutes: 950,
          ownerUserId: 'legacy'
        },
        {
          id: 'earlier',
          kind: 'event',
          sourceKey: 'event:earlier',
          title: 'Earlier',
          locationText: 'SOMA',
          link: '',
          tag: 'TECH',
          startMinutes: 480,
          endMinutes: 540
        },
        {
          id: 'skip-me',
          kind: 'event',
          sourceKey: '',
          title: 'Missing source',
          locationText: '',
          link: '',
          tag: 'noop',
          startMinutes: 100,
          endMinutes: 130
        }
      ]
    });

    assert.deepEqual(deletedIds, ['old-row']);
    assert.equal(insertedRows.length, 2);
    assert.deepEqual(
      insertedRows.map(({ userId, dateISO, itemId, kind, sourceKey, title, tag, startMinutes, endMinutes }) => ({
        userId,
        dateISO,
        itemId,
        kind,
        sourceKey,
        title,
        tag,
        startMinutes,
        endMinutes
      })),
      [
        {
          userId: 'user-1',
          dateISO: '2026-03-10',
          itemId: 'earlier',
          kind: 'event',
          sourceKey: 'event:earlier',
          title: 'Earlier',
          tag: 'tech',
          startMinutes: 480,
          endMinutes: 540
        },
        {
          userId: 'user-1',
          dateISO: '2026-03-10',
          itemId: 'later',
          kind: 'place',
          sourceKey: 'place:later',
          title: 'Later',
          tag: 'food',
          startMinutes: 900,
          endMinutes: 950
        }
      ]
    );
    assert.equal(result.userId, 'user-1');
    assert.equal(result.dateCount, 1);
    assert.equal(result.itemCount, 2);
    assert.match(result.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});
