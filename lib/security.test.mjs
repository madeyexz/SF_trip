import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSafeExternalHref,
  validateIngestionSourceUrl,
  consumeRateLimit
} from './security.ts';
import { validateIngestionSourceUrlForFetch } from './security-server.ts';

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

  it('rejects additional non-public ingress targets', () => {
    const mappedLoopbackA = validateIngestionSourceUrl('https://[::ffff:127.0.0.1]/feed.ics');
    const mappedLoopbackB = validateIngestionSourceUrl('https://[::ffff:7f00:1]/feed.ics');
    const wildcardBind = validateIngestionSourceUrl('https://0.0.0.0/feed.ics');
    const cgnat = validateIngestionSourceUrl('https://100.64.0.42/feed.ics');

    assert.equal(mappedLoopbackA.ok, false);
    assert.equal(mappedLoopbackB.ok, false);
    assert.equal(wildcardBind.ok, false);
    assert.equal(cgnat.ok, false);
  });

  it('accepts normal public ingestion URLs', () => {
    const result = validateIngestionSourceUrl('https://api2.luma.com/ics/get?entity=calendar&id=cal-kC1rltFkxqfbHcB');
    assert.equal(result.ok, true);
    assert.equal(result.url.startsWith('https://api2.luma.com/ics/get'), true);
  });

  it('rejects hosts that resolve to private addresses during fetch-time validation', async () => {
    const result = await validateIngestionSourceUrlForFetch(
      'https://example.com/feed.ics',
      {
        lookupHost: async () => ['127.0.0.1']
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.error, /public internet/i);
  });
});

describe('security rate limiting', () => {
  it('blocks requests after the configured fixed-window limit', () => {
    const key = 'unit-test-limit';
    const first = consumeRateLimit({ key, limit: 2, windowMs: 1_000, nowMs: 100 });
    const second = consumeRateLimit({ key, limit: 2, windowMs: 1_000, nowMs: 200 });
    const third = consumeRateLimit({ key, limit: 2, windowMs: 1_000, nowMs: 300 });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, false);
    assert.equal(typeof third.retryAfterSeconds, 'number');
    assert.equal(third.retryAfterSeconds > 0, true);
  });
});
