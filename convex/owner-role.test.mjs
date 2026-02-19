import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseOwnerEmailAllowlist, resolveInitialUserRole } from './ownerRole.ts';

describe('owner bootstrap policy', () => {
  it('assigns member by default when no allowlist is configured', () => {
    const allowlist = parseOwnerEmailAllowlist('');
    const role = resolveInitialUserRole('anyone@example.com', allowlist);
    assert.equal(role, 'member');
  });

  it('assigns owner only to allowlisted emails', () => {
    const allowlist = parseOwnerEmailAllowlist(' owner@example.com,Admin@Example.com ');
    const ownerRole = resolveInitialUserRole('admin@example.com', allowlist);
    const memberRole = resolveInitialUserRole('other@example.com', allowlist);

    assert.equal(ownerRole, 'owner');
    assert.equal(memberRole, 'member');
  });
});
