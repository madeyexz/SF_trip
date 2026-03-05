import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapAsyncInParallel } from './async-map.ts';

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
});
