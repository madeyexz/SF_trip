import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  listImportedRecordsForUser,
  reconcileImportedRecordsForUser,
  getImportSyncMetaForUser,
  saveImportSyncMetaForUser
} from './importedRecords.ts';

function database(seed) {
  const tables = structuredClone(seed);
  let id = 0;
  const ctx = {
    db: {
      query(table) {
        return {
          withIndex(index, build) {
            assert.ok(['by_user', 'by_user_key'].includes(index));
            const filters = [];
            const q = { eq(field, value) { filters.push([field, value]); return q; } };
            build(q);
            assert.ok(filters.some(([field]) => field === 'userId'));
            const rows = () => (tables[table] || []).filter(
              (row) => filters.every(([field, value]) => row[field] === value)
            );
            return { collect: async () => rows(), first: async () => rows()[0] || null };
          }
        };
      },
      async patch(recordId, update) {
        const row = Object.values(tables).flat().find((item) => item._id === recordId);
        assert.ok(row);
        Object.assign(row, update);
      },
      async replace(recordId, update) {
        for (const rows of Object.values(tables)) {
          const index = rows.findIndex((item) => item._id === recordId);
          if (index >= 0) rows[index] = { ...update, _id: recordId };
        }
      },
      async insert(table, record) {
        const recordId = `new-${++id}`;
        (tables[table] ||= []).push({ ...record, _id: recordId });
        return recordId;
      },
      async delete() { assert.fail('Reconciliation must preserve documents'); }
    }
  };
  return { ctx, tables };
}

describe('personal imported records', () => {
  it('keeps blank-URL events distinct by source and ID on insertion, updates, and retirement', async () => {
    const { ctx, tables } = database({ events: [] });
    const records = [
      { id: 'shared-id', eventUrl: '', sourceUrl: 'source-a', name: 'A' },
      { id: 'shared-id', eventUrl: '', sourceUrl: 'source-b', name: 'B' },
      { id: 'different-id', eventUrl: '', sourceUrl: 'source-a', name: 'C' },
      { id: 'shared-id', eventUrl: '', sourceId: 'fallback-source', name: 'D' }
    ];
    await reconcileImportedRecordsForUser(ctx, 'events', 'alice', records, 'first');
    const originalIds = tables.events.map((row) => row._id);
    await reconcileImportedRecordsForUser(
      ctx, 'events', 'alice', records.map((row) => ({ ...row, name: `${row.name}-updated` })), 'second'
    );
    assert.equal(tables.events.length, 4);
    assert.deepEqual(tables.events.map((row) => row._id), originalIds);
    assert.deepEqual(tables.events.map((row) => row.name), ['A-updated', 'B-updated', 'C-updated', 'D-updated']);

    // Retaining one blank URL must not mask another missing item in that source.
    await reconcileImportedRecordsForUser(
      ctx, 'events', 'alice', [records[0]], 'third', ['source-a'], 1
    );
    assert.equal(tables.events[0].isDeleted, false);
    assert.equal(tables.events[1].isDeleted, false);
    assert.equal(tables.events[2].isDeleted, true);
    assert.equal(tables.events[3].isDeleted, false);
  });

  for (const table of ['events', 'spots']) {
    it(`${table}: isolates reads, overlapping identities, reconciliation and legacy rows`, async () => {
      const record = { id: 'same', eventUrl: 'https://event.example/shared-id', sourceUrl: 'source-ok' };
      const legacy = { ...record, _id: 'legacy', name: 'legacy-private' };
      const other = { ...record, _id: 'other', userId: 'bob', name: 'bob-private' };
      const { ctx, tables } = database({
        [table]: [
          legacy, other,
          { ...record, _id: 'mine', userId: 'alice', name: 'old' },
          { id: 'failed', eventUrl: 'failed', sourceUrl: 'source-failed', _id: 'failed', userId: 'alice' },
          { id: 'missing', eventUrl: 'missing', sourceUrl: 'source-ok', _id: 'missing', userId: 'alice' }
        ]
      });
      const visible = await listImportedRecordsForUser(ctx, table, 'alice');
      assert.deepEqual(visible.map((row) => row._id), ['mine', 'failed', 'missing']);
      await reconcileImportedRecordsForUser(
        ctx, table, 'alice', [{ ...record, userId: 'bob', name: 'alice-new' }], 'now', ['source-ok'], 1
      );
      assert.deepEqual(tables[table].find((row) => row._id === 'other'), other);
      assert.deepEqual(tables[table].find((row) => row._id === 'legacy'), legacy);
      assert.equal(tables[table].find((row) => row._id === 'mine').userId, 'alice');
      assert.equal(tables[table].find((row) => row._id === 'mine').name, 'alice-new');
      assert.equal(tables[table].find((row) => row._id === 'failed').missedSyncCount, undefined);
      assert.equal(tables[table].find((row) => row._id === 'missing').isDeleted, true);
      // A new account importing the exact same item receives a distinct owned record.
      await reconcileImportedRecordsForUser(ctx, table, 'carol', [record], 'now');
      assert.equal((await listImportedRecordsForUser(ctx, table, 'carol')).length, 1);
      assert.equal((await listImportedRecordsForUser(ctx, table, 'bob'))[0].name, 'bob-private');
    });

    it(`${table}: unknown provenance and unspecified successes fail closed`, async () => {
      const { ctx, tables } = database({
        [table]: [
          { _id: 'mine', userId: 'alice', id: '1', eventUrl: '1', sourceUrl: 'source' },
          { _id: 'unknown', userId: 'alice', id: '2', eventUrl: '2' }
        ]
      });
      await reconcileImportedRecordsForUser(ctx, table, 'alice', [], 'now');
      assert.equal(tables[table][0].missedSyncCount, undefined);
      await reconcileImportedRecordsForUser(ctx, table, 'alice', [], 'now', ['source']);
      assert.equal(tables[table][0].missedSyncCount, 1);
      assert.equal(tables[table][1].missedSyncCount, undefined);
    });
  }

  it('isolates metadata and preserves the ownerless historical metadata', async () => {
    const { ctx, tables } = database({
      syncMeta: [{ _id: 'legacy', key: 'events', syncedAt: 'old', calendars: ['private'], eventCount: 99 }]
    });
    assert.equal(await getImportSyncMetaForUser(ctx, 'events', 'alice'), null);
    await saveImportSyncMetaForUser(ctx, 'events', 'alice', 'now', ['alice-source'], 1);
    await saveImportSyncMetaForUser(ctx, 'events', 'bob', 'now', ['bob-source'], 2);
    await saveImportSyncMetaForUser(ctx, 'events', 'alice', 'later', ['alice-source'], 3);
    assert.equal((await getImportSyncMetaForUser(ctx, 'events', 'alice')).eventCount, 3);
    assert.deepEqual((await getImportSyncMetaForUser(ctx, 'events', 'bob')).calendars, ['bob-source']);
    assert.equal(tables.syncMeta[0].eventCount, 99);
    assert.equal(tables.syncMeta.length, 3);
  });
});
