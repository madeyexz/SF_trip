import { getAuthUserId } from '@convex-dev/auth/server';
import type { Id } from './_generated/dataModel';
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

export async function requireOwnerUserId(ctx: ConvexCtx, deps: AuthDeps = {}) {
  const userId = await requireAuthenticatedUserId(ctx, deps);
  const user = await ctx.db.get(userId as Id<'users'>);
  const role = user?.role;

  if (role !== 'owner') {
    throw new Error('Owner role required.');
  }

  return userId;
}
