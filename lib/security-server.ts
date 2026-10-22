import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ical from 'node-ical';
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

const UNTRUSTED_FETCH_TIMEOUT_MS = 15000;

// Fetches a user-supplied source URL without HTTP content decoding. Global fetch() always
// decodes gzip/deflate/br/zstd responses, which exposes the Node.js decompressors (for example
// the Brotli RCE CVE-2026-111497) to any host a signed-in user registers as a source.
function fetchUntrustedSource(url: string) {
  return new Promise<{ ok: boolean; status: number; text: () => Promise<string> }>((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : parsed.protocol === 'http:' ? http : null;
    if (!client) {
      reject(new Error('Source URL must use http or https.'));
      return;
    }

    const request = client.get(parsed, {
      headers: { 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(UNTRUSTED_FETCH_TIMEOUT_MS)
    }, (response) => {
      const status = response.statusCode || 0;
      const encoding = String(response.headers['content-encoding'] || 'identity').trim().toLowerCase();
      if (encoding !== 'identity') {
        response.destroy();
        reject(new Error(`Source responded with unsupported Content-Encoding "${encoding}".`));
        return;
      }
      if (status >= 300 && status < 400) {
        response.destroy();
        reject(new Error('Source URL redirects are not allowed.'));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ ok: status >= 200 && status < 300, status, text: async () => body });
      });
    });
    request.on('error', reject);
  });
}

async function fetchUntrustedIcal(url: string) {
  const response = await fetchUntrustedSource(url);
  if (!response.ok) {
    throw new Error(`iCal fetch failed (${response.status}).`);
  }
  return ical.async.parseICS(await response.text());
}

// Object so tests can route these calls to their fetch/iCal stubs.
export const untrustedSources = {
  fetch: fetchUntrustedSource,
  fetchIcal: fetchUntrustedIcal
};
