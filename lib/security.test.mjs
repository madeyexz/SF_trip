import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSafeExternalHref,
  validateIngestionSourceUrl
} from './security.ts';

describe('security url helpers', () => {
  it('allows only http(s) external hrefs', () => {
    assert.equal(getSafeExternalHref('https://example.com/event'), 'https://example.com/event');
    assert.equal(getSafeExternalHref('http://example.com/path?q=1'), 'http://example.com/path?q=1');
    assert.equal(getSafeExternalHref('javascript:alert(1)'), '');
    assert.equal(getSafeExternalHref('data:text/html,<svg>'), '');
    assert.equal(getSafeExternalHref(''), '');
  });

  it('rejects ingestion URLs that target local or private networks', () => {
    const localhost = validateIngestionSourceUrl('https://localhost/feed.ics');
    const loopback = validateIngestionSourceUrl('https://127.0.0.1/feed.ics');
    const privateA = validateIngestionSourceUrl('https://10.0.0.42/feed.ics');
    const privateB = validateIngestionSourceUrl('https://192.168.1.42/feed.ics');
    const privateC = validateIngestionSourceUrl('https://172.16.2.3/feed.ics');

    assert.equal(localhost.ok, false);
    assert.equal(loopback.ok, false);
    assert.equal(privateA.ok, false);
    assert.equal(privateB.ok, false);
    assert.equal(privateC.ok, false);
  });

  it('accepts normal public ingestion URLs', () => {
    const result = validateIngestionSourceUrl('https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB');
    assert.equal(result.ok, true);
    assert.equal(result.url.startsWith('https://api2.luma.com/ics/get'), true);
  });
});
