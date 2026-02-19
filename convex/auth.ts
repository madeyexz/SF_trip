import { Email } from '@convex-dev/auth/providers/Email';
import { convexAuth } from '@convex-dev/auth/server';

const authEmailFrom = String(process.env.AUTH_EMAIL_FROM || '').trim();
const authResendTemplateId = String(process.env.AUTH_RESEND_TEMPLATE_ID || '').trim();

function brandedEmailHtml(url: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0C0C0C;font-family:'Courier New',Courier,monospace;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0C0C0C;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;">

  <!-- Brand -->
  <tr><td align="center" style="padding-bottom:24px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:36px;height:36px;border:1px solid #00FF88;background:#0A0A0A;text-align:center;vertical-align:middle;font-size:18px;" align="center">
        &#x1F4CD;
      </td>
      <td style="padding-left:12px;">
        <div style="font-size:16px;font-weight:600;color:#FFFFFF;letter-spacing:1px;">SF TRIP PLANNER</div>
        <div style="font-size:11px;font-weight:500;color:#8a8a8a;letter-spacing:1px;margin-top:2px;">// MISSION_CONTROL</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Card -->
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;border:1px solid #2f2f2f;">
    <tr><td style="padding:32px;">

      <!-- Header -->
      <div style="font-size:11px;font-weight:500;color:#8a8a8a;letter-spacing:1px;margin-bottom:8px;">// AUTHENTICATION</div>
      <div style="font-size:18px;font-weight:600;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;margin-bottom:8px;">Sign in to SF Trip Planner</div>
      <div style="font-size:13px;font-weight:400;color:#8a8a8a;line-height:1.5;margin-bottom:24px;">Click below to securely access your trip planner. This link expires in 1 hour.</div>

      <!-- CTA Button -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${url}" target="_blank" style="display:inline-block;background:#00FF88;color:#0C0C0C;font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;text-decoration:none;padding:12px 24px;">SIGN IN TO YOUR ACCOUNT &#x25B6;</a>
      </td></tr>
      </table>

      <!-- Divider -->
      <div style="border-top:1px solid #2f2f2f;margin:24px 0;"></div>

      <!-- Fallback link -->
      <div style="font-size:11px;font-weight:500;color:#6a6a6a;margin-bottom:8px;">If the button doesn't work, copy this link:</div>
      <div style="font-size:11px;font-weight:400;color:#00FF88;word-break:break-all;line-height:1.5;">${url}</div>

    </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #2f2f2f;margin-top:16px;padding-top:12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
    <tr>
      <td style="font-size:11px;color:#6a6a6a;font-family:'Courier New',Courier,monospace;">// NO_PASSWORD_REQUIRED</td>
      <td align="right" style="font-size:11px;color:#6a6a6a;font-family:'Courier New',Courier,monospace;">[MAGIC_LINK]</td>
    </tr>
    </table>
    <div style="font-size:11px;color:#6a6a6a;margin-top:8px;font-family:'Courier New',Courier,monospace;">If you didn't request this, you can safely ignore it.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

const resendProvider = Email({
  id: 'resend',
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 60, // 1 hour
  authorize: undefined, // magic link: click link → signed in, no email re-entry
  async sendVerificationRequest({ identifier: email, url, provider }) {
    const host = new URL(url).host;
    const basePayload = {
      from: authEmailFrom || 'SF Trip Planner <onboarding@resend.dev>',
      to: email,
      subject: 'Sign in to SF Trip Planner',
    };
    const payload = authResendTemplateId
      ? {
          ...basePayload,
          template: {
            id: authResendTemplateId,
            variables: {
              APP_NAME: 'SF Trip Planner',
              HOST: host,
              SIGN_IN_URL: url,
              YEAR: String(new Date().getUTCFullYear()),
            },
          },
        }
      : {
          ...basePayload,
          html: brandedEmailHtml(url),
          text: `Sign in to SF Trip Planner\n\n${url}\n\nIf you didn't request this, ignore it.`,
        };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Resend error: ${await res.text()}`);
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [resendProvider]
});
