import { loadEventsPayload } from '@/lib/events';

export const runtime = 'nodejs';

export async function GET() {
  const payload = await loadEventsPayload();
  return Response.json(payload);
}
