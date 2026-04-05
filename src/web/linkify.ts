/**
 * Escapes HTML and turns http(s):// URLs in text into <a href="..."> links.
 * Safe to use with dangerouslySetInnerHTML after this (no script injection).
 */
export function linkifyBody(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
}
