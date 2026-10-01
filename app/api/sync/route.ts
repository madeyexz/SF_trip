import { syncEvents } from '@/lib/events';
import { runWithAuthenticatedClient } from '@/lib/api-guards';
import { runPersonalSync } from '@/lib/personal-sync';

export const runtime = 'nodejs';

const syncInFlightByUser = new Map<string, Promise<any>>();

export async function POST(request: Request) {
  void request;
  return runWithAuthenticatedClient(async ({ profile }) => {
    try {
      const payload = await runPersonalSync(syncInFlightByUser, profile, () => syncEvents());
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
