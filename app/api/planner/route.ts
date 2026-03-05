import { requireAuthenticatedClient } from '@/lib/request-auth';
import { parsePlannerPostPayload } from '@/lib/planner-api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireAuthenticatedClient();
  if (auth.deniedResponse || !auth.client) {
    return auth.deniedResponse;
  }

  void request;
  try {
    const payload = await auth.client.query('planner:getPlannerState', {});
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to load planner state.'
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedClient();
  if (auth.deniedResponse || !auth.client) {
    return auth.deniedResponse;
  }
  let body: unknown = null;

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

  const plannerPayload = parsePlannerPostPayload(body);
  if (!plannerPayload.ok) {
    return Response.json(
      {
        error: plannerPayload.error
      },
      { status: 400 }
    );
  }

  try {
    const payload = await auth.client.mutation('planner:replacePlannerState', {
      plannerByDate: plannerPayload.plannerByDate
    });
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to save planner state.'
      },
      { status: 400 }
    );
  }
}
