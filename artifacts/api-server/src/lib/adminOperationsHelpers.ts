export const MAX_BULK_ADMIN_IDS = 50;

export function uniquePositiveIds(value: unknown): { ids?: number[]; error?: string } {
  if (!Array.isArray(value)) return { error: "ids must be an array" };
  const ids = [...new Set(value)];
  if (!ids.length || ids.length > MAX_BULK_ADMIN_IDS || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { error: `ids must contain 1-${MAX_BULK_ADMIN_IDS} unique positive integers` };
  return { ids };
}
export function queuePriority(value: unknown): number {
  return ({ urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>)[String(value)] ?? 2;
}
export function validReportTransition(status: string, decision: unknown): boolean {
  return status === "pending" && (decision === "resolve" || decision === "dismiss");
}
export function cleanAuditSnapshot(value: any): any {
  if (!value || typeof value !== "object") return value ?? null;
  const sensitive = /password|token|secret|hash|authorization|cookie/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitive.test(key)).map(([key, val]) => [key, val instanceof Date ? val.toISOString() : val]));
}