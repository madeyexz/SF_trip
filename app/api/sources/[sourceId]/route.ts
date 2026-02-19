import { deleteSourcePayload, syncSingleSource, updateSourcePayload } from '@/lib/events';
import { runWithOwnerClient } from '@/lib/api-guards';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  return runWithOwnerClient(async () => {
    const { sourceId } = await params;
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

export async function POST(_requestUnused, { params }) {
  return runWithOwnerClient(async () => {
    const { sourceId } = await params;

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

export async function DELETE(_requestUnused, { params }) {
  return runWithOwnerClient(async () => {
    const { sourceId } = await params;

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
