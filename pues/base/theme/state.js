const STORAGE_KEY = "pues.theme";
let currentPref = "system";
let userTouched = false;
let mql = null;
let mqlListener = null;
let initialized = false;
function isThemePref(v) {
    return v === "system" || v === "dark" || v === "light";
}
function readStored() {
    if (typeof localStorage === "undefined")
        return "system";
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return isThemePref(raw) ? raw : "system";
    }
    catch {
        return "system";
    }
}
function writeStored(pref) {
    if (typeof localStorage === "undefined")
        return;
    try {
        localStorage.setItem(STORAGE_KEY, pref);
    }
    catch { }
}
function apply(pref) {
    if (typeof document === "undefined")
        return;
    const html = document.documentElement;
    if (mql && mqlListener) {
        mql.removeEventListener("change", mqlListener);
        mql = null;
        mqlListener = null;
    }
    if (pref === "system") {
        mql = window.matchMedia("(prefers-color-scheme: light)");
        mqlListener = () => {
            html.setAttribute("data-theme", mql?.matches ? "light" : "dark");
        };
        mqlListener();
        mql.addEventListener("change", mqlListener);
    }
    else {
        html.setAttribute("data-theme", pref);
    }
}
export function installTheme() {
    if (initialized)
        return;
    initialized = true;
    currentPref = readStored();
    apply(currentPref);
}
export function reconcileTheme(serverPref) {
    if (userTouched)
        return;
    const next = isThemePref(serverPref) ? serverPref : "system";
    if (next === currentPref)
        return;
    currentPref = next;
    writeStored(next);
    apply(next);
}
export function getThemePref() {
    return currentPref;
}
export function setThemePref(pref) {
    userTouched = true;
    currentPref = pref;
    writeStored(pref);
    apply(pref);
}
