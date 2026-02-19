import { requireAuthenticatedClient } from '@/lib/request-auth';
import { parsePairActionBody } from '@/lib/pair-api';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAuthenticatedClient();
  if (auth.deniedResponse || !auth.client) {
    return auth.deniedResponse;
  }

  try {
    const rooms = await auth.client.query('planner:listMyPairRooms', {});
    return Response.json({ rooms: Array.isArray(rooms) ? rooms : [] });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to list pair rooms.'
      },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  const auth = await requireAuthenticatedClient();
  if (auth.deniedResponse || !auth.client) {
    return auth.deniedResponse;
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: 'Invalid pair request payload.'
      },
      { status: 400 }
    );
  }

  const pairAction = parsePairActionBody(body);
  if (!pairAction.ok) {
    return Response.json(
      {
        error: pairAction.error
      },
      { status: 400 }
    );
  }

  try {
    if (pairAction.action === 'create') {
      const payload = await auth.client.mutation('planner:createPairRoom', {});
      return Response.json(payload);
    }
    if (pairAction.action === 'join') {
      const payload = await auth.client.mutation('planner:joinPairRoom', { roomCode: pairAction.roomCode });
      return Response.json(payload);
    }
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Pair room request failed.'
      },
      { status: 400 }
    );
  }
}
