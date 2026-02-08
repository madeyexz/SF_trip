import { loadPlannerPayload, savePlannerPayload } from '@/lib/events';

export const runtime = 'nodejs';

export async function GET() {
  const payload = await loadPlannerPayload();
  return Response.json(payload);
}

export async function POST(request) {
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

  if (!body || typeof body !== 'object' || !body.plannerByDate || typeof body.plannerByDate !== 'object') {
    return Response.json(
      {
        error: 'plannerByDate object is required.'
      },
      { status: 400 }
    );
  }

  const payload = await savePlannerPayload(body.plannerByDate);
  return Response.json(payload);
}
