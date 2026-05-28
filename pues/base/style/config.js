/**
 * Read + validate the `style:` section of `<root>/config/pues.yaml`.
 *
 * Every field is optional. A consumer that vendors `style` without
 * declaring `style:` gets pues defaults verbatim — pues.css contains
 * the baked `tokens.ts` palette + `defaults.css` component styles, no
 * overrides. The `style:` block lets a consumer override:
 *
 *   1. Theme tokens (sparse subset of `tokens.ts`'s vocabulary) under
 *      `style.dark` / `style.light`. Both blocks optional, both accept
 *      any subset of TOKEN_NAMES.
 *   2. Additional `--pues-*` knobs (e.g. `pues-dialog-border-radius`)
 *      under `style.vars`. Keys are written verbatim.
 *   3. Literal CSS appended after pues defaults under `style.css` —
 *      the final escape hatch.
 *
 * Used by `buildStyle` (build-time) and `base/pwa/config.ts` (reads
 * `style.dark.bg_page` / `style.dark.chrome` as PWA manifest fallback).
 * The style part reads pues.yaml directly so a consumer vendoring
 * `style` is not forced to also vendor `objects`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TOKEN_NAMES } from "./tokens";
export function readStyleConfig(root) {
    const yamlPath = join(root, "config/pues.yaml");
    if (!existsSync(yamlPath)) {
        // Pues.yaml is the consumer's contract; treat "no file" as empty.
        return {};
    }
    let text;
    try {
        text = readFileSync(yamlPath, "utf8");
    }
    catch (cause) {
        throw new Error(`[pues/style] could not read ${yamlPath}`, { cause });
    }
    const parsed = Bun.YAML.parse(text);
    const style = parsed?.style;
    if (style === undefined || style === null)
        return {};
    if (typeof style !== "object") {
        throw new Error(`[pues/style] ${yamlPath} 'style' must be a map (got ${typeof style}).`);
    }
    const raw = style;
    const dark = parseOverrides(yamlPath, "dark", raw.dark);
    const light = parseOverrides(yamlPath, "light", raw.light);
    const vars = parseVars(yamlPath, raw.vars);
    if (raw.css !== undefined && typeof raw.css !== "string") {
        throw new Error(`[pues/style] ${yamlPath} 'style.css' must be a string (literal CSS).`);
    }
    if (raw.reset !== undefined && typeof raw.reset !== "boolean") {
        throw new Error(`[pues/style] ${yamlPath} 'style.reset' must be a boolean.`);
    }
    return {
        dark,
        light,
        vars,
        css: raw.css,
        reset: raw.reset,
    };
}
function parseOverrides(path, which, raw) {
    if (raw === undefined || raw === null)
        return undefined;
    if (typeof raw !== "object") {
        throw new Error(`[pues/style] ${path} 'style.${which}' must be a map of token → CSS color.`);
    }
    const obj = raw;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (!TOKEN_NAMES.includes(k)) {
            throw new Error(`[pues/style] ${path} 'style.${which}.${k}': unknown token. ` +
                `Valid: ${TOKEN_NAMES.join(", ")}.`);
        }
        if (typeof v !== "string" || v.length === 0) {
            throw new Error(`[pues/style] ${path} 'style.${which}.${k}' must be a non-empty CSS color string.`);
        }
        out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function parseVars(path, raw) {
    if (raw === undefined || raw === null)
        return undefined;
    if (typeof raw !== "object") {
        throw new Error(`[pues/style] ${path} 'style.vars' must be a map of name → value.`);
    }
    const obj = raw;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== "string" || v.length === 0) {
            throw new Error(`[pues/style] ${path} 'style.vars.${k}' must be a non-empty string.`);
        }
        out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
