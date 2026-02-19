import { getAuthUserId } from '@convex-dev/auth/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';

type ConvexCtx = MutationCtx | QueryCtx;

type UserIdentityLike = {
  email?: unknown;
} | null | undefined;

type UserProfileLike = {
  userId: string;
  role: 'owner' | 'member';
  email?: string;
};

async function requireCurrentUserId(ctx: ConvexCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return String(userId);
}

function readIdentityEmail(identity: UserIdentityLike) {
  if (!identity || typeof identity !== 'object') {
    return '';
  }
  return typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
}

function buildProfileResponse(profile: UserProfileLike) {
  return {
    userId: profile.userId,
    role: profile.role,
    email: profile.email || ''
  };
}

export const ensureCurrentUserProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const email = readIdentityEmail(identity);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query('userProfiles')
      .withIndex('by_user_id', (q) => q.eq('userId', userId))
      .first();

    if (existing) {
      const updates: Record<string, any> = {
        updatedAt: now
      };
      if (email && existing.email !== email) {
        updates.email = email;
      }
      await ctx.db.patch(existing._id, updates);
      return buildProfileResponse({ ...existing, ...updates });
    }

    const anyOwner = await ctx.db
      .query('userProfiles')
      .withIndex('by_role', (q) => q.eq('role', 'owner'))
      .first();

    const role = anyOwner ? 'member' : 'owner';
    await ctx.db.insert('userProfiles', {
      userId,
      role,
      email: email || undefined,
      createdAt: now,
      updatedAt: now
    });

    return {
      userId,
      role,
      email
    };
  }
});

export const getCurrentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user_id', (q) => q.eq('userId', userId))
      .first();
    if (!profile) {
      return null;
    }
    return buildProfileResponse(profile);
  }
});
