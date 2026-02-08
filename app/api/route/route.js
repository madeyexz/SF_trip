import { createHash } from 'node:crypto';
import { loadCachedRoutePayload, saveCachedRoutePayload } from '@/lib/events';

export const runtime = 'nodejs';

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_API_FIELD_MASK = [
  'routes.polyline.encodedPolyline',
  'routes.legs.distanceMeters',
  'routes.legs.duration'
].join(',');

export async function POST(request) {
  const apiKey =
    process.env.GOOGLE_MAPS_ROUTES_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.GOOGLE_MAPS_BROWSER_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error:
          'Missing GOOGLE_MAPS_ROUTES_KEY in .env. Add a server key with Routes API enabled to draw day routes.'
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
        error: 'Invalid route request payload.'
      },
      { status: 400 }
    );
  }

  const origin = sanitizeLatLng(body?.origin);
  const destination = sanitizeLatLng(body?.destination);
  const waypoints = Array.isArray(body?.waypoints)
    ? body.waypoints.map(sanitizeLatLng).filter(Boolean)
    : [];
  const travelMode = toRoutesApiTravelMode(body?.travelMode);
  const cacheKey = createRouteCacheKey({
    origin,
    destination,
    waypoints,
    travelMode
  });

  if (!origin || !destination) {
    return Response.json(
      {
        error: 'Route origin and destination are required.'
      },
      { status: 400 }
    );
  }

  const cachedRoute = await loadCachedRoutePayload(cacheKey);
  if (cachedRoute?.encodedPolyline) {
    return Response.json({
      ...cachedRoute,
      source: 'cache'
    });
  }

  const routesRequestBody = {
    origin: toRoutesApiLocation(origin),
    destination: toRoutesApiLocation(destination),
    intermediates: waypoints.map(toRoutesApiLocation),
    travelMode,
    computeAlternativeRoutes: false,
    optimizeWaypointOrder: false
  };

  if (travelMode === 'TRANSIT') {
    routesRequestBody.departureTime = new Date().toISOString();
  }

  const routesResponse = await fetch(ROUTES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': ROUTES_API_FIELD_MASK
    },
    body: JSON.stringify(routesRequestBody),
    cache: 'no-store'
  });

  const routesPayload = await routesResponse.json().catch(() => null);

  if (!routesResponse.ok) {
    const errorMessage = extractRoutesApiError(routesPayload);
    return Response.json(
      {
        error:
          errorMessage ||
          `Routes API request failed (${routesResponse.status}). Ensure Routes API is enabled for this key.`
      },
      { status: 502 }
    );
  }

  const route = routesPayload?.routes?.[0];
  const encodedPolyline = route?.polyline?.encodedPolyline || '';

  if (!encodedPolyline) {
    return Response.json(
      {
        error: 'No route was returned for the selected travel mode and stops.'
      },
      { status: 422 }
    );
  }

  const legs = Array.isArray(route.legs) ? route.legs : [];
  const totalDistanceMeters = legs.reduce((sum, leg) => sum + (Number(leg?.distanceMeters) || 0), 0);
  const totalDurationSeconds = legs.reduce((sum, leg) => sum + parseDurationSeconds(leg?.duration), 0);

  const responsePayload = {
    encodedPolyline,
    totalDistanceMeters,
    totalDurationSeconds,
    source: 'live'
  };

  void saveCachedRoutePayload(cacheKey, responsePayload);

  return Response.json(responsePayload);
}

function sanitizeLatLng(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function toRoutesApiLocation({ lat, lng }) {
  return {
    location: {
      latLng: {
        latitude: lat,
        longitude: lng
      }
    }
  };
}

function toRoutesApiTravelMode(mode) {
  const value = String(mode || '').toUpperCase();

  if (value === 'DRIVING') {
    return 'DRIVE';
  }

  if (value === 'TRANSIT') {
    return 'TRANSIT';
  }

  return 'WALK';
}

function parseDurationSeconds(durationValue) {
  const match = String(durationValue || '').match(/^([\d.]+)s$/);
  if (!match) {
    return 0;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function extractRoutesApiError(payload) {
  if (payload?.error?.message) {
    return payload.error.message;
  }

  return '';
}

function createRouteCacheKey({ origin, destination, waypoints, travelMode }) {
  return createHash('sha256').update(JSON.stringify({
    travelMode,
    origin: normalizeLatLng(origin),
    destination: normalizeLatLng(destination),
    waypoints: waypoints.map(normalizeLatLng)
  })).digest('hex');
}

function normalizeLatLng(point) {
  return {
    lat: Number(point?.lat || 0).toFixed(5),
    lng: Number(point?.lng || 0).toFixed(5)
  };
}
