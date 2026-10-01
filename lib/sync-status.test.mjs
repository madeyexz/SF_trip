import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSyncStatus } from './sync-status.ts';

describe('sync result status', () => {
  it('reports successful full and single-source syncs without warnings', () => {
    assert.deepEqual(buildSyncStatus({ count: 12, noun: 'events', timeLabel: '1:00 PM' }), {
      message: 'Synced 12 events at 1:00 PM.', isError: false
    });
    assert.deepEqual(buildSyncStatus({ count: 0, noun: 'items', sourceLabel: 'My calendar', errors: [] }), {
      message: 'Synced 0 items from "My calendar".', isError: false
    });
  });

  it('shows the failing source, stage, reason and retry action for partial sync', () => {
    const status = buildSyncStatus({
      count: 3, noun: 'events',
      errors: [{ sourceUrl: 'https://calendar.example/feed?token=private', stage: 'ical', message: 'Calendar returned HTTP 403' }]
    });
    assert.equal(status.isError, true);
    assert.match(status.message, /^Partial sync: loaded 3 events/);
    assert.match(status.message, /calendar\.example \/ ical: Calendar returned HTTP 403/);
    assert.match(status.message, /Review Sources and retry/);
    assert.equal(status.message.includes('private'), false);
  });

  it('never labels a source result with errors as an unqualified success, including zero imported items', () => {
    const status = buildSyncStatus({
      count: 0, noun: 'items', sourceLabel: 'Calendar',
      errors: [{ message: 'Request timed out' }]
    });
    assert.equal(status.isError, true);
    assert.match(status.message, /^Partial sync: loaded 0 items from "Calendar"/);
    assert.match(status.message, /Request timed out/);
    assert.equal(status.message.includes('Synced 0'), false);
  });

  it('redacts private paths and query tokens embedded in upstream error messages', () => {
    const status = buildSyncStatus({
      count: 0, noun: 'events',
      errors: [{ message: 'Failed fetching https://calendar.example/private-secret.ics?token=secret-value' }]
    });
    assert.match(status.message, /https:\/\/calendar\.example/);
    assert.equal(status.message.includes('private-secret'), false);
    assert.equal(status.message.includes('secret-value'), false);
  });

  it('limits long diagnostics and summarizes additional errors while preserving useful details', () => {
    const status = buildSyncStatus({
      count: 5, noun: 'events',
      errors: [{ message: 'x'.repeat(5000) }, 'RSS fetch failed', null, { stage: 'ical' }]
    });
    assert.equal(status.isError, true);
    assert.match(status.message, /4 ingestion errors/);
    assert.match(status.message, /RSS fetch failed; 2 more/);
    assert.ok(status.message.length < 500);
  });

  it('wires both user-triggered sync paths to structured diagnostic status', async () => {
    const source = await readFile(new URL('../components/providers/TripProvider.tsx', import.meta.url), 'utf8');
    const full = source.slice(source.indexOf('  const handleSync ='), source.indexOf('  const handleDeviceLocation ='));
    const single = source.slice(source.indexOf('  const handleSyncSource ='), source.indexOf('  const handleExportPlannerIcs ='));
    assert.match(full, /buildSyncStatus\(/);
    assert.match(full, /errors: ingestionErrors/);
    assert.match(single, /buildSyncStatus\(/);
    assert.match(single, /errors: payload\.errors/);
    assert.match(single, /setStatusMessage\(syncStatus\.message, syncStatus\.isError\)/);
  });
});
