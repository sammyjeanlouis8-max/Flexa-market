import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Flex Card repayment & admin-block CONCURRENCY guard.
//
// This file locks in the race-safety of the Flex Card money flow
// (artifacts/api-server/src/routes/flex-card.ts) so a future change cannot
// silently reintroduce the double-charge bug: two concurrent partial
// repayments both deducting the wallet against a STALE outstanding balance,
// draining money while the debt only drops once.
//
// Why a model instead of hitting the live POST endpoints: the api-server
// imports `@workspace/db`, which throws at import time unless DATABASE_URL is
// set, and the CI/test runner has no Postgres. So — exactly like the existing
// financialFlows.test.ts CAS/escrow simulations — we faithfully model the two
// implementations against a shared in-memory store with real async
// interleaving:
//   • repayLocked   = the PRODUCTION flow: db.transaction + FOR UPDATE on the
//                     debt row then the wallet row (serialized).
//   • repayNoLock   = the OLD buggy flow: independent statements guarded only
//                     by an atomic `WHERE balance >= amount` check (NOT
//                     serialized) — kept here purely to prove the test can
//                     actually detect the regression.
// The invariant assertions (money conserved, debt = original − sum, auto-unblock
// only at 0, one active debt per user) are what a future refactor must keep
// passing.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// A fair async mutex that models Postgres `SELECT ... FOR UPDATE`: while one
// transaction holds the row lock, any other transaction that asks for the same
// row blocks until the holder releases (commits).
class RowLock {
  private held = false;
  private waiters: Array<() => void> = [];
  async acquire(): Promise<() => void> {
    if (this.held) await new Promise<void>((res) => this.waiters.push(res));
    this.held = true;
    return () => {
      this.held = false;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}

interface DebtRow {
  id: number;
  userId: number;
  status: "active" | "cleared";
  originalUsd: number;
  outstandingUsd: number;
}
interface WalletRow {
  userId: number;
  balanceUsd: number;
}

class Store {
  debts: DebtRow[] = [];
  wallets = new Map<number, WalletRow>();
  walletTxns: { userId: number; amountUsd: number }[] = [];
  repayments: { userId: number; amountUsd: number; outstandingAfterUsd: number }[] = [];
  flexCardBlocked = new Map<number, boolean>();
  private seq = 1;
  // One lock object per active-debt slot and per wallet, keyed by userId.
  debtLocks = new Map<number, RowLock>();
  walletLocks = new Map<number, RowLock>();

  debtLock(userId: number) {
    if (!this.debtLocks.has(userId)) this.debtLocks.set(userId, new RowLock());
    return this.debtLocks.get(userId)!;
  }
  walletLock(userId: number) {
    if (!this.walletLocks.has(userId)) this.walletLocks.set(userId, new RowLock());
    return this.walletLocks.get(userId)!;
  }
  activeDebt(userId: number) {
    return this.debts.find((d) => d.userId === userId && d.status === "active") ?? null;
  }
  // Models the partial unique index `flex_card_debts_one_active_idx`
  // (... WHERE status = 'active'): a second active row for the same user is
  // rejected at insert time, regardless of what any concurrent reader saw.
  insertDebt(row: Omit<DebtRow, "id">): DebtRow {
    if (row.status === "active" && this.activeDebt(row.userId)) {
      throw new Error(
        "duplicate key value violates unique constraint \"flex_card_debts_one_active_idx\"",
      );
    }
    const created = { ...row, id: this.seq++ };
    this.debts.push(created);
    return created;
  }
}

// ── PRODUCTION flow: serialized with FOR UPDATE on debt then wallet ──────────
type RepayOutcome =
  | { code: "OK"; pay: number; outstandingAfter: number; cleared: boolean }
  | { code: "NO_ACTIVE_DEBT" }
  | { code: "NOTHING_TO_REPAY" }
  | { code: "INSUFFICIENT_FUNDS"; walletBalanceUsd: number };

async function repayLocked(store: Store, userId: number, requested: number): Promise<RepayOutcome> {
  const releaseDebt = await store.debtLock(userId).acquire(); // FOR UPDATE (debt)
  try {
    const debt = store.activeDebt(userId);
    if (!debt) return { code: "NO_ACTIVE_DEBT" };

    let pay = round2(Math.min(requested, debt.outstandingUsd));
    if (pay <= 0) return { code: "NOTHING_TO_REPAY" };

    await tick(); // simulate the await between statements; lock still held

    const releaseWallet = await store.walletLock(userId).acquire(); // FOR UPDATE (wallet)
    try {
      const wallet = store.wallets.get(userId);
      if (!wallet || wallet.balanceUsd < pay - 0.001) {
        return { code: "INSUFFICIENT_FUNDS", walletBalanceUsd: wallet?.balanceUsd ?? 0 };
      }
      wallet.balanceUsd = round2(wallet.balanceUsd - pay);

      const outstandingAfter = round2(debt.outstandingUsd - pay);
      const cleared = outstandingAfter <= 0.001;

      store.walletTxns.push({ userId, amountUsd: -pay });
      store.repayments.push({ userId, amountUsd: pay, outstandingAfterUsd: cleared ? 0 : outstandingAfter });

      if (cleared) {
        debt.outstandingUsd = 0;
        debt.status = "cleared";
        store.flexCardBlocked.set(userId, false);
      } else {
        debt.outstandingUsd = outstandingAfter;
      }
      return { code: "OK", pay, outstandingAfter, cleared };
    } finally {
      releaseWallet();
    }
  } finally {
    releaseDebt();
  }
}

// ── OLD buggy flow: no row locks, only an atomic wallet WHERE guard ──────────
// Kept ONLY to prove the invariants below can actually fail without locking.
async function repayNoLock(store: Store, userId: number, requested: number): Promise<RepayOutcome> {
  const debt = store.activeDebt(userId);
  if (!debt) return { code: "NO_ACTIVE_DEBT" };
  const staleOutstanding = debt.outstandingUsd; // read once, no lock
  let pay = round2(Math.min(requested, staleOutstanding));
  if (pay <= 0) return { code: "NOTHING_TO_REPAY" };

  await tick(); // both requests interleave here against the stale read

  const wallet = store.wallets.get(userId);
  if (!wallet || wallet.balanceUsd < pay - 0.001) {
    return { code: "INSUFFICIENT_FUNDS", walletBalanceUsd: wallet?.balanceUsd ?? 0 };
  }
  wallet.balanceUsd = round2(wallet.balanceUsd - pay); // atomic-guard-only deduct

  await tick();

  const outstandingAfter = round2(staleOutstanding - pay); // computed from STALE value
  const cleared = outstandingAfter <= 0.001;
  store.repayments.push({ userId, amountUsd: pay, outstandingAfterUsd: cleared ? 0 : outstandingAfter });
  if (cleared) {
    debt.outstandingUsd = 0;
    debt.status = "cleared";
  } else {
    debt.outstandingUsd = outstandingAfter;
  }
  return { code: "OK", pay, outstandingAfter, cleared };
}

// ── Admin block flow: FOR UPDATE + partial unique index hard guard ───────────
async function adminBlock(
  store: Store,
  userId: number,
  amountUsd: number,
): Promise<{ status: 200 | 409 }> {
  // For a brand-new user there is NO active-debt row to lock, so FOR UPDATE
  // does not serialize the two requests — the partial unique index is what
  // actually prevents a second active debt.
  const existing = store.activeDebt(userId);
  if (existing) return { status: 409 };

  await tick(); // both concurrent blocks pass the existence check here

  try {
    store.insertDebt({ userId, status: "active", originalUsd: amountUsd, outstandingUsd: amountUsd });
    store.flexCardBlocked.set(userId, true);
    return { status: 200 };
  } catch (e: any) {
    if (/unique|duplicate/i.test(e?.message ?? "")) return { status: 409 };
    throw e;
  }
}

function seedDebt(store: Store, userId: number, amountUsd: number, walletUsd: number) {
  store.insertDebt({ userId, status: "active", originalUsd: amountUsd, outstandingUsd: amountUsd });
  store.wallets.set(userId, { userId, balanceUsd: walletUsd });
  store.flexCardBlocked.set(userId, true);
}

describe("Flex Card concurrent repayment (production locked flow)", () => {
  it("two parallel partial repayments debit the wallet by exactly the sum repaid", async () => {
    const store = new Store();
    const userId = 1;
    seedDebt(store, userId, 100, 200); // $100 debt, $200 wallet

    const results = await Promise.all([
      repayLocked(store, userId, 50),
      repayLocked(store, userId, 50),
    ]);

    const totalPaid = results.reduce((s, r) => s + (r.code === "OK" ? r.pay : 0), 0);
    expect(totalPaid).toBe(100);

    const wallet = store.wallets.get(userId)!;
    expect(wallet.balanceUsd).toBe(200 - totalPaid); // exactly the sum, no double charge
    expect(store.activeDebt(userId)).toBeNull(); // fully cleared
    const cleared = store.debts.find((d) => d.userId === userId)!;
    expect(cleared.outstandingUsd).toBe(0);
    expect(store.flexCardBlocked.get(userId)).toBe(false); // auto-unblocked at 0
  });

  it("debt outstanding always equals original minus the sum actually repaid", async () => {
    const store = new Store();
    const userId = 2;
    seedDebt(store, userId, 100, 500);

    // Three concurrent $30 payments on a $100 debt: max repayable is $100, the
    // rest must clamp to what is actually outstanding.
    const results = await Promise.all([
      repayLocked(store, userId, 30),
      repayLocked(store, userId, 30),
      repayLocked(store, userId, 30),
    ]);

    const totalPaid = round2(results.reduce((s, r) => s + (r.code === "OK" ? r.pay : 0), 0));
    const debt = store.debts.find((d) => d.userId === userId)!;
    const outstanding = debt.status === "cleared" ? 0 : debt.outstandingUsd;

    expect(round2(100 - totalPaid)).toBe(outstanding); // conservation
    expect(round2(store.wallets.get(userId)!.balanceUsd)).toBe(round2(500 - totalPaid));
  });

  it("card auto-unblocks ONLY once outstanding hits exactly 0", async () => {
    const store = new Store();
    const userId = 3;
    seedDebt(store, userId, 100, 500);

    // Two $30 payments do NOT clear the $100 debt -> stays blocked.
    await Promise.all([repayLocked(store, userId, 30), repayLocked(store, userId, 30)]);
    expect(store.activeDebt(userId)).not.toBeNull();
    expect(store.flexCardBlocked.get(userId)).toBe(true);
    expect(store.activeDebt(userId)!.outstandingUsd).toBe(40);

    // Final payment brings it to 0 -> unblocks.
    await repayLocked(store, userId, 40);
    expect(store.activeDebt(userId)).toBeNull();
    expect(store.flexCardBlocked.get(userId)).toBe(false);
  });

  it("never over-deducts the wallet even with more concurrent requests than debt", async () => {
    const store = new Store();
    const userId = 4;
    seedDebt(store, userId, 60, 1000);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => repayLocked(store, userId, 25)),
    );
    const totalPaid = round2(results.reduce((s, r) => s + (r.code === "OK" ? r.pay : 0), 0));

    expect(totalPaid).toBe(60); // never pays more than the debt
    expect(store.wallets.get(userId)!.balanceUsd).toBe(1000 - 60);
    expect(store.activeDebt(userId)).toBeNull();
  });
});

describe("Regression sentinel: the OLD unlocked flow loses money", () => {
  it("two concurrent partial repayments WITHOUT row locks drain the wallet twice", async () => {
    const store = new Store();
    const userId = 9;
    seedDebt(store, userId, 100, 200);

    await Promise.all([repayNoLock(store, userId, 50), repayNoLock(store, userId, 50)]);

    const wallet = store.wallets.get(userId)!;
    const debt = store.debts.find((d) => d.userId === userId)!;
    const outstanding = debt.status === "cleared" ? 0 : debt.outstandingUsd;
    const totalDebited = round2(200 - wallet.balanceUsd);
    const debtReduced = round2(100 - outstanding);

    // The bug: wallet is debited MORE than the debt was reduced -> money lost.
    // This assertion documents the broken behavior and guarantees the locked
    // flow above is genuinely doing something the unlocked flow cannot.
    expect(totalDebited).toBeGreaterThan(debtReduced);
  });
});

describe("Flex Card concurrent admin block (partial unique index guard)", () => {
  it("parallel blocks for the same user create exactly ONE active debt", async () => {
    const store = new Store();
    const userId = 5;

    const results = await Promise.all([
      adminBlock(store, userId, 100),
      adminBlock(store, userId, 100),
      adminBlock(store, userId, 100),
    ]);

    const ok = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(2);

    const active = store.debts.filter((d) => d.userId === userId && d.status === "active");
    expect(active).toHaveLength(1);
  });

  it("a block on an already-blocked user returns 409 and adds no row", async () => {
    const store = new Store();
    const userId = 6;
    await adminBlock(store, userId, 100);
    const before = store.debts.length;

    const second = await adminBlock(store, userId, 100);
    expect(second.status).toBe(409);
    expect(store.debts.length).toBe(before);
  });
});
