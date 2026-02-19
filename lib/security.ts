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

function isPrivateIpv4(hostname: string) {
  const octets = parseIpv4(hostname);
  if (!octets) {
    return false;
  }

  const [a, b] = octets;
  if (a === 10) {
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
  return false;
}

function isPrivateIpv6(hostname: string) {
  const value = hostname.toLowerCase();
  if (value === '::1') {
    return true;
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
  const value = hostname.toLowerCase();
  return (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    value.endsWith('.internal')
  );
}

function isPrivateHost(hostname: string) {
  if (!hostname) {
    return true;
  }
  return isLocalHostname(hostname) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname);
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

