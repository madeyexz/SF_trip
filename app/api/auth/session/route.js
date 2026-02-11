import {
  buildAdminSessionCookie,
  buildClearedAdminSessionCookie,
  createAdminSessionToken,
  isAdminAuthenticatedRequest,
  isAdminPasswordConfigured,
  verifyAdminPassword
} from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(request) {
  return Response.json({
    authConfigured: isAdminPasswordConfigured(),
    authenticated: isAdminAuthenticatedRequest(request)
  });
}

export async function POST(request) {
  if (!isAdminPasswordConfigured()) {
    return Response.json(
      {
        error: 'APP_ADMIN_PASSWORD is not configured on server.',
        authConfigured: false
      },
      { status: 503 }
    );
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: 'Invalid auth payload.'
      },
      { status: 400 }
    );
  }

  const password = String(body?.password || '');
  if (!verifyAdminPassword(password)) {
    return Response.json(
      {
        error: 'Invalid password.',
        authConfigured: true
      },
      { status: 401 }
    );
  }

  const sessionToken = createAdminSessionToken();
  return Response.json(
    {
      authConfigured: true,
      authenticated: true
    },
    {
      headers: {
        'Set-Cookie': buildAdminSessionCookie(sessionToken)
      }
    }
  );
}

export async function DELETE() {
  return Response.json(
    {
      authenticated: false
    },
    {
      headers: {
        'Set-Cookie': buildClearedAdminSessionCookie()
      }
    }
  );
}
