const ALLOWED = new Set(["system", "light", "dark"]);
function isThemePref(v) {
    return typeof v === "string" && ALLOWED.has(v);
}
function parseMeta(raw) {
    if (!raw)
        return {};
    try {
        const v = JSON.parse(raw);
        if (v && typeof v === "object" && !Array.isArray(v)) {
            return v;
        }
    }
    catch { }
    return {};
}
export function getTheme(db, userId) {
    const row = db.query("SELECT meta FROM users WHERE id = ?").get(userId);
    if (!row)
        return null;
    const meta = parseMeta(row.meta);
    return isThemePref(meta.theme) ? meta.theme : null;
}
export function setTheme(db, userId, value) {
    if (!isThemePref(value)) {
        throw new Error(`Invalid theme: ${String(value)}`);
    }
    const row = db.query("SELECT meta FROM users WHERE id = ?").get(userId);
    if (!row)
        throw new Error(`User ${userId} not found`);
    const merged = { ...parseMeta(row.meta), theme: value };
    db.run("UPDATE users SET meta = ? WHERE id = ?", JSON.stringify(merged), userId);
}
