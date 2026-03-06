import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('events module boundaries', () => {
  it('keeps lib/events.ts as a thin facade over feature modules', async () => {
    const eventsPath = path.join(process.cwd(), 'lib', 'events.ts');
    const source = await readFile(eventsPath, 'utf-8');

    assert.match(source, /from '\.\/events\/config\.ts'/);
    assert.match(source, /from '\.\/events\/payload\.ts'/);
    assert.match(source, /from '\.\/events\/sources\.ts'/);
    assert.match(source, /from '\.\/events\/sync\.ts'/);
    assert.equal(source.includes('ical.async.fromURL'), false);
    assert.equal(source.includes('async function syncEventsFromSources'), false);
    assert.equal(source.includes('async function extractEventsFromNewsletterPost'), false);
  });
});
