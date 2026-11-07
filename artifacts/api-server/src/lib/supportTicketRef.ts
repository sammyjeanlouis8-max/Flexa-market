/**
 * Canonical Flexa Market support ticket references.
 * Format: FM-YYYY-NNNNNN (e.g. FM-2026-001245)
 */

const REF_RE = /^FM-(\d{4})-(\d{6})$/i;

export function buildTicketRef(threadId: number, createdAt: Date | string = new Date()): string {
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const year = Number.isFinite(d.getTime()) ? d.getUTCFullYear() : new Date().getUTCFullYear();
  const seq = Math.max(1, Math.floor(threadId));
  return `FM-${year}-${String(seq).padStart(6, "0")}`;
}

export function parseTicketRef(raw: string): { year: number; id: number } | null {
  const m = String(raw ?? "").trim().replace(/^#/, "").match(REF_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const id = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(id) || id < 1) return null;
  return { year, id };
}

export function displayTicketRef(ref: string | null | undefined, threadId: number, createdAt?: Date | string): string {
  if (ref && REF_RE.test(ref.replace(/^#/, ""))) return ref.replace(/^#/, "").toUpperCase();
  return buildTicketRef(threadId, createdAt ?? new Date());
}
