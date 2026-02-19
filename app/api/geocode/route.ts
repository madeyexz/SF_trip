import { resolveAddressCoordinates } from '@/lib/events';
import { runWithAuthenticatedClient } from '@/lib/api-guards';
import { consumeRateLimit, getRequestRateLimitIp } from '@/lib/security';

export const runtime = 'nodejs';

export async function POST(request) {
  return runWithAuthenticatedClient(async () => {
    const rateLimit = consumeRateLimit({
      key: `api:geocode:${getRequestRateLimitIp(request)}`,
      limit: 25,
      windowMs: 60_000
    });
    if (!rateLimit.ok) {
      return Response.json(
        {
          error: 'Too many geocode requests. Please retry shortly.'
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    let body = null;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          error: 'Invalid geocode request payload.'
        },
        { status: 400 }
      );
    }

    const address = String(body?.address || '').trim().slice(0, 300);
    if (!address) {
      return Response.json(
        {
          error: 'Address is required.'
        },
        { status: 400 }
      );
    }

    const coordinates = await resolveAddressCoordinates(address);
    if (!coordinates) {
      return Response.json(
        {
          error: 'Unable to geocode this address.'
        },
        { status: 404 }
      );
    }

    return Response.json(coordinates);
  });
}
