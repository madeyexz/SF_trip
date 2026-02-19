import { lookup } from 'node:dns/promises';
import { isPrivateHost, validateIngestionSourceUrl } from './security.ts';

type IngestionLookupDeps = {
  lookupHost?: (hostname: string) => Promise<string[]>;
};

async function lookupHostAddresses(hostname: string) {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => row.address);
}

export async function validateIngestionSourceUrlForFetch(value: unknown, deps: IngestionLookupDeps = {}) {
  const baseValidation = validateIngestionSourceUrl(value);
  if (!baseValidation.ok) {
    return baseValidation;
  }

  try {
    const parsed = new URL(baseValidation.url);
    const lookupHost = deps.lookupHost || lookupHostAddresses;
    const addresses = await lookupHost(parsed.hostname);
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return {
        ok: false,
        url: '',
        error: 'Source URL hostname could not be resolved.'
      };
    }

    const hasPrivateResolution = addresses.some((address) => isPrivateHost(address));
    if (hasPrivateResolution) {
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
