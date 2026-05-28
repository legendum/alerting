import { resolve } from "node:path";
import { buildStyle } from "pues/base/style";

const root = resolve(import.meta.dirname, "..");
const { path, bytes } = buildStyle({ root });
console.log(`Style: wrote ${path} (${bytes} bytes).`);
