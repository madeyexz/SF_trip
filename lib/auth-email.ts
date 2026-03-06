const EMAIL_ADDRESS_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const PLACEHOLDER_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'localhost'
]);

const PLACEHOLDER_EMAILS = new Set([
  'you@example.com',
  'name@example.com',
  'email@example.com',
  'test@example.com',
  'hello@example.com',
  'hi@example.com',
  'user@example.com',
  'demo@example.com',
  'sample@example.com',
  'placeholder@example.com'
]);

export function normalizeEmailAddress(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isPlaceholderEmail(value: unknown) {
  const email = normalizeEmailAddress(value);
  if (!email) {
    return false;
  }

  if (PLACEHOLDER_EMAILS.has(email)) {
    return true;
  }

  const [, domain = ''] = email.split('@');
  if (!domain) {
    return false;
  }

  return PLACEHOLDER_DOMAINS.has(domain) || domain.endsWith('.example');
}

export function validateMagicLinkEmail(value: unknown) {
  const email = normalizeEmailAddress(value);

  if (!email) {
    return {
      ok: false,
      email,
      error: 'Please enter your email address.'
    };
  }

  if (email.length > 320) {
    return {
      ok: false,
      email,
      error: 'Email address is too long.'
    };
  }

  if (!EMAIL_ADDRESS_REGEX.test(email)) {
    return {
      ok: false,
      email,
      error: 'Enter a complete email address.'
    };
  }

  if (isPlaceholderEmail(email)) {
    return {
      ok: false,
      email,
      error: 'Enter a real email address.'
    };
  }

  return {
    ok: true,
    email,
    error: ''
  };
}
