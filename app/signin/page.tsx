'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { MapPin, Mail, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { validateMagicLinkEmail } from '@/lib/auth-email';

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/planning');
    }
  }, [isAuthenticated, isLoading, router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const emailCheck = validateMagicLinkEmail(email);
    if (!emailCheck.ok) {
      setNotice(emailCheck.error);
      setNoticeError(true);
      return;
    }
    const normalizedEmail = emailCheck.email;

    setIsSubmitting(true);
    setNotice('');
    setNoticeError(false);
    setSent(false);
    setEmail(normalizedEmail);
    try {
      const result = await signIn('resend', {
        email: normalizedEmail,
        redirectTo: '/planning'
      });
      setSent(true);
      if (result?.signingIn) {
        setNotice('Check your email for a magic sign-in link.');
      } else {
        setNotice('Sign-in request submitted. Check your email.');
      }
      setNoticeError(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to send sign-in email.');
      setNoticeError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-dvh flex items-center justify-center" style={{ background: '#0C0C0C' }}>
        <Loader2 size={20} className="animate-spin" style={{ color: '#00FF88' }} />
      </main>
    );
  }

  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4 sm:p-6"
      style={{ background: '#0C0C0C', fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}
    >
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#2f2f2f 1px, transparent 1px),' +
            'linear-gradient(90deg, #2f2f2f 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.15,
        }}
      />
      {/* Green glow at top */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 30% at 50% -5%, rgba(0,255,136,0.06), transparent 70%)',
        }}
      />

      <div
        className="relative mx-auto flex w-full max-w-[440px] flex-col items-center"
        style={{ animation: 'fadeSlideUp 0.5s ease-out' }}
      >
        {/* Brand */}
        <div className="mb-8 flex items-center gap-3 sm:mb-10">
          <div
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              border: '1px solid #00FF88',
              background: '#0A0A0A',
            }}
          >
            <MapPin size={18} style={{ color: '#00FF88' }} />
          </div>
          <div>
            <h1
              className="m-0 text-[18px] leading-none sm:text-[20px]"
              style={{
                fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                fontWeight: 700,
                color: '#FFFFFF',
                letterSpacing: '-0.5px',
              }}
            >
              SF TRIP PLANNER
            </h1>
            <p
              className="m-0 mt-1"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#8a8a8a',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {'// MISSION_CONTROL'}
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full border border-border bg-card px-4 py-5 sm:px-7 sm:py-6">
          {sent ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center text-center" style={{ padding: '8px 0' }}>
              <div
                className="flex items-center justify-center mb-5"
                style={{
                  width: 48,
                  height: 48,
                  border: '1px solid #00FF8840',
                  background: '#00FF8810',
                }}
              >
                <CheckCircle2 size={22} style={{ color: '#00FF88' }} />
              </div>

              <p
                className="m-0 mb-1"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#00FF88',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                [LINK_SENT]
              </p>
              <h2
                className="m-0 text-[17px] sm:text-[18px]"
                style={{
                  fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                  fontWeight: 600,
                  color: '#FFFFFF',
                }}
              >
                Check your inbox
              </h2>
              <p
                className="m-0 mt-3 max-w-[300px] text-[12px] sm:text-[13px]"
                style={{
                  fontWeight: 400,
                  color: '#8a8a8a',
                  lineHeight: 1.6,
                }}
              >
                We sent a magic link to{' '}
                <span style={{ color: '#00FF88', fontWeight: 500 }}>{email}</span>.
                <br />
                Click the link in the email to sign in.
                <br />
                Don&apos;t see it? Check your spam or junk folder.
              </p>

              <button
                type="button"
                onClick={() => { setSent(false); setNotice(''); }}
                className="mt-6 cursor-pointer"
                style={{
                  background: 'transparent',
                  border: '1px solid #2f2f2f',
                  color: '#8a8a8a',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase' as const,
                  padding: '8px 16px',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#00FF88';
                  e.currentTarget.style.color = '#FFFFFF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#2f2f2f';
                  e.currentTarget.style.color = '#8a8a8a';
                }}
              >
                Use different email
              </button>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <div className="mb-5">
                <p
                  className="m-0 mb-2"
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#8a8a8a',
                    letterSpacing: '1px',
                  }}
                >
                  {'// AUTHENTICATION'}
                </p>
                <h2
                  className="m-0 text-[17px] sm:text-[18px]"
                  style={{
                    fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                    fontWeight: 600,
                    color: '#FFFFFF',
                  }}
                >
                  Sign in
                </h2>
                <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-[#8a8a8a] sm:text-[13px]">
                  Enter your email for a magic sign-in link.
                </p>
              </div>

              <form className="flex flex-col" style={{ gap: 10 }} onSubmit={onSubmit}>
                {/* Email label */}
                <label
                  htmlFor="magic-link-email"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#8a8a8a',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  EMAIL_ADDRESS
                </label>
                <div className="relative" style={{ marginTop: -4 }}>
                  <Mail
                    size={14}
                    className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: 10, color: '#6a6a6a' }}
                  />
                  <input
                    id="magic-link-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    className="w-full outline-none"
                    style={{
                      background: '#141414',
                      border: '1px solid #2f2f2f',
                      color: '#FFFFFF',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 500,
                      padding: '8px 12px 8px 32px',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#00FF88'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#2f2f2f'; }}
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: '#00FF88',
                    border: 'none',
                    color: '#0C0C0C',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase' as const,
                    padding: '10px 16px',
                    gap: 8,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      SENDING LINK...
                    </>
                  ) : (
                    <>
                      CONTINUE WITH EMAIL
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              {/* Error notice */}
              {notice && noticeError && (
                <div
                  className="mt-4"
                  style={{
                    padding: '10px 14px',
                    border: '1px solid #FF880040',
                    background: '#FF880010',
                    color: '#FF8800',
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {notice}
                </div>
              )}
            </>
          )}
        </div>

        {/* System info footer */}
        <div
          className="mt-4 flex w-full flex-col items-start justify-between gap-1.5 border-t border-border pt-2.5 sm:flex-row sm:items-center"
          style={{
            paddingBottom: 0,
          }}
        >
          <p
            className="m-0"
            style={{ fontSize: 11, color: '#6a6a6a', fontWeight: 400 }}
          >
            {'// NO PASSWORD REQUIRED'}
          </p>
          <p
            className="m-0"
            style={{ fontSize: 11, color: '#6a6a6a', fontWeight: 400 }}
          >
            [MAGIC_LINK]
          </p>
        </div>
      </div>
    </main>
  );
}
