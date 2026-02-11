import { loadPlannerPayload, normalizePlannerRoomId, savePlannerPayload } from '@/lib/events';
import { requireAdminSession } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function getRoomIdFromRequest(request) {
  const url = new URL(request.url);
  return normalizePlannerRoomId(url.searchParams.get('roomId'));
}

export async function GET(request) {
  const roomId = getRoomIdFromRequest(request);
  if (!roomId) {
    return Response.json({
      plannerByDate: {},
      source: 'local',
      roomId: ''
    });
  }

  const deniedResponse = requireAdminSession(request);
  if (deniedResponse) {
    return deniedResponse;
  }

  const payload = await loadPlannerPayload(roomId);
  return Response.json(payload);
}

export async function POST(request) {
  const queryRoomId = getRoomIdFromRequest(request);
  let body = null;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: 'Invalid planner payload.'
      },
      { status: 400 }
    );
  }

  const roomId = normalizePlannerRoomId(body?.roomId || queryRoomId);
  if (!roomId) {
    return Response.json(
      {
        error: 'roomId is required for shared planner persistence.'
      },
      { status: 400 }
    );
  }

  const deniedResponse = requireAdminSession(request);
  if (deniedResponse) {
    return deniedResponse;
  }

  if (!body || typeof body !== 'object' || !body.plannerByDate || typeof body.plannerByDate !== 'object') {
    return Response.json(
      {
        error: 'plannerByDate object is required.'
      },
      { status: 400 }
    );
  }

  const payload = await savePlannerPayload(body.plannerByDate, roomId);
  return Response.json(payload);
}
