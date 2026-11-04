const DIDOC_PREFIX = "didoc:";

export function isDriverDocRef(url: string | null | undefined): boolean {
  return !!url && String(url).startsWith(DIDOC_PREFIX);
}

export function driverDocKeyFromRef(ref: string): string | null {
  if (!isDriverDocRef(ref)) return null;
  const key = String(ref).slice(DIDOC_PREFIX.length).trim();
  if (!key || key.includes("..") || key.startsWith("/")) return null;
  if (key.startsWith("url:")) return null; // base64 URL wrapper — not a Wasabi key
  if (!key.startsWith("driver-identity/")) return null;
  return key;
}

export { DIDOC_PREFIX };
