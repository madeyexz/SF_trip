import { syncEvents } from '@/lib/events';
import { runWithAuthenticatedClient } from '@/lib/api-guards';

export const runtime = 'nodejs';

const syncInFlightByRoom = new Map<string, Promise<any>>();

export async function POST(request: Request) {
  void request;
  return runWithAuthenticatedClient(async () => {
    const syncKey = '__personal__';

    try {
      if (!syncInFlightByRoom.has(syncKey)) {
        const syncTask = syncEvents().finally(() => {
          syncInFlightByRoom.delete(syncKey);
        });
        syncInFlightByRoom.set(syncKey, syncTask);
      }

      const payload = await syncInFlightByRoom.get(syncKey);
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
