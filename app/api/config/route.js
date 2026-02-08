import { loadBaseLocation, getCalendarUrls } from '@/lib/events';

export const runtime = 'nodejs';

export async function GET() {
  const baseLocation = await loadBaseLocation();

  return Response.json({
    mapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || '',
    hasFirecrawlKey: Boolean(process.env.FIRECRAWL_API_KEY),
    baseLocation,
    calendars: getCalendarUrls()
  });
}
