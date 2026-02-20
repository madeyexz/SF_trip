import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { parseOwnerEmailAllowlist, resolveInitialUserRole } from './ownerRole';

type ConvexCtx = MutationCtx | QueryCtx;
type UserRole = 'owner' | 'member';

type UserIdentityLike = {
  email?: unknown;
} | null | undefined;

type UserProfileLike = {
  userId: string;
  role: UserRole;
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

function readStoredEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function buildProfileResponse(profile: UserProfileLike, email = '') {
  return {
    userId: profile.userId,
    role: normalizeUserRole(profile.role),
    email
  };
}

function normalizeUserRole(value: unknown): UserRole {
  return value === 'owner' ? 'owner' : 'member';
}

export const ensureCurrentUserProfile = mutation({
  args: {},
  returns: userProfileResponseValidator,
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const ownerEmailAllowlist = parseOwnerEmailAllowlist(process.env.OWNER_EMAIL_ALLOWLIST);

    const userDoc = await ctx.db.get(userId as Id<'users'>);
    if (!userDoc) {
      throw new Error('Authenticated user record not found.');
    }
    const identityEmail = readIdentityEmail(identity);
    const storedEmail = readStoredEmail(userDoc.email);
    const email = identityEmail || storedEmail;

    const shouldBeOwner = resolveInitialUserRole(email, ownerEmailAllowlist) === 'owner';
    const currentRole = userDoc.role
      ? normalizeUserRole(userDoc.role)
      : normalizeUserRole(resolveInitialUserRole(email, ownerEmailAllowlist));
    const nextRole = shouldBeOwner ? 'owner' : currentRole;

    const updates: Partial<{ role: UserRole }> = {};
    if (userDoc.role !== nextRole) {
      updates.role = nextRole;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(userId as Id<'users'>, updates);
    }

    return {
      userId,
      role: nextRole,
      email
    };
  }
});

export const getCurrentUserProfile = query({
  args: {},
  returns: v.union(v.null(), userProfileResponseValidator),
  handler: async (ctx) => {
    const userId = await requireCurrentUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const userDoc = await ctx.db.get(userId as Id<'users'>);
    if (!userDoc?.role) {
      return null;
    }
    const identityEmail = readIdentityEmail(identity);
    const storedEmail = readStoredEmail(userDoc.email);
    const email = identityEmail || storedEmail;
    return buildProfileResponse({ userId, role: normalizeUserRole(userDoc.role) }, email);
  }
});
