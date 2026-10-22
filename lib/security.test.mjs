import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { brotliCompressSync } from 'node:zlib';

import {
  getSafeExternalHref,
  validateIngestionSourceUrl,
  consumeRateLimit,
  getRequestRateLimitIp
} from './security.ts';
import { untrustedSources, validateIngestionSourceUrlForFetch } from './security-server.ts';

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

describe('request rate-limit IP extraction', () => {
  it('ignores spoofable forwarded headers by default', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '198.51.100.1',
        'x-real-ip': '203.0.113.7'
      }
    });

    const ip = getRequestRateLimitIp(request);
    assert.equal(ip, 'unknown');
  });

  it('prefers trusted edge headers when present', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-vercel-ip': '198.51.100.44',
        'x-forwarded-for': '198.51.100.1'
      }
    });

    const ip = getRequestRateLimitIp(request);
    assert.equal(ip, '198.51.100.44');
  });

  it('uses forwarded headers only when explicitly trusted', () => {
    const previous = process.env.TRUST_PROXY_IP_HEADERS;
    process.env.TRUST_PROXY_IP_HEADERS = 'true';

    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '198.51.100.9, 10.0.0.2',
        'x-real-ip': '203.0.113.7'
      }
    });

    try {
      const ip = getRequestRateLimitIp(request);
      assert.equal(ip, '198.51.100.9');
    } finally {
      if (previous === undefined) {
        delete process.env.TRUST_PROXY_IP_HEADERS;
      } else {
        process.env.TRUST_PROXY_IP_HEADERS = previous;
      }
    }
  });
});

describe('untrusted source fetch', () => {
  it('never decodes compressed bodies and rejects redirects', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Meetup\r\nDTSTART:20261101T190000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    const seenEncodings = [];
    const server = http.createServer((request, response) => {
      seenEncodings.push(request.headers['accept-encoding']);
      if (request.url === '/br') {
        response.writeHead(200, { 'Content-Encoding': 'br' });
        response.end(brotliCompressSync('<rss></rss>'));
      } else if (request.url === '/redirect') {
        response.writeHead(302, { Location: '/plain' });
        response.end();
      } else if (request.url === '/missing') {
        response.writeHead(404);
        response.end('nope');
      } else {
        response.writeHead(200, { 'Content-Type': 'text/calendar' });
        response.end(ics);
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
      await assert.rejects(untrustedSources.fetch(`${base}/br`), /Content-Encoding "br"/);
      await assert.rejects(untrustedSources.fetchIcal(`${base}/br`), /Content-Encoding "br"/);
      await assert.rejects(untrustedSources.fetch(`${base}/redirect`), /redirects are not allowed/);

      const missing = await untrustedSources.fetch(`${base}/missing`);
      assert.equal(missing.ok, false);
      assert.equal(missing.status, 404);

      const plain = await untrustedSources.fetch(`${base}/plain`);
      assert.equal(plain.ok, true);
      assert.equal(await plain.text(), ics);

      const parsed = await untrustedSources.fetchIcal(`${base}/plain`);
      assert.equal(parsed.vcalendar.version, '2.0');
      assert.equal(parsed.a.summary, 'Meetup');
      assert.ok(seenEncodings.every((value) => value === 'identity'));
    } finally {
      server.close();
    }
  });
});
