import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCrimeQuery, loadCrimeData, toSanFranciscoTimestamp } from './crime-data.ts';

const options = {
  hours: 1, limit: 200, bounds: null,
  now: Date.parse('2026-10-01T08:00:00Z')
};

describe('crime data loading', () => {
  it('uses SF floating timestamps in both standard and daylight time', () => {
    assert.equal(toSanFranciscoTimestamp(Date.parse('2026-10-01T08:00:00Z')), '2026-10-01T01:00:00');
    assert.equal(toSanFranciscoTimestamp(Date.parse('2026-01-01T08:00:00Z')), '2026-01-01T00:00:00');
    assert.match(buildCrimeQuery(options).url.searchParams.get('$where'), /incident_datetime >= '2026-10-01T00:00:00'/);
  });

  it('retains recent SF incidents that the old UTC comparison incorrectly dropped', async () => {
    const result = await loadCrimeData({
      ...options,
      fetchImpl: async () => Response.json([
        { latitude: '37.77', longitude: '-122.42', incident_datetime: '2026-10-01T00:30:00.000' },
        { latitude: '37.77', longitude: '-122.42', incident_datetime: '2026-09-30T23:59:59.000' },
        { latitude: null, longitude: '-122.42', incident_datetime: '2026-10-01T00:30:00.000' }
      ])
    });
    assert.equal(result.ok, true);
    assert.equal(result.incidents.length, 1);
  });

  it('reports upstream denial as unavailable instead of empty incident data', async () => {
    const result = await loadCrimeData({ ...options, fetchImpl: async () => new Response('blocked', { status: 403 }) });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.error, /upstream 403/);
    assert.equal('incidents' in result, false);
  });

  it('bounds upstream requests and handles timeout without leaking raw errors', async () => {
    const result = await loadCrimeData({
      ...options,
      fetchImpl: async (_url, init) => {
        assert.ok(init.signal instanceof AbortSignal);
        throw new DOMException('internal request detail', 'TimeoutError');
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 504);
    assert.doesNotMatch(result.error, /internal request detail/);
  });

  it('handles malformed responses and network failures as unavailable', async () => {
    for (const fetchImpl of [
      async () => Response.json({ error: 'not an incident array' }),
      async () => { throw new Error('network detail'); }
    ]) {
      const result = await loadCrimeData({ ...options, fetchImpl });
      assert.equal(result.ok, false);
      assert.equal(result.status, 502);
    }
  });
});
