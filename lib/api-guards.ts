import { runWithConvexClient } from './convex-client-context.ts';

type AuthPayload = {
  client: any;
  deniedResponse: Response | null;
  profile: any;
};

type GuardDeps = {
  requireAuth?: () => Promise<AuthPayload>;
  requireOwner?: () => Promise<AuthPayload>;
  runWithClientContext?: <T>(client: any, fn: () => Promise<T> | T) => Promise<T> | T;
};

export async function runWithAuthenticatedClient(
  handler: (auth: AuthPayload) => Promise<Response> | Response,
  deps: GuardDeps = {}
) {
  const readAuth = deps.requireAuth || (async () => {
    const authModule = await import('./request-auth.ts');
    return authModule.requireAuthenticatedClient();
  });
  const withClientContext = deps.runWithClientContext || runWithConvexClient;
  const auth = await readAuth();

  if (auth.deniedResponse || !auth.client) {
    return auth.deniedResponse as Response;
  }

  return withClientContext(auth.client, () => handler(auth));
}

export async function runWithOwnerClient(
  handler: (auth: AuthPayload) => Promise<Response> | Response,
  deps: GuardDeps = {}
) {
  const readOwner = deps.requireOwner || (async () => {
    const authModule = await import('./request-auth.ts');
    return authModule.requireOwnerClient();
  });
  const withClientContext = deps.runWithClientContext || runWithConvexClient;
  const auth = await readOwner();

  if (auth.deniedResponse || !auth.client) {
    return auth.deniedResponse as Response;
  }

  return withClientContext(auth.client, () => handler(auth));
}
