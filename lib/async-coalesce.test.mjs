import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getOrCreateCoalescedPromise } from './async-coalesce.ts';

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describe('async coalescing', () => {
  it('shares a single in-flight promise for the same key', async () => {
    const inFlight = new Map();
    let runCount = 0;

    const [first, second] = await Promise.all([
      getOrCreateCoalescedPromise(inFlight, 'same-key', async () => {
        runCount += 1;
        await sleep(10);
        return 'shared-value';
      }),
      getOrCreateCoalescedPromise(inFlight, 'same-key', async () => {
        runCount += 1;
        return 'unexpected';
      })
    ]);

    assert.equal(first, 'shared-value');
    assert.equal(second, 'shared-value');
    assert.equal(runCount, 1);
    assert.equal(inFlight.size, 0);
  });

  it('runs different keys independently', async () => {
    const inFlight = new Map();
    const seen = [];

    const results = await Promise.all([
      getOrCreateCoalescedPromise(inFlight, 'left', async () => {
        seen.push('left');
        await sleep(5);
        return 'left-result';
      }),
      getOrCreateCoalescedPromise(inFlight, 'right', async () => {
        seen.push('right');
        await sleep(5);
        return 'right-result';
      })
    ]);

    assert.deepEqual(results, ['left-result', 'right-result']);
    assert.deepEqual(seen.sort(), ['left', 'right']);
    assert.equal(inFlight.size, 0);
  });

  it('cleans up rejected promises so later retries can run', async () => {
    const inFlight = new Map();
    let runCount = 0;

    await assert.rejects(
      getOrCreateCoalescedPromise(inFlight, 'retry-key', async () => {
        runCount += 1;
        throw new Error('first failure');
      }),
      /first failure/
    );

    const retryResult = await getOrCreateCoalescedPromise(inFlight, 'retry-key', async () => {
      runCount += 1;
      return 'retry-success';
    });

    assert.equal(retryResult, 'retry-success');
    assert.equal(runCount, 2);
    assert.equal(inFlight.size, 0);
  });
});
