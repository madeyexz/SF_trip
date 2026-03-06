import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatTravelDurationLabel,
  normalizeTravelTimeMatrixEntries
} from './travel-times.ts';

describe('travel time helpers', () => {
  it('formats route-matrix durations into compact UI labels', () => {
    assert.equal(formatTravelDurationLabel('59s'), '1 min');
    assert.equal(formatTravelDurationLabel('600s'), '10 min');
    assert.equal(formatTravelDurationLabel('3660s'), '1 hr 1 min');
    assert.equal(formatTravelDurationLabel('7200s'), '2 hr');
    assert.equal(formatTravelDurationLabel(''), 'Unavailable');
  });

  it('maps computeRouteMatrix entries back to destination ids', () => {
    const results = normalizeTravelTimeMatrixEntries({
      destinations: [
        { id: 'evt-1' },
        { id: 'evt-2' },
        { id: 'evt-3' }
      ],
      entries: [
        { destinationIndex: 0, condition: 'ROUTE_EXISTS', duration: '540s' },
        { destinationIndex: 1, condition: 'ROUTE_EXISTS', duration: '3660s' },
        { destinationIndex: 2, condition: 'ROUTE_NOT_FOUND' }
      ]
    });

    assert.deepEqual(results, {
      'evt-1': '9 min',
      'evt-2': '1 hr 1 min',
      'evt-3': 'Unavailable'
    });
  });
});
