import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const ADMIN_SESSION_COOKIE_NAME = 'sf_trip_admin_session';
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function cleanText(value) {
  return String(value || '').trim();
}

function getAdminPassword() {
  return cleanText(process.env.APP_ADMIN_PASSWORD);
}

function getSessionSecret() {
  const explicitSecret = cleanText(process.env.APP_SESSION_SECRET);
  if (explicitSecret) {
    return explicitSecret;
  }

  return getAdminPassword();
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest();
}

function safeStringEquals(left, right) {
  const leftHash = sha256Buffer(cleanText(left));
  const rightHash = sha256Buffer(cleanText(right));
  return timingSafeEqual(leftHash, rightHash);
}

function signSessionExpiry(expiresAtMs) {
  const secret = getSessionSecret();
  if (!secret) {
    return '';
  }

  return createHmac('sha256', secret)
    .update(String(expiresAtMs))
    .digest('hex');
}

function parseSessionToken(token) {
  const text = cleanText(token);
  if (!text) {
    return null;
  }

  const [expiresRaw, signature] = text.split('.');
  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0 || !signature) {
    return null;
  }

  return {
    expiresAtMs,
    signature: cleanText(signature)
  };
}

export function isAdminPasswordConfigured() {
  return Boolean(getAdminPassword() && getSessionSecret());
}

export function verifyAdminPassword(inputPassword) {
  if (!isAdminPasswordConfigured()) {
    return false;
  }

  return safeStringEquals(inputPassword, getAdminPassword());
}

export function createAdminSessionToken() {
  const expiresAtMs = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const signature = signSessionExpiry(expiresAtMs);
  return `${expiresAtMs}.${signature}`;
}

export function isValidAdminSessionToken(token) {
  if (!isAdminPasswordConfigured()) {
    return false;
  }

  const parsed = parseSessionToken(token);
  if (!parsed) {
    return false;
  }

  if (parsed.expiresAtMs <= Date.now()) {
    return false;
  }

  const expectedSignature = signSessionExpiry(parsed.expiresAtMs);
  return safeStringEquals(parsed.signature, expectedSignature);
}

export function isAdminAuthenticatedRequest(request) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value || '';
  return isValidAdminSessionToken(token);
}

export function requireAdminSession(request) {
  if (!isAdminPasswordConfigured()) {
    return Response.json(
      {
        error: 'APP_ADMIN_PASSWORD is not configured on server.',
        needsAuth: true
      },
      { status: 503 }
    );
  }

  if (isAdminAuthenticatedRequest(request)) {
    return null;
  }

  return Response.json(
    {
      error: 'Admin password required.',
      needsAuth: true
    },
    { status: 401 }
  );
}

export function buildAdminSessionCookie(token) {
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}`
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearedAdminSessionCookie() {
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}
