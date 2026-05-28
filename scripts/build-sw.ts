/**
 * Builds pues stylesheet, PWA manifest, and Workbox service worker.
 *
 * Output:
 *   public/dist/pues.css
 *   public/manifest.json
 *   public/dist/sw.js (+ workbox-*.js)
 */

import { resolve } from "node:path";
import { buildPwa } from "pues/base/pwa/server";
import { buildStyle } from "pues/base/style";

const root = resolve(import.meta.dirname, "..");

const styleResult = buildStyle({ root });
console.log(`Style: wrote ${styleResult.path} (${styleResult.bytes} bytes).`);

const { count, size, manifestRevision } = await buildPwa({
  root,
  additionalAssets: [
    { url: "/main.js", path: "dist/main.js" },
    { url: "/main.css", path: "src/web/main.css" },
    { url: "/dist/pues.css", path: "public/dist/pues.css" },
    { url: "/img/red-ball-192.png", path: "public/img/red-ball-192.png" },
    { url: "/img/red-ball-512.png", path: "public/img/red-ball-512.png" },
    { url: "/img/inbox-192.png", path: "public/img/inbox-192.png" },
    { url: "/img/inbox-512.png", path: "public/img/inbox-512.png" },
  ],
  serviceWorker: {
    importScripts: ["/dist/alerting-sw-hooks.js"],
  },
});

console.log(
  `Service worker: ${count} precache entries, ${size} bytes total ` +
    `(manifest revision ${manifestRevision}).`,
);
