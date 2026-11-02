/**
 * Outgoing email. Set RESEND_API_KEY and EMAIL_FROM to send real mail through Resend
 * (resend.com). Without a key, in development the message is printed to the terminal
 * and the link is returned so you can test; in production sending fails loudly
 * (EMAIL_DEV_LINKS=1 allows the dev behavior in a production build, for automated tests only).
 */
export type SendResult = { sent: true } | { sent: false; devLink: string };

export async function sendEmail(o: { to: string; subject: string; text: string; html: string; link: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production" && process.env.EMAIL_DEV_LINKS !== "1") throw new Error("Email is not configured (set RESEND_API_KEY and EMAIL_FROM).");
    console.log(`\n[email:dev] To: ${o.to}\n[email:dev] Subject: ${o.subject}\n[email:dev] Link: ${o.link}\n`);
    // Relative, so the on-screen link always opens on the site you're using (Codespaces, localhost, ...)
    const u = new URL(o.link);
    return { sent: false, devLink: u.pathname + u.search };
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Hometown Seed <onboarding@resend.dev>", to: [o.to], subject: o.subject, text: o.text, html: o.html }),
  });
  if (!r.ok) throw new Error(`Email send failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return { sent: true };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function verifyEmailMessage(name: string, link: string) {
  return {
    subject: "Confirm your email for Hometown Seed",
    text: `Hi ${name},\n\nConfirm your email to start campaigns and pledge:\n${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
    html: `<p>Hi ${esc(name)},</p><p>Confirm your email to start campaigns and pledge:</p><p><a href="${esc(link)}">Confirm my email</a></p><p>This link expires in 24 hours. If you didn't sign up, ignore this email.</p>`,
    link,
  };
}

export function resetPasswordMessage(name: string, link: string) {
  return {
    subject: "Reset your Hometown Seed password",
    text: `Hi ${name},\n\nReset your password here:\n${link}\n\nThis link expires in 1 hour and works once. If you didn't ask for this, ignore this email; your password stays the same.`,
    html: `<p>Hi ${esc(name)},</p><p><a href="${esc(link)}">Reset my password</a></p><p>This link expires in 1 hour and works once. If you didn't ask for this, ignore this email; your password stays the same.</p>`,
    link,
  };
}
