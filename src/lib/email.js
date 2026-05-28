import nodemailer from "nodemailer";
import { getConfig } from "./config.js";
import { renderEmailTemplate } from "./emailTemplates.js";
import { log } from "./logger.js";
export async function sendEmail(opts) {
  const config = getConfig();
  const smtp = config.smtp;
  if (!smtp?.host?.trim()) {
    if (process.env.NODE_ENV !== "test") {
      log.info(
        "Email (no SMTP)",
        opts.to,
        opts.subject,
        opts.text ?? opts.html?.slice(0, 80),
      );
    }
    return;
  }
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure ?? smtp.port === 465,
    auth:
      smtp.user && smtp.password
        ? { user: smtp.user, pass: smtp.password }
        : undefined,
  });
  log.info("Sending email", { to: opts.to, subject: opts.subject });
  await transporter.sendMail({
    from: smtp.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
/** Load a template from config/email/, substitute vars, render markdown to HTML, and send. */
export async function sendTemplatedEmail(templateName, to, vars) {
  const { subject, text, html } = renderEmailTemplate(templateName, vars);
  await sendEmail({ to, subject, text, html });
}
