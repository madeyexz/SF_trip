import { requireAuthenticatedClient } from '@/lib/request-auth';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAuthenticatedClient();
  if (auth.deniedResponse || !auth.client) {
    return auth.deniedResponse;
  }

  return Response.json({
    authenticated: true,
    profile: auth.profile || null
  });
}
