import { runWithAuthenticatedClient } from '@/lib/api-guards';
import { consumeRateLimit, getRequestRateLimitIp } from '@/lib/security';
import { normalizeTravelTimeMatrixEntries } from '@/lib/travel-times';

export const runtime = 'nodejs';

const ROUTE_MATRIX_API_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const ROUTE_MATRIX_FIELD_MASK = [
  'originIndex',
  'destinationIndex',
  'duration',
  'condition',
  'status'
].join(',');
const MAX_DESTINATIONS = 25;

export async function POST(request: Request) {
  return runWithAuthenticatedClient(async () => {
    const rateLimit = consumeRateLimit({
      key: `api:travel-times:${getRequestRateLimitIp(request)}`,
      limit: 60,
      windowMs: 60_000
    });
    if (!rateLimit.ok) {
      return Response.json(
        {
          error: 'Too many travel time requests. Please retry shortly.'
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds)
          }
        }
      );
    }

    const apiKey =
      process.env.GOOGLE_MAPS_ROUTES_KEY ||
      process.env.GOOGLE_MAPS_SERVER_KEY ||
      process.env.GOOGLE_MAPS_BROWSER_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error:
            'Missing GOOGLE_MAPS_ROUTES_KEY in .env. Add a server key with Routes API enabled to calculate travel times.'
        },
        { status: 400 }
      );
    }

    let body = null;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          error: 'Invalid travel time request payload.'
        },
        { status: 400 }
      );
    }

    const origin = sanitizeLatLng(body?.origin);
    const destinations = Array.isArray(body?.destinations)
      ? body.destinations
        .map((destination: any) => ({
          id: String(destination?.id || ''),
          position: sanitizeLatLng(destination?.position)
        }))
        .filter((destination) => destination.id && destination.position)
        .slice(0, MAX_DESTINATIONS)
      : [];
    const travelMode = toRoutesApiTravelMode(body?.travelMode);

    if (!origin || destinations.length === 0) {
      return Response.json(
        {
          error: 'Travel time origin and at least one destination are required.'
        },
        { status: 400 }
      );
    }

    const routesRequestBody: any = {
      origins: [toRouteMatrixWaypoint(origin)],
      destinations: destinations.map((destination) => toRouteMatrixWaypoint(destination.position)),
      travelMode
    };

    if (travelMode === 'TRANSIT') {
      routesRequestBody.departureTime = new Date().toISOString();
    }

    const routesResponse = await fetch(ROUTE_MATRIX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': ROUTE_MATRIX_FIELD_MASK
      },
      body: JSON.stringify(routesRequestBody),
      cache: 'no-store'
    });

    const routesPayload = await routesResponse.json().catch(() => []);
    if (!routesResponse.ok) {
      const errorMessage = extractRoutesApiError(routesPayload);
      return Response.json(
        {
          error:
            errorMessage ||
            `Routes matrix request failed (${routesResponse.status}). Ensure Routes API is enabled for this key.`
        },
        { status: 502 }
      );
    }

    const entries = Array.isArray(routesPayload) ? routesPayload : [];
    const durationsById = normalizeTravelTimeMatrixEntries({
      destinations,
      entries
    });

    return Response.json({ durationsById });
  });
}

function sanitizeLatLng(value: any) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function toRouteMatrixWaypoint({ lat, lng }: { lat: number; lng: number }) {
  return {
    waypoint: {
      location: {
        latLng: {
          latitude: lat,
          longitude: lng
        }
      }
    }
  };
}

function toRoutesApiTravelMode(mode: any) {
  const value = String(mode || '').toUpperCase();

  if (value === 'DRIVING') {
    return 'DRIVE';
  }
  if (value === 'TRANSIT') {
    return 'TRANSIT';
  }
  return 'WALK';
}

function extractRoutesApiError(payload: any) {
  if (Array.isArray(payload) && payload[0]?.status?.message) {
    return String(payload[0].status.message);
  }
  if (payload?.error?.message) {
    return String(payload.error.message);
  }
  return '';
}
