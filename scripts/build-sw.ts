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
    { url: "/main.css", path: "src/web/main.css" },
    { url: "/dist/pues.css", path: "public/dist/pues.css" },
    { url: "/alerting.png", path: "public/alerting.png" },
    { url: "/alerting-192.png", path: "public/alerting-192.png" },
    { url: "/alerting-512.png", path: "public/alerting-512.png" },
    { url: "/red-ball.png", path: "public/red-ball.png" },
    { url: "/gray-ball.png", path: "public/gray-ball.png" },
  ],
  serviceWorker: {
    importScripts: ["/dist/alerting-sw-hooks.js"],
  },
});

console.log(
  `Service worker: ${count} precache entries, ${size} bytes total ` +
    `(manifest revision ${manifestRevision}).`,
);
