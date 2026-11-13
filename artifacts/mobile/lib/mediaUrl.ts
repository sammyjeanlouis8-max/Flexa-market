import { getApiBase } from "./api";

/** Resolve listing/media paths to absolute https URLs for native Image. */
export function resolveMediaUrl(uri?: string | null): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:")) {
    return uri;
  }
  const origin = getApiBase().replace(/\/api\/?$/, "");
  if (uri.startsWith("/")) return `${origin}${uri}`;
  return `${origin}/${uri}`;
}
