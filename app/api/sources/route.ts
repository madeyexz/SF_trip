import { createSourcePayload, loadSourcesPayload } from '@/lib/events';
import { runWithOwnerClient } from '@/lib/api-guards';

export const runtime = 'nodejs';

export async function GET() {
  return runWithOwnerClient(async () => {
    const payload = await loadSourcesPayload();
    return Response.json(payload);
  });
}

export async function POST(request) {
  return runWithOwnerClient(async () => {
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
      const source = await createSourcePayload(body);
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
