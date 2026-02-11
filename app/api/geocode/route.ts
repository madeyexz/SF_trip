import { resolveAddressCoordinates } from '@/lib/events';

export const runtime = 'nodejs';

export async function POST(request) {
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

  const address = String(body?.address || '').trim();
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
}
