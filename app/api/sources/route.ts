import { createSourcePayload, loadSourcesPayload } from '@/lib/events';
import { runWithOwnerClient } from '@/lib/api-guards';
import { getPlannerRoomCodeFromUrl } from '@/lib/planner-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return runWithOwnerClient(async () => {
    const roomCode = getPlannerRoomCodeFromUrl(request.url);
    const payload = await loadSourcesPayload(roomCode);
    return Response.json(payload);
  });
}

export async function POST(request: Request) {
  return runWithOwnerClient(async () => {
    const roomCode = getPlannerRoomCodeFromUrl(request.url);
    let body = null;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          error: 'Invalid source payload.'
        },
        { status: 400 }
      );
    }

    try {
      const source = await createSourcePayload(body, roomCode);
      return Response.json({ source });
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'Failed to create source.'
        },
        { status: 400 }
      );
    }
  });
}
