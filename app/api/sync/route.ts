import { syncEvents } from '@/lib/events';
import { requireOwnerClient } from '@/lib/request-auth';

export const runtime = 'nodejs';

let syncInFlight = null;

export async function POST() {
  const { deniedResponse } = await requireOwnerClient();
  if (deniedResponse) {
    return deniedResponse;
  }

  try {
    if (!syncInFlight) {
      syncInFlight = syncEvents().finally(() => {
        syncInFlight = null;
      });
    }

    const payload = await syncInFlight;
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected error'
      },
      { status: 500 }
    );
  }
}
