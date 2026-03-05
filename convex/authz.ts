import { getAuthUserId } from '@convex-dev/auth/server';
import type { MutationCtx, QueryCtx } from './_generated/server';

type ConvexCtx = MutationCtx | QueryCtx;

type AuthDeps = {
  getUserId?: (ctx: ConvexCtx) => Promise<unknown>;
};

export async function requireAuthenticatedUserId(ctx: ConvexCtx, deps: AuthDeps = {}) {
  const readUserId = deps.getUserId || getAuthUserId;
  const userId = await readUserId(ctx);
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return String(userId);
}
