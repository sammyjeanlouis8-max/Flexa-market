export interface HistoricalTransferKeyRow {
  id: number;
  status: string;
}

/** Mirrors the PostgreSQL migration ordering used to retain a canonical key. */
export function canonicalTransferKeyRow<T extends HistoricalTransferKeyRow>(rows: readonly T[]): T | undefined {
  return [...rows].sort((a, b) => {
    const aRank = a.status === "completed" ? 0 : 1;
    const bRank = b.status === "completed" ? 0 : 1;
    return aRank - bRank || a.id - b.id;
  })[0];
}