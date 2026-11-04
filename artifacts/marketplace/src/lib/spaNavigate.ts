/**
 * Soft SPA navigation for desktop; hard document navigation inside native
 * WebViews where history-only updates can desync the shell.
 */
import { navigate } from "wouter/use-browser-location";
import { isNativeMobileApp } from "@/lib/nativeMobileApp";

export type SpaNavigateOptions = {
  /** Default true for auth redirects. */
  replace?: boolean;
  /** Force a full document load even in the browser. */
  hard?: boolean;
};

/** Join BASE_URL with an absolute app path (`/auth/login`). */
export function appPath(path: string): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

/** True when navigation must use location.replace/assign (native WebView). */
export function shouldHardNavigate(forceHard = false): boolean {
  return forceHard || isNativeMobileApp();
}

/**
 * Navigate within the marketplace SPA on desktop; hard-redirect in native apps.
 * `path` should be an absolute path including BASE_URL when deployed under a prefix
 * (use {@link appPath}).
 */
export function spaNavigate(path: string, opts: SpaNavigateOptions = {}): void {
  const replace = opts.replace ?? true;
  if (shouldHardNavigate(opts.hard)) {
    if (replace) window.location.replace(path);
    else window.location.assign(path);
    return;
  }
  navigate(path, { replace });
}
