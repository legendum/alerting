import { jsx as _jsx } from "react/jsx-runtime";
/**
 * `<Pues>` — root provider for app-wide pues configuration.
 *
 * Wrap your app in `<Pues fetch={authedFetch} user={user}>` to supply
 * defaults that every pues hook and component inherits. Per-call options
 * on individual hooks/components — e.g. `useResource(name, { fetch: ... })`
 * — take precedence over the context value, which in turn takes
 * precedence over the global `fetch`.
 *
 * Resolution order, applied by `usePuesFetch`:
 *
 *   options.fetch  >  <Pues fetch={...}>  >  globalThis.fetch
 *
 * `user` is tri-state and read by `usePuesUser()`:
 *
 *   prop omitted (undefined) → loading
 *   user={null}              → anonymous
 *   user={PuesUser}          → authenticated
 *
 * The consumer owns user-state ownership (typically via `useUser` from
 * `pues/base/auth`); `<Pues>` just propagates it to widgets like
 * `<Legendum>` that need to render differently per auth state.
 *
 * Lives in `base/core/` — the *bord* of the smörgåsbord. Other parts
 * (`base/objects/`, `base/theme/`, `base/auth/`, …) depend on `core` to
 * share this app-root context without prop-drilling. A consumer that
 * wants pues at all vendors `core` plus whichever feature parts it uses.
 */
import { createContext, useContext, useMemo } from "react";
import { wrapFetchWithUnauthorized } from "./unauthorizedHandler";
const PuesContext = createContext({});
export function Pues({ fetch: fetchImpl, user, children }) {
    // Wrap the supplied (or global) fetch with the 401 handler so every
    // pues-resolved fetch participates in the auto-logout-on-session-
    // expiry behavior. `useUser` subscribes via `onPuesUnauthorized` and
    // flips its state to `null` when the handler fires — consumers do
    // not wire either side. Memoized on the input fetch so the resolved
    // identity is stable across re-renders (downstream useMemo /
    // useEffect deps that key on fetch will not invalidate needlessly).
    const wrappedFetch = useMemo(() => wrapFetchWithUnauthorized(fetchImpl ?? fetch), [fetchImpl]);
    const value = useMemo(() => ({ fetch: wrappedFetch, user }), [wrappedFetch, user]);
    return _jsx(PuesContext.Provider, { value: value, children: children });
}
/** Resolve the fetch implementation for a pues hook/component. Applies
 * the precedence: explicit option > `<Pues>` context > global fetch. */
export function usePuesFetch(override) {
    const ctx = useContext(PuesContext);
    return override ?? ctx.fetch ?? fetch;
}
/** Read the current user from `<Pues user={...}>`. Tri-state:
 * `undefined` while loading (prop omitted), `null` if anonymous,
 * `PuesUser` if authenticated. Used internally by `<Legendum>` to
 * branch between the anonymous CTA and the authed credits widget. */
export function usePuesUser() {
    return useContext(PuesContext).user;
}
