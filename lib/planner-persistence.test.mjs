import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as domain from './planner-domain.ts';
import * as sharedHelpers from './helpers.ts';

// Exercise the real session implementation without requiring a browser renderer.
const source = await readFile(new URL('../components/providers/trip/planner-persistence.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const helpers = {};
const helpersSource = await readFile(new URL('./planner-helpers.ts', import.meta.url), 'utf8');
new Function('require', 'exports', ts.transpileModule(helpersSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => {
  if (name === './helpers') return sharedHelpers;
  if (name === './planner-domain.ts') return domain;
  throw new Error(`Unexpected helpers import: ${name}`);
}, helpers);
const exports = {};
new Function('require', 'exports', outputText)(name => {
  if (name === 'react') return {};
  if (name === '@/lib/helpers') return {};
  if (name === '@/lib/planner-domain.ts') return domain;
  if (name === '@/lib/planner-helpers') return helpers;
  throw new Error(`Unexpected import: ${name}`);
}, exports);
const { createPlannerPersistenceSession } = exports;
const plan = title => ({ '2026-10-01': [{
  id: 'stop', kind: 'place', sourceKey: 'place:stop', title,
  locationText: '', link: '', tag: 'cafes', startMinutes: 600, endMinutes: 660
}] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(overrides = {}) {
  const states = [], loads = [], writes = [];
  const session = createPlannerPersistenceSession({
    load: async () => ({ plannerByDate: plan('Existing'), userId: 'user-1' }),
    save: async planner => { writes.push(planner); },
    onLoad: (planner, userId) => loads.push({ planner, userId }),
    onState: state => states.push(state),
    ...overrides
  });
  return { session, states, loads, writes };
}

describe('planner persistence behavior', () => {
  it('fails closed on a transient GET error and retries without writing an empty plan', async () => {
    let attempts = 0;
    const { session, states, loads, writes } = setup({ load: async () => {
      if (++attempts === 1) throw new Error('Temporary outage');
      return { plannerByDate: plan('Existing'), userId: 'user-1' };
    } });
    await session.hydrate();
    session.edit({}); session.flush();
    await tick();
    assert.equal(writes.length, 0);
    assert.equal(loads.length, 0, 'load failure must preserve current planner state');
    assert.equal(states.at(-1).plannerReady, false);
    assert.match(states.at(-1).plannerPersistenceError, /Saving is paused/);
    session.retry(); await tick();
    assert.equal(states.at(-1).plannerReady, true);
    session.edit(loads.at(-1).planner); session.flush(); await tick();
    assert.equal(writes.length, 0, 'hydration itself must not trigger a write');
    session.edit(plan('Changed')); session.flush(); await tick();
    assert.equal(writes.length, 1);
    assert.equal(states.at(-1).plannerPersistenceStatus, 'saved');
  });

  it('does not accept a malformed GET payload as a hydrated empty plan', async () => {
    const { session, states, writes } = setup({ load: async () => ({ error: 'broken' }) });
    await session.hydrate(); session.edit({}); session.flush(); await tick();
    assert.equal(writes.length, 0);
    assert.equal(states.at(-1).plannerReady, false);
    assert.equal(states.at(-1).plannerPersistenceStatus, 'error');
  });

  it('serializes concurrent edits and coalesces pending saves to the newest plan', async () => {
    const first = deferred();
    const writes = [];
    const { session, states } = setup({ save: async planner => {
      writes.push(planner);
      if (writes.length === 1) await first.promise;
    } });
    await session.hydrate();
    session.edit(plan('First')); session.flush();
    session.edit(plan('Intermediate')); session.flush();
    session.edit(plan('Newest')); session.flush();
    assert.equal(writes.length, 1, 'writes must never overlap');
    first.resolve(); await tick();
    assert.deepEqual(writes.map(p => p['2026-10-01'][0].title), ['First', 'Newest']);
    assert.equal(states.at(-1).plannerPersistenceStatus, 'saved');
  });

  it('keeps failed edits unsaved and retries the newest state, not an old snapshot', async () => {
    const first = deferred();
    const writes = [];
    const { session, states } = setup({ save: async planner => {
      writes.push(planner);
      if (writes.length === 1) await first.promise;
    } });
    await session.hydrate();
    session.edit(plan('First')); session.flush();
    session.edit(plan('Newest')); session.flush();
    first.reject(new Error('Offline')); await tick();
    assert.equal(states.at(-1).plannerPersistenceStatus, 'error');
    assert.match(states.at(-1).plannerPersistenceError, /not saved/);
    assert.equal(writes.length, 1, 'failed writes require an explicit retry');
    session.retry(); await tick();
    assert.equal(writes.at(-1)['2026-10-01'][0].title, 'Newest');
    assert.equal(states.at(-1).plannerPersistenceStatus, 'saved');
  });

  it('ignores stale hydration responses after disposal and aborts the request', async () => {
    const request = deferred();
    let signal;
    const { session, loads, states } = setup({ load: incoming => { signal = incoming; return request.promise; } });
    const hydration = session.hydrate();
    session.dispose();
    request.resolve({ plannerByDate: plan('Old user'), userId: 'old-user' });
    await hydration;
    assert.equal(signal.aborted, true);
    assert.equal(loads.length, 0);
    assert.equal(states.length, 1);
  });

  it('starts no queued writes and applies no status updates after disposal', async () => {
    const request = deferred();
    const writes = [];
    const { session, states } = setup({ save: async (planner, signal) => {
      writes.push({ planner, signal });
      await request.promise;
    } });
    await session.hydrate();
    session.edit(plan('First')); session.flush();
    session.edit(plan('Second')); session.flush();
    session.dispose();
    const stateCount = states.length;
    request.resolve(); await tick();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].signal.aborted, true);
    assert.equal(states.length, stateCount);
  });

  it('allows an intentional empty plan after successful hydration', async () => {
    const { session, writes } = setup();
    await session.hydrate(); session.edit({}); session.flush(); await tick();
    assert.deepEqual(writes, [{}]);
  });
});
