import { deleteSourcePayload, syncSingleSource, updateSourcePayload } from '@/lib/events';
import { runWithAuthenticatedClient } from '@/lib/api-guards';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ sourceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return runWithAuthenticatedClient(async () => {
    const { sourceId } = await context.params;
    let body = null;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          error: 'Invalid source patch payload.'
        },
        { status: 400 }
      );
    }

    try {
      const source = await updateSourcePayload(sourceId, body || {});
      return Response.json({ source });
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'Failed to update source.'
        },
        { status: 400 }
      );
    }
  });
}

export async function POST(request: Request, context: RouteContext) {
  void request;
  return runWithAuthenticatedClient(async () => {
    const { sourceId } = await context.params;

    try {
      const result = await syncSingleSource(sourceId);
      return Response.json(result);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'Failed to sync source.'
        },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  void request;
  return runWithAuthenticatedClient(async () => {
    const { sourceId } = await context.params;

    try {
      const result = await deleteSourcePayload(sourceId);
      return Response.json(result);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'Failed to delete source.'
        },
        { status: 400 }
      );
    }
  });
}
