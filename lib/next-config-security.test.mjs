import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import nextConfig, { createSecurityHeaders } from '../next.config.mjs';

describe('next security headers', () => {
  it('defines baseline security headers for all routes', async () => {
    assert.equal(typeof nextConfig.headers, 'function');
    const rules = await nextConfig.headers();
    assert.equal(Array.isArray(rules), true);
    const allRouteRule = rules.find((rule) => rule?.source === '/:path*');
    assert.ok(allRouteRule, 'expected a global header rule for /:path*');

    const headerKeys = new Set((allRouteRule.headers || []).map((h) => String(h.key)));
    assert.equal(headerKeys.has('Content-Security-Policy'), true);
    assert.equal(headerKeys.has('X-Frame-Options'), true);
    assert.equal(headerKeys.has('X-Content-Type-Options'), true);
    assert.equal(headerKeys.has('Referrer-Policy'), true);
    assert.equal(headerKeys.has('Permissions-Policy'), true);

    const csp = String(
      (allRouteRule.headers || []).find((h) => h?.key === 'Content-Security-Policy')?.value || ''
    );
    assert.equal(csp.includes('script-src'), true);
    const scriptSrcDirective = csp
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('script-src')) || '';
    assert.equal(scriptSrcDirective.includes("'unsafe-inline'"), true);
    assert.equal(csp.includes('https://cdnjs.buymeacoffee.com'), true);
    assert.equal(scriptSrcDirective.includes("'unsafe-eval'"), false);
  });

  it('enables unsafe-eval only for development CSP', () => {
    const devHeaders = createSecurityHeaders({ isDevelopment: true });
    const devCsp = String(
      (devHeaders || []).find((h) => h?.key === 'Content-Security-Policy')?.value || ''
    );
    const devScriptSrcDirective = devCsp
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('script-src')) || '';

    assert.equal(devScriptSrcDirective.includes("'unsafe-eval'"), true);
  });
});
