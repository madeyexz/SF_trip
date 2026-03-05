import { runWithAuthenticatedClient } from '@/lib/api-guards';
import { createPostCustomSpotsHandler } from '@/lib/custom-spots-api';
import { createCustomSpotPayload } from '@/lib/custom-spots';

export const runtime = 'nodejs';

export const POST = createPostCustomSpotsHandler({
  runWithAuthenticatedClient,
  createCustomSpotPayload
});
