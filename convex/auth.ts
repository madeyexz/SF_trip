import Resend from '@auth/core/providers/resend';
import { convexAuth } from '@convex-dev/auth/server';

const authEmailFrom = String(process.env.AUTH_EMAIL_FROM || '').trim();
const resendProvider = authEmailFrom
  ? Resend({ from: authEmailFrom })
  : Resend;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [resendProvider]
});
