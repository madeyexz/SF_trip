import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

const EMAIL_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_WINDOW_LIMIT = 3;
const GLOBAL_WINDOW_MS = 5 * 60 * 1000;
const GLOBAL_WINDOW_LIMIT = 20;

export const assertAndRecordMagicLinkAttempt = internalMutation({
  args: {
    email: v.string()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const recentEmailAttempts = await ctx.db
      .query('magicLinkSendAttempts')
      .withIndex('by_email_created_at', (q) =>
        q.eq('email', args.email).gte('createdAt', now - EMAIL_WINDOW_MS)
      )
      .order('desc')
      .take(EMAIL_WINDOW_LIMIT);

    if (recentEmailAttempts.length >= EMAIL_WINDOW_LIMIT) {
      throw new Error('Too many sign-in links were sent to this address. Please wait 15 minutes and try again.');
    }

    const recentGlobalAttempts = await ctx.db
      .query('magicLinkSendAttempts')
      .withIndex('by_created_at', (q) => q.gte('createdAt', now - GLOBAL_WINDOW_MS))
      .order('desc')
      .take(GLOBAL_WINDOW_LIMIT);

    if (recentGlobalAttempts.length >= GLOBAL_WINDOW_LIMIT) {
      throw new Error('Sign-in is temporarily rate limited. Please retry in a few minutes.');
    }

    await ctx.db.insert('magicLinkSendAttempts', {
      email: args.email,
      createdAt: now
    });

    return null;
  }
});
