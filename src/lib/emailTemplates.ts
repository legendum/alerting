import { readFileSync } from "fs";
import { join } from "path";
import { marked } from "marked";
import juice from "juice";

const EMAIL_DIR = join(process.cwd(), "config", "email");

/** Minimal CSS for email clients; juice inlines it so it works without <style> support. */
const EMAIL_CSS = `
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 16px; line-height: 1.5; color: #1e293b; }
  a { color: #2563eb; }
  p { margin: 0 0 1em 0; }
`;

/** Replace {{key}} placeholders in a string. */
function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function loadTemplate(name: string): { subject: string; bodyMd: string } {
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
export function renderEmailTemplate(
  name: string,
  vars: Record<string, string>
): { subject: string; text: string; html: string } {
  const { subject, bodyMd } = loadTemplate(name);
  const sub = (s: string) => substitute(s, vars);
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
