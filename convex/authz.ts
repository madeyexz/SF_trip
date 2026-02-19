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

export async function requireOwnerUserId(ctx: ConvexCtx, deps: AuthDeps = {}) {
  const userId = await requireAuthenticatedUserId(ctx, deps);
  const profile = await ctx.db
    .query('userProfiles')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .first();

  if (!profile || profile.role !== 'owner') {
    throw new Error('Owner role required.');
  }

  return userId;
}

