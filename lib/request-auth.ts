import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';

function getConvexUrl() {
  return process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || '';
}

function createConvexClientWithToken(token) {
  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    return null;
  }
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  return client;
}

function unauthenticatedResponse() {
  return Response.json(
    {
      error: 'Sign in required.',
      needsAuth: true
    },
    { status: 401 }
  );
}

export async function requireAuthenticatedClient() {
  const token = await convexAuthNextjsToken();
  if (!token) {
    return {
      client: null,
      deniedResponse: unauthenticatedResponse(),
      profile: null
    };
  }

  const client = createConvexClientWithToken(token);
  if (!client) {
    return {
      client: null,
      deniedResponse: Response.json(
        {
          error: 'CONVEX_URL is missing. Configure Convex to continue.'
        },
        { status: 503 }
      ),
      profile: null
    };
  }

  try {
    const profile =
      await client.query('appUsers:getCurrentUserProfile' as any, {}) ||
      await client.mutation('appUsers:ensureCurrentUserProfile' as any, {});
    return {
      client,
      deniedResponse: null,
      profile
    };
  } catch (error) {
    return {
      client: null,
      deniedResponse: Response.json(
        {
          error: error instanceof Error ? error.message : 'Authentication failed.',
          needsAuth: true
        },
        { status: 401 }
      ),
      profile: null
    };
  }
}

export async function requireOwnerClient() {
  const auth = await requireAuthenticatedClient();
  if (auth.deniedResponse) {
    return auth;
  }

  if (auth.profile?.role !== 'owner') {
    return {
      client: null,
      deniedResponse: Response.json(
        {
          error: 'Owner role required.',
          needsRole: 'owner'
        },
        { status: 403 }
      ),
      profile: auth.profile
    };
  }

  return auth;
}
