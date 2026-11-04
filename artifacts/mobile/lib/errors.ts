/** Best-effort message extraction from Orval / fetch errors. */
export function formatApiError(error: unknown, fallback = "Erè rezo"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object") {
    const record = error as {
      message?: unknown;
      data?: { message?: unknown; error?: unknown };
      status?: number;
    };
    const nested =
      (typeof record.data?.message === "string" && record.data.message) ||
      (typeof record.data?.error === "string" && record.data.error) ||
      (typeof record.message === "string" && record.message);
    if (nested) return nested;
    if (record.status) return `Erè HTTP ${record.status}`;
  }
  return fallback;
}
