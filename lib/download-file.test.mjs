import { it } from 'node:test';
import assert from 'node:assert/strict';
import { downloadTextFile } from './download-file.ts';

it('keeps exported content available until delayed download cleanup', async () => {
  const calls = [];
  let blob;
  let cleanup;
  const anchor = {
    click: () => calls.push('click'),
    remove: () => calls.push('remove')
  };
  downloadTextFile('BEGIN:VCALENDAR\r\nEND:VCALENDAR', 'trip.ics', 'text/calendar;charset=utf-8', {
    document: { createElement: () => anchor, body: { appendChild: () => calls.push('append') } },
    URL: {
      createObjectURL: (value) => { blob = value; return 'blob:export'; },
      revokeObjectURL: (url) => calls.push(`revoke:${url}`)
    },
    setTimeout: (callback, delay) => { cleanup = callback; assert.equal(delay, 60_000); }
  });
  assert.equal(anchor.download, 'trip.ics');
  assert.equal(anchor.href, 'blob:export');
  assert.equal(await blob.text(), 'BEGIN:VCALENDAR\r\nEND:VCALENDAR');
  assert.deepEqual(calls, ['append', 'click', 'remove']);
  cleanup();
  assert.equal(calls.at(-1), 'revoke:blob:export');
});
