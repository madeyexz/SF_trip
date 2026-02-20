import { syncEvents } from '@/lib/events';
import { runWithOwnerClient } from '@/lib/api-guards';
import { getPlannerRoomCodeFromUrl } from '@/lib/planner-api';

export const runtime = 'nodejs';

const syncInFlightByRoom = new Map<string, Promise<any>>();

export async function POST(request: Request) {
  return runWithOwnerClient(async () => {
    const roomCode = getPlannerRoomCodeFromUrl(request.url);
    const syncKey = roomCode || '__personal__';

    try {
      if (!syncInFlightByRoom.has(syncKey)) {
        const syncTask = syncEvents(roomCode).finally(() => {
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
