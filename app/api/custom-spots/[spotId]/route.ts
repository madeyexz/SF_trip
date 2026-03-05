import { runWithAuthenticatedClient } from '@/lib/api-guards';
import { createDeleteCustomSpotHandler } from '@/lib/custom-spots-api';
import { deleteCustomSpotPayload } from '@/lib/custom-spots';

export const runtime = 'nodejs';

export const DELETE = createDeleteCustomSpotHandler({
  runWithAuthenticatedClient,
  deleteCustomSpotPayload
});
