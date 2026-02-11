import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAdminSessionCookie,
  buildClearedAdminSessionCookie,
  createAdminSessionToken,
  isAdminAuthenticatedRequest,
  isAdminPasswordConfigured,
  isValidAdminSessionToken,
  requireAdminSession,
  verifyAdminPassword
} from './admin-auth.js';

const ORIGINAL_ENV = {
  APP_ADMIN_PASSWORD: process.env.APP_ADMIN_PASSWORD,
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeRequestWithCookie(cookieValue = '') {
  return {
    cookies: {
      get(cookieName) {
        if (cookieName !== 'sf_trip_admin_session' || !cookieValue) {
          return undefined;
        }
        return { value: cookieValue };
      }
    }
  };
}

beforeEach(() => {
  delete process.env.APP_ADMIN_PASSWORD;
  delete process.env.APP_SESSION_SECRET;
});

afterEach(() => {
  restoreEnv();
});

describe('admin auth configuration', () => {
  it('returns not configured when APP_ADMIN_PASSWORD is missing', () => {
    assert.equal(isAdminPasswordConfigured(), false);
    assert.equal(verifyAdminPassword('anything'), false);
  });

  it('verifies password and session token when configured', () => {
    process.env.APP_ADMIN_PASSWORD = 'top-secret';
    process.env.APP_SESSION_SECRET = 'separate-secret';

    assert.equal(isAdminPasswordConfigured(), true);
    assert.equal(verifyAdminPassword('top-secret'), true);
    assert.equal(verifyAdminPassword('wrong-password'), false);

    const token = createAdminSessionToken();
    assert.equal(typeof token, 'string');
    assert.equal(token.includes('.'), true);
    assert.equal(isValidAdminSessionToken(token), true);
    assert.equal(isValidAdminSessionToken(`${token}-tampered`), false);
  });
});

describe('admin request guards', () => {
  it('returns 503 from requireAdminSession when password is not configured', async () => {
    const response = requireAdminSession(makeRequestWithCookie());
    assert.ok(response instanceof Response);
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.needsAuth, true);
  });

  it('authenticates request only with valid cookie token', async () => {
    process.env.APP_ADMIN_PASSWORD = 'top-secret';
    process.env.APP_SESSION_SECRET = 'separate-secret';

    const token = createAdminSessionToken();
    const validRequest = makeRequestWithCookie(token);
    const invalidRequest = makeRequestWithCookie('not-a-valid-token');

    assert.equal(isAdminAuthenticatedRequest(validRequest), true);
    assert.equal(isAdminAuthenticatedRequest(invalidRequest), false);
    assert.equal(isAdminAuthenticatedRequest(makeRequestWithCookie()), false);

    assert.equal(requireAdminSession(validRequest), null);

    const denied = requireAdminSession(invalidRequest);
    assert.ok(denied instanceof Response);
    assert.equal(denied.status, 401);
    const payload = await denied.json();
    assert.equal(payload.needsAuth, true);
  });
});

describe('admin session cookie format', () => {
  it('builds expected set-cookie header values', () => {
    const cookie = buildAdminSessionCookie('abc123.token');
    assert.equal(cookie.includes('sf_trip_admin_session='), true);
    assert.equal(cookie.includes('HttpOnly'), true);
    assert.equal(cookie.includes('SameSite=Lax'), true);
    assert.equal(cookie.includes('Max-Age='), true);

    const cleared = buildClearedAdminSessionCookie();
    assert.equal(cleared.includes('sf_trip_admin_session='), true);
    assert.equal(cleared.includes('Max-Age=0'), true);
  });
});
