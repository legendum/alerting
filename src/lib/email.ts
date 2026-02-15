/**
 * Stub: send email. Replace with Resend/SendGrid/SMTP when ready.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    console.log("[email]", opts.to, opts.subject, opts.text ?? opts.html?.slice(0, 80));
  }
}
