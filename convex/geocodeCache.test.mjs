import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  listGeocodeCacheRowsByAddressKeys,
  upsertGeocodeCacheRows
} from './geocodeCache.ts';

function createGeocodeQueryCtx(rows) {
  return {
    db: {
      query(tableName) {
        assert.equal(tableName, 'geocodeCache');
        return {
          async collect() {
            return rows;
          }
        };
      }
    }
  };
}

describe('geocode cache query helpers', () => {
  it('returns only matching address keys once even when requested repeatedly', async () => {
    const result = await listGeocodeCacheRowsByAddressKeys(
      createGeocodeQueryCtx([
        {
          addressKey: 'mission district',
          addressText: 'Mission District',
          lat: 37.7599,
          lng: -122.4148,
          updatedAt: '2026-03-05T00:00:00.000Z'
        },
        {
          addressKey: 'soma',
          addressText: 'SOMA',
          lat: 37.7785,
          lng: -122.4056,
          updatedAt: '2026-03-05T00:00:00.000Z'
        }
      ]),
      ['mission district', 'mission district', 'unknown']
    );

    assert.deepEqual(result, [
      {
        addressKey: 'mission district',
        addressText: 'Mission District',
        lat: 37.7599,
        lng: -122.4148,
        updatedAt: '2026-03-05T00:00:00.000Z'
      }
    ]);
  });
});

describe('geocode cache mutation helpers', () => {
  it('inserts new rows, updates changed rows, and skips unchanged rows', async () => {
    const inserted = [];
    const patched = [];

    const summary = await upsertGeocodeCacheRows(
      {
        db: {
          query(tableName) {
            assert.equal(tableName, 'geocodeCache');
            return {
              async collect() {
                return [
                  {
                    _id: 'geo_existing_same',
                    addressKey: 'unchanged',
                    addressText: 'Unchanged',
                    lat: 1,
                    lng: 2,
                    updatedAt: '2026-03-01T00:00:00.000Z'
                  },
                  {
                    _id: 'geo_existing_changed',
                    addressKey: 'changed',
                    addressText: 'Old Text',
                    lat: 3,
                    lng: 4,
                    updatedAt: '2026-03-01T00:00:00.000Z'
                  }
                ];
              }
            };
          },
          async insert(tableName, row) {
            assert.equal(tableName, 'geocodeCache');
            inserted.push(row);
          },
          async patch(id, row) {
            patched.push({ id, row });
          }
        }
      },
      [
        {
          addressKey: 'unchanged',
          addressText: 'Unchanged',
          lat: 1,
          lng: 2,
          updatedAt: '2026-03-05T00:00:00.000Z'
        },
        {
          addressKey: 'changed',
          addressText: 'New Text',
          lat: 9,
          lng: 10,
          updatedAt: '2026-03-05T00:00:00.000Z'
        },
        {
          addressKey: 'inserted',
          addressText: 'Inserted Text',
          lat: 11,
          lng: 12,
          updatedAt: '2026-03-05T00:00:00.000Z'
        }
      ]
    );

    assert.deepEqual(summary, {
      inserted: 1,
      updated: 1,
      unchanged: 1
    });
    assert.deepEqual(inserted, [
      {
        addressKey: 'inserted',
        addressText: 'Inserted Text',
        lat: 11,
        lng: 12,
        updatedAt: '2026-03-05T00:00:00.000Z'
      }
    ]);
    assert.deepEqual(patched, [
      {
        id: 'geo_existing_changed',
        row: {
          addressKey: 'changed',
          addressText: 'New Text',
          lat: 9,
          lng: 10,
          updatedAt: '2026-03-05T00:00:00.000Z'
        }
      }
    ]);
  });
});
