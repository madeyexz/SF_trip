import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isPlaceholderEmail, normalizeEmailAddress, validateMagicLinkEmail } from './auth-email.ts';

describe('auth email helpers', () => {
  it('normalizes email input before validation', () => {
    assert.equal(normalizeEmailAddress('  USER@Example.COM '), 'user@example.com');
  });

  it('rejects incomplete email addresses', () => {
    const result = validateMagicLinkEmail('pinchen147@gm');
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Enter a complete email address.');
  });

  it('rejects reserved placeholder example domains', () => {
    assert.equal(isPlaceholderEmail('test@example.com'), true);
    assert.equal(isPlaceholderEmail('hello@example.org'), true);
    assert.equal(isPlaceholderEmail('name@foo.example'), true);
  });

  it('allows normal email addresses', () => {
    const result = validateMagicLinkEmail('person@gmail.com');
    assert.equal(result.ok, true);
    assert.equal(result.email, 'person@gmail.com');
  });
});
