import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapAsyncInParallel, mapAsyncWithConcurrency } from './async-map.ts';

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe('async parallel mapping', () => {
  it('preserves input order even when tasks resolve out of order', async () => {
    const result = await mapAsyncInParallel([1, 2, 3], async (value) => {
      await sleep((4 - value) * 5);
      return value * 10;
    });

    assert.deepEqual(result, [10, 20, 30]);
  });

  it('starts all tasks eagerly instead of serially awaiting each one', async () => {
    let started = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    const pending = mapAsyncInParallel(['a', 'b', 'c'], async (value) => {
      started += 1;
      await gate;
      return value.toUpperCase();
    });

    assert.equal(started, 3);
    release();

    const result = await pending;
    assert.deepEqual(result, ['A', 'B', 'C']);
  });

  it('limits concurrent work when a concurrency cap is provided', async () => {
    let active = 0;
    let peak = 0;

    const result = await mapAsyncWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(5);
      active -= 1;
      return value * 2;
    });

    assert.deepEqual(result, [2, 4, 6, 8, 10]);
    assert.equal(peak, 2);
  });
});
