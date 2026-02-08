import { loadBaseLocation, getCalendarUrls, loadTripConfig, saveTripConfig } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [baseLocation, tripConfig] = await Promise.all([
    loadBaseLocation(),
    loadTripConfig()
  ]);

  return Response.json({
    mapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || '',
    baseLocation,
    calendars: getCalendarUrls(),
    tripStart: tripConfig.tripStart || process.env.TRIP_START || '',
    tripEnd: tripConfig.tripEnd || process.env.TRIP_END || ''
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const tripStart = typeof body.tripStart === 'string' ? body.tripStart.trim() : '';
    const tripEnd = typeof body.tripEnd === 'string' ? body.tripEnd.trim() : '';
    await saveTripConfig({ tripStart, tripEnd });
    return Response.json({ ok: true, tripStart, tripEnd });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
