import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPersonalSync } from './personal-sync.ts';

describe('authenticated personal sync coalescing', () => {
  it('shares work only within one validated user', async () => {
    const inFlight = new Map();
    const runs = [];
    let release;
    const ready = new Promise((resolve) => { release = resolve; });
    const sync = (id) => async () => { runs.push(id); await ready; return { privateOwner: id }; };
    const alice = runPersonalSync(inFlight, { userId: 'alice' }, sync('alice'));
    const aliceAgain = runPersonalSync(inFlight, { userId: 'alice' }, sync('should-not-run'));
    const bob = runPersonalSync(inFlight, { userId: 'bob' }, sync('bob'));
    assert.equal(alice, aliceAgain);
    assert.notEqual(alice, bob);
    release();
    assert.deepEqual(await Promise.all([alice, aliceAgain, bob]), [
      { privateOwner: 'alice' }, { privateOwner: 'alice' }, { privateOwner: 'bob' }
    ]);
    assert.deepEqual(runs, ['alice', 'bob']);
    assert.equal(inFlight.size, 0);
  });

  it('rejects missing or invalid identity before executing or creating a coalescing entry', () => {
    const inFlight = new Map();
    for (const profile of [null, {}, { userId: '' }, { userId: ' ' }, { userId: 5 }]) {
      assert.throws(() => runPersonalSync(inFlight, profile, () => assert.fail('must not run')), /identity/);
    }
    assert.equal(inFlight.size, 0);
  });

  it('allows an account to retry after its failure without disrupting another account', async () => {
    const inFlight = new Map();
    await assert.rejects(runPersonalSync(inFlight, { userId: 'alice' }, async () => {
      throw new Error('source failed');
    }), /source failed/);
    assert.deepEqual(await runPersonalSync(inFlight, { userId: 'alice' }, async () => ['alice']), ['alice']);
  });
});
