/** Only missing application modules should trigger a full-page recovery. */
export function isChunkError(err: unknown): boolean {
  if (!err) return false;
  const name = typeof err === "object" && "name" in err ? String(err.name) : "";
  const message = err instanceof Error ? err.message : String(err);
  return (
    name === "ChunkLoadError" ||
    /dynamically imported module|Loading chunk|Failed to fetch dynamically/i.test(message) ||
    /Importing a module script failed|error loading dynamically imported module/i.test(message) ||
    /module script.*MIME type|MIME type.*module script|not a valid JavaScript MIME type/i.test(message)
  );
}