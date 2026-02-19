const RATE_LIMIT_STATE = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_LIMIT_KEYS = 10_000;

function normalizeHostname(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

function parseIpv4(hostname: string) {
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }

  return octets;
}

function parseMappedIpv4FromIpv6(hostname: string) {
  const value = normalizeHostname(hostname);
  const parts = value.split(':');
  const mappedIndex = parts.lastIndexOf('ffff');
  if (mappedIndex === -1 || mappedIndex === parts.length - 1) {
    return null;
  }

  const tail = parts.slice(mappedIndex + 1).join(':');
  if (tail.includes('.')) {
    return parseIpv4(tail);
  }

  const hexGroups = tail.split(':').filter(Boolean);
  if (hexGroups.length !== 2) {
    return null;
  }

  if (hexGroups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
    return null;
  }

  const high = Number.parseInt(hexGroups[0], 16);
  const low = Number.parseInt(hexGroups[1], 16);
  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255];
}

function isPrivateIpv4(octetsInput: number[] | null) {
  const octets = octetsInput;
  if (!octets) {
    return false;
  }

  const [a, b] = octets;
  if (a === 0) {
    return true;
  }
  if (a === 10) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function isPrivateIpv6(hostname: string) {
  const value = normalizeHostname(hostname);
  if (value === '::' || value === '::1') {
    return true;
  }
  const mappedIpv4 = parseMappedIpv4FromIpv6(value);
  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4);
  }
  if (value.startsWith('fc') || value.startsWith('fd')) {
    return true; // unique local addresses
  }
  if (value.startsWith('fe80:')) {
    return true; // link-local
  }
  return false;
}

function isLocalHostname(hostname: string) {
  const value = normalizeHostname(hostname);
  return (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    value.endsWith('.internal')
  );
}

export function isPrivateHost(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return true;
  }
  return (
    isLocalHostname(normalized) ||
    isPrivateIpv4(parseIpv4(normalized)) ||
    isPrivateIpv6(normalized)
  );
}

export function getSafeExternalHref(value: unknown) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function validateIngestionSourceUrl(value: unknown) {
  const text = String(value || '').trim();
  if (!text) {
    return {
      ok: false,
      url: '',
      error: 'Source URL is required.'
    };
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        ok: false,
        url: '',
        error: 'Source URL must use http(s).'
      };
    }

    if (isPrivateHost(parsed.hostname)) {
      return {
        ok: false,
        url: '',
        error: 'Source URL must target the public internet.'
      };
    }

    return {
      ok: true,
      url: parsed.toString(),
      error: ''
    };
  } catch {
    return {
      ok: false,
      url: '',
      error: 'Invalid source URL.'
    };
  }
}

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
};

export function consumeRateLimit({ key, limit, windowMs, nowMs = Date.now() }: RateLimitInput) {
  const normalizedKey = String(key || '');
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindowMs = Math.max(1, Math.floor(windowMs));

  if (!normalizedKey) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(safeWindowMs / 1000)
    };
  }

  if (RATE_LIMIT_STATE.size > MAX_RATE_LIMIT_KEYS) {
    for (const [candidateKey, value] of RATE_LIMIT_STATE.entries()) {
      if (value.resetAt <= nowMs) {
        RATE_LIMIT_STATE.delete(candidateKey);
      }
      if (RATE_LIMIT_STATE.size <= MAX_RATE_LIMIT_KEYS) {
        break;
      }
    }
  }

  const existing = RATE_LIMIT_STATE.get(normalizedKey);
  if (!existing || existing.resetAt <= nowMs) {
    RATE_LIMIT_STATE.set(normalizedKey, {
      count: 1,
      resetAt: nowMs + safeWindowMs
    });
    return {
      ok: true,
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= safeLimit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000))
    };
  }

  existing.count += 1;
  RATE_LIMIT_STATE.set(normalizedKey, existing);
  return {
    ok: true,
    retryAfterSeconds: 0
  };
}

export function getRequestRateLimitIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const realIp = request.headers.get('x-real-ip') || '';
  const candidate = forwardedFor.split(',')[0]?.trim() || realIp.trim();
  return candidate || 'unknown';
}
