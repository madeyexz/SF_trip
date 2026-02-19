import { syncEvents } from '@/lib/events';
import { runWithOwnerClient } from '@/lib/api-guards';

export const runtime = 'nodejs';

let syncInFlight = null;

export async function POST() {
  return runWithOwnerClient(async () => {
    try {
      if (!syncInFlight) {
        syncInFlight = syncEvents().finally(() => {
          syncInFlight = null;
        });
      }

      const payload = await syncInFlight;
      return Response.json(payload);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'Unexpected error'
        },
        { status: 500 }
      );
    }
  });
}
