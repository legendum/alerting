import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { usePuesFetch } from "../core/Pues";
import { getThemePref, setThemePref } from "./state";
const OPTIONS = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
];
export function ThemeChooser({ endpoint = "/pues/me", fetch: fetchOverride, }) {
    const fetchImpl = usePuesFetch(fetchOverride);
    const [pref, setPref] = useState(() => getThemePref());
    function choose(next) {
        setPref(next);
        setThemePref(next);
        if (endpoint) {
            fetchImpl(endpoint, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meta: { theme: next } }),
            }).catch(() => null);
        }
    }
    return (_jsxs("fieldset", { className: "pues-theme-chooser", children: [_jsx("legend", { className: "pues-sr-only", children: "Color theme" }), OPTIONS.map((opt) => (_jsx("button", { type: "button", className: "pues-theme-chooser-option", "aria-pressed": pref === opt.value, onClick: () => choose(opt.value), children: opt.label }, opt.value)))] }));
}
