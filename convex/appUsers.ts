import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';

type ConvexCtx = MutationCtx | QueryCtx;

type UserIdentityLike = {
  email?: unknown;
} | null | undefined;

type UserProfileLike = {
  userId: string;
  email: string;
};

const userProfileResponseValidator = v.object({
  userId: v.string(),
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

function readStoredEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function buildProfileResponse(profile: UserProfileLike) {
  return {
    userId: profile.userId,
    email: readStoredEmail(profile.email)
  };
}

export const ensureCurrentUserProfile = mutation({
  args: {},
  returns: userProfileResponseValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();

    const userDoc = await ctx.db.get(userId as Id<'users'>);
    if (!userDoc) {
      throw new Error('Authenticated user record not found.');
    }
    const identityEmail = readIdentityEmail(identity);
    const storedEmail = readStoredEmail(userDoc.email);
    const email = identityEmail || storedEmail;

    if (email && email !== storedEmail) {
      await ctx.db.patch(userId as Id<'users'>, {
        email
      });
    }
    return buildProfileResponse({ userId, email });
  }
});

export const getCurrentUserProfile = query({
  args: {},
  returns: v.union(v.null(), userProfileResponseValidator),
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const userDoc = await ctx.db.get(userId as Id<'users'>);
    if (!userDoc) {
      return null;
    }
    const identityEmail = readIdentityEmail(identity);
    const storedEmail = readStoredEmail(userDoc.email);
    const email = identityEmail || storedEmail;
    return buildProfileResponse({ userId, email });
  }
});
