import { loadBaseLocation, saveBaseLocation, getCalendarUrls, loadTripConfig, saveTripConfig } from '@/lib/events';
import { runWithAuthenticatedClient, runWithOwnerClient } from '@/lib/api-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return runWithAuthenticatedClient(async () => {
    const [baseLocation, tripConfig] = await Promise.all([
      loadBaseLocation(),
      loadTripConfig()
    ]);

    return Response.json({
      mapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || '',
      mapsMapId: process.env.GOOGLE_MAPS_MAP_ID || '',
      baseLocation,
      calendars: getCalendarUrls(),
      tripStart: tripConfig.tripStart || process.env.TRIP_START || '',
      tripEnd: tripConfig.tripEnd || process.env.TRIP_END || ''
    });
  });
}

export async function POST(request) {
  return runWithOwnerClient(async () => {
    try {
      const body = await request.json();
      const tripStart = typeof body.tripStart === 'string' ? body.tripStart.trim() : '';
      const tripEnd = typeof body.tripEnd === 'string' ? body.tripEnd.trim() : '';
      await saveTripConfig({ tripStart, tripEnd });
      if (typeof body.baseLocation === 'string') {
        await saveBaseLocation(body.baseLocation);
      }
      return Response.json({ ok: true, tripStart, tripEnd });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  });
}
