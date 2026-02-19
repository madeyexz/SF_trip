import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { parseOwnerEmailAllowlist, resolveInitialUserRole } from './ownerRole';

type ConvexCtx = MutationCtx | QueryCtx;

type UserIdentityLike = {
  email?: unknown;
} | null | undefined;

type UserProfileLike = {
  userId: string;
  role: 'owner' | 'member';
  email?: string;
};

const userProfileResponseValidator = v.object({
  userId: v.string(),
  role: v.union(v.literal('owner'), v.literal('member')),
  email: v.string()
});

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
  returns: userProfileResponseValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const email = readIdentityEmail(identity);
    const now = new Date().toISOString();
    const ownerEmailAllowlist = parseOwnerEmailAllowlist(process.env.OWNER_EMAIL_ALLOWLIST);

    const existing = await ctx.db
      .query('userProfiles')
      .withIndex('by_user_id', (q) => q.eq('userId', userId))
      .first();

    if (existing) {
      const updates: Partial<{
        email: string;
        role: 'owner';
        updatedAt: string;
      }> = {};
      if (email && existing.email !== email) {
        updates.email = email;
      }
      const shouldBeOwner = resolveInitialUserRole(email, ownerEmailAllowlist) === 'owner';
      if (shouldBeOwner && existing.role !== 'owner') {
        updates.role = 'owner';
      }
      if (updates.email || updates.role) {
        updates.updatedAt = now;
        await ctx.db.patch(existing._id, updates);
        return buildProfileResponse({ ...existing, ...updates });
      }
      return buildProfileResponse(existing);
    }
    const role = resolveInitialUserRole(email, ownerEmailAllowlist);
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
  returns: v.union(v.null(), userProfileResponseValidator),
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
