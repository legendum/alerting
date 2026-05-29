/** Update or create the document favicon `<link rel="icon">`. */
export function setFavicon(href: string): void {
  if (typeof document === "undefined") return;
  const absolute = new URL(href, window.location.origin).href;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  if (link.href !== absolute) link.href = href;
}
