import { readFileSync } from "node:fs";
import { join } from "node:path";
import juice from "juice";
import { marked } from "marked";

const EMAIL_DIR = join(process.cwd(), "config", "email");
/** Minimal CSS for email clients; juice inlines it so it works without <style> support. */
const EMAIL_CSS = `
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 16px; line-height: 1.5; color: #1e293b; }
  a { color: #2563eb; }
  p { margin: 0 0 1em 0; }
  .notification-box {
    background-color: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px;
    margin: 0 0 16px 0;
    position: relative;
  }
  .notification-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px 0;
  }
  .notification-logo {
    font-size: 12px;
    line-height: 1;
    margin-right: 12px;
  }
  .notification-webhook-name {
    font-size: 12px;
    font-weight: bold;
    color: #64748b;
    margin: 0 12px 0 0;
  }
  .notification-time {
    font-size: 12px;
    color: #64748b;
    margin: 0;
  }
  .notification-title {
    font-weight: bold;
    font-size: 16px;
    margin: 0 0 8px 0;
    color: #1e293b;
  }
  .notification-separator {
    border-top: 1px solid #cbd5e1;
    margin: 8px 0;
  }
  .notification-body {
    font-size: 16px;
    margin: 8px 0 0 0;
    color: #1e293b;
    white-space: pre-wrap;
  }
`;
/** Replace {{key}} placeholders in a string. */
function substitute(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
function loadTemplate(name) {
  const subjectPath = join(EMAIL_DIR, `${name}.subject.txt`);
  const bodyPath = join(EMAIL_DIR, `${name}.body.md`);
  const subject = readFileSync(subjectPath, "utf-8").trim();
  const bodyMd = readFileSync(bodyPath, "utf-8");
  return { subject, bodyMd };
}
/**
 * Load an email template, substitute placeholders, and render body to email-friendly HTML (inlined styles).
 * Placeholders use {{name}} syntax. Plain text is the substituted markdown (readable as-is).
 */
export function renderEmailTemplate(name, vars) {
  const { subject, bodyMd } = loadTemplate(name);
  const sub = (s) => substitute(s, vars);
  const subjectRendered = sub(subject);
  const bodyRendered = sub(bodyMd);
  const bodyHtml = marked(bodyRendered, { async: false });
  const wrapped = `<!DOCTYPE html><html><body>${bodyHtml}</body></html>`;
  const html = juice.inlineContent(wrapped, EMAIL_CSS);
  return {
    subject: subjectRendered,
    text: bodyRendered,
    html,
  };
}
