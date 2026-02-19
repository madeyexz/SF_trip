function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function parseOwnerEmailAllowlist(value: unknown) {
  const raw = String(value || '');
  return new Set(
    raw
      .split(',')
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean)
  );
}

export function resolveInitialUserRole(email: unknown, allowlist: Set<string>) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail && allowlist.has(normalizedEmail)) {
    return 'owner';
  }
  return 'member';
}
