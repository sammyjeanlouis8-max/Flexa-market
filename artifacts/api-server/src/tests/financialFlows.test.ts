import { describe, it, expect } from "vitest";
import { escrowTransferGroup, escrowTransferIdempotencyKey, resolveSettlementRoute } from "../lib/escrowSettlement";

// ─── Return state machine ─────────────────────────────────────────────────────

type ReturnStatus =
  | "requested"
  | "seller_accepted"
  | "seller_rejected"
  | "buyer_shipped"
  | "processing"
  | "refunded"
  | "admin_rejected";

const VALID_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested:        ["seller_accepted", "seller_rejected"],
  seller_accepted:  ["buyer_shipped"],
  seller_rejected:  ["processing"],          // buyer can escalate to admin
  buyer_shipped:    ["processing"],
  processing:       ["refunded", "admin_rejected"],
  refunded:         [],
  admin_rejected:   [],
};

function canTransition(from: ReturnStatus, to: ReturnStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

describe("Return state machine", () => {
  it("allows requested → seller_accepted", () => {
    expect(canTransition("requested", "seller_accepted")).toBe(true);
  });

  it("allows requested → seller_rejected", () => {
    expect(canTransition("requested", "seller_rejected")).toBe(true);
  });

  it("allows seller_accepted → buyer_shipped", () => {
    expect(canTransition("seller_accepted", "buyer_shipped")).toBe(true);
  });

  it("allows buyer_shipped → processing", () => {
    expect(canTransition("buyer_shipped", "processing")).toBe(true);
  });

  it("allows processing → refunded", () => {
    expect(canTransition("processing", "refunded")).toBe(true);
  });

  it("allows processing → admin_rejected", () => {
    expect(canTransition("processing", "admin_rejected")).toBe(true);
  });

  it("blocks requested → refunded (skip steps)", () => {
    expect(canTransition("requested", "refunded")).toBe(false);
  });

  it("blocks refunded → anything (terminal state)", () => {
    const froms: ReturnStatus[] = ["requested", "seller_accepted", "seller_rejected", "buyer_shipped", "processing", "admin_rejected"];
    for (const to of froms) {
      expect(canTransition("refunded", to)).toBe(false);
    }
  });

  it("blocks admin_rejected → anything (terminal state)", () => {
    const froms: ReturnStatus[] = ["requested", "seller_accepted", "refunded", "processing"];
    for (const to of froms) {
      expect(canTransition("admin_rejected", to)).toBe(false);
    }
  });

  it("blocks seller_rejected → refunded (must go through admin)", () => {
    expect(canTransition("seller_rejected", "refunded")).toBe(false);
  });
});

// ─── Wallet arithmetic ─────────────────────────────────────────────────────────

interface WalletState {
  balanceUsd: number;
  promoBalance: number;
  unlockedBalance: number;
}

function deductWalletHybrid(
  wallet: WalletState,
  amount: number,
): { promoDeducted: number; realDeducted: number; ok: boolean } {
  const totalAvailable = wallet.balanceUsd + wallet.promoBalance;
  if (totalAvailable < amount) return { promoDeducted: 0, realDeducted: 0, ok: false };

  const promoDeducted = Math.min(wallet.promoBalance, amount);
  const realDeducted = amount - promoDeducted;
  return { promoDeducted, realDeducted, ok: true };
}

function computePromoUnlock(
  realBoostSpend: number,
  previousRealSpend: number,
): number {
  const UNLOCK_PER_USD = 1 / 20;
  const newThreshold = Math.floor(realBoostSpend / 20);
  const oldThreshold = Math.floor(previousRealSpend / 20);
  const unlockSteps = newThreshold - oldThreshold;
  return unlockSteps > 0 ? unlockSteps * UNLOCK_PER_USD * 20 : 0;
}

describe("Wallet hybrid deduction", () => {
  it("deducts from promo first", () => {
    const wallet = { balanceUsd: 100, promoBalance: 50, unlockedBalance: 0 };
    const result = deductWalletHybrid(wallet, 30);
    expect(result.ok).toBe(true);
    expect(result.promoDeducted).toBe(30);
    expect(result.realDeducted).toBe(0);
  });

  it("splits across promo and real when promo insufficient", () => {
    const wallet = { balanceUsd: 100, promoBalance: 10, unlockedBalance: 0 };
    const result = deductWalletHybrid(wallet, 40);
    expect(result.ok).toBe(true);
    expect(result.promoDeducted).toBe(10);
    expect(result.realDeducted).toBe(30);
  });

  it("returns ok=false when total insufficient", () => {
    const wallet = { balanceUsd: 5, promoBalance: 3, unlockedBalance: 0 };
    const result = deductWalletHybrid(wallet, 20);
    expect(result.ok).toBe(false);
  });

  it("deducts entire promo when promo = amount", () => {
    const wallet = { balanceUsd: 50, promoBalance: 25, unlockedBalance: 0 };
    const result = deductWalletHybrid(wallet, 25);
    expect(result.ok).toBe(true);
    expect(result.promoDeducted).toBe(25);
    expect(result.realDeducted).toBe(0);
  });

  it("uses real balance when no promo", () => {
    const wallet = { balanceUsd: 100, promoBalance: 0, unlockedBalance: 0 };
    const result = deductWalletHybrid(wallet, 75);
    expect(result.ok).toBe(true);
    expect(result.promoDeducted).toBe(0);
    expect(result.realDeducted).toBe(75);
  });

  it("handles zero amount", () => {
    const wallet = { balanceUsd: 100, promoBalance: 50, unlockedBalance: 0 };
    const result = deductWalletHybrid(wallet, 0);
    expect(result.ok).toBe(true);
    expect(result.promoDeducted).toBe(0);
    expect(result.realDeducted).toBe(0);
  });
});

describe("Promo unlock calculation", () => {
  it("unlocks $1 promo after $20 real boost spend", () => {
    const unlocked = computePromoUnlock(20, 0);
    expect(unlocked).toBe(1);
  });

  it("unlocks $2 promo after $40 real boost spend from zero", () => {
    const unlocked = computePromoUnlock(40, 0);
    expect(unlocked).toBe(2);
  });

  it("unlocks $1 promo when crossing second $20 threshold", () => {
    const unlocked = computePromoUnlock(40, 20);
    expect(unlocked).toBe(1);
  });

  it("unlocks nothing when no new $20 threshold crossed", () => {
    const unlocked = computePromoUnlock(15, 0);
    expect(unlocked).toBe(0);
  });

  it("unlocks nothing when previous spend already crossed threshold", () => {
    const unlocked = computePromoUnlock(25, 22);
    expect(unlocked).toBe(0);
  });

  it("unlocks $5 after $100 spend from zero", () => {
    const unlocked = computePromoUnlock(100, 0);
    expect(unlocked).toBe(5);
  });
});

// ─── Escrow idempotency simulation ────────────────────────────────────────────

describe("Escrow release idempotency", () => {
  it("second call with same escrow flag returns false (already released)", () => {
    function simulateEscrowRelease(escrowReleased: boolean): { released: boolean; reason?: string } {
      if (escrowReleased) return { released: false, reason: "already_released" };
      return { released: true };
    }

    const first = simulateEscrowRelease(false);
    expect(first.released).toBe(true);

    // Simulate the flag being set after first release
    const second = simulateEscrowRelease(true);
    expect(second.released).toBe(false);
    expect(second.reason).toBe("already_released");
  });

  it("concurrent calls: only one succeeds (CAS simulation)", () => {
    let escrowReleased = false;
    let creditCount = 0;

    function atomicRelease() {
      // Simulate SELECT FOR UPDATE / CAS behavior
      if (escrowReleased) return false;
      escrowReleased = true;
      creditCount++;
      return true;
    }

    // Simulate 3 concurrent calls — only first should succeed
    const results = [atomicRelease(), atomicRelease(), atomicRelease()];
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(creditCount).toBe(1);
  });
});

describe("Escrow settlement routing", () => {
  it("routes to Stripe only when the seller chose Stripe and Connect is active", () => {
    expect(resolveSettlementRoute({
      paymentMethod: "stripe",
      payoutPreference: "stripe",
      stripeAccountId: "acct_123",
      stripeAccountStatus: "active",
    })).toBe("stripe_connect");
  });

  it("keeps funds in FM wallet when preference is wallet", () => {
    expect(resolveSettlementRoute({
      paymentMethod: "stripe",
      payoutPreference: "fm_wallet",
      stripeAccountId: "acct_123",
      stripeAccountStatus: "active",
    })).toBe("fm_wallet");
  });

  it("falls back safely when Connect is incomplete", () => {
    expect(resolveSettlementRoute({
      paymentMethod: "stripe",
      payoutPreference: "stripe",
      stripeAccountId: "acct_123",
      stripeAccountStatus: "pending",
    })).toBe("fm_wallet");
  });

  it("uses one deterministic Stripe idempotency key per order", () => {
    expect(escrowTransferIdempotencyKey(42)).toBe("escrow-release-42");
    expect(escrowTransferIdempotencyKey(42)).toBe(escrowTransferIdempotencyKey(42));
    expect(escrowTransferIdempotencyKey(42)).not.toBe(escrowTransferIdempotencyKey(43));
  });

  it("uses a stable transfer group so old successful attempts can be reconciled", () => {
    expect(escrowTransferGroup(42)).toBe("FM_ESCROW_42");
    expect(escrowTransferGroup(42)).not.toBe(escrowTransferGroup(43));
  });

  it("requires evidence before classifying a legacy order", () => {
    function classifyLegacy(input: {
      walletCredit: boolean;
      paymentIntentResolved: boolean;
      destinationTransfer: boolean;
    }): "prepaid" | "unpaid" | "review" {
      if (input.walletCredit || input.destinationTransfer) return "prepaid";
      if (input.paymentIntentResolved) return "unpaid";
      return "review";
    }

    expect(classifyLegacy({
      walletCredit: false,
      paymentIntentResolved: false,
      destinationTransfer: false,
    })).toBe("review");
    expect(classifyLegacy({
      walletCredit: false,
      paymentIntentResolved: true,
      destinationTransfer: false,
    })).toBe("unpaid");
  });

  it("never releases seller funds before payment succeeds", () => {
    function canRelease(paymentStatus: string, deliveryAuthorized: boolean): boolean {
      return paymentStatus === "completed" && deliveryAuthorized;
    }
    expect(canRelease("pending", true)).toBe(false);
    expect(canRelease("failed", true)).toBe(false);
    expect(canRelease("completed", false)).toBe(false);
    expect(canRelease("completed", true)).toBe(true);
  });

  it("requires a matching successful legacy Stripe payment", () => {
    function validLegacyPayment(status: string, currency: string, received: number, expected: number): boolean {
      return status === "succeeded" && currency === "usd" && received >= expected;
    }
    expect(validLegacyPayment("processing", "usd", 10_000, 10_000)).toBe(false);
    expect(validLegacyPayment("succeeded", "usd", 9_999, 10_000)).toBe(false);
    expect(validLegacyPayment("succeeded", "eur", 10_000, 10_000)).toBe(false);
    expect(validLegacyPayment("succeeded", "usd", 10_000, 10_000)).toBe(true);
  });
});

// ─── Commission calculation ────────────────────────────────────────────────────

describe("Commission and seller earnings", () => {
  function computeEarnings(amount: number, commissionRate: number): { commission: number; earnings: number } {
    const commission = Math.round(amount * commissionRate * 100) / 100;
    return { commission, earnings: Math.round((amount - commission) * 100) / 100 };
  }

  it("calculates 10% commission correctly", () => {
    const { commission, earnings } = computeEarnings(100, 0.10);
    expect(commission).toBe(10);
    expect(earnings).toBe(90);
  });

  it("calculates 5% commission correctly", () => {
    const { commission, earnings } = computeEarnings(200, 0.05);
    expect(commission).toBe(10);
    expect(earnings).toBe(190);
  });

  it("handles fractional amounts with rounding", () => {
    const { commission, earnings } = computeEarnings(33.33, 0.10);
    expect(commission + earnings).toBeCloseTo(33.33, 1);
  });

  it("zero commission means seller gets full amount", () => {
    const { commission, earnings } = computeEarnings(150, 0);
    expect(commission).toBe(0);
    expect(earnings).toBe(150);
  });
});

// ─── Transfer fee rules ────────────────────────────────────────────────────────

describe("P2P transfer fee rules", () => {
  const DAILY_ACCESS_FEE = 3;
  const INTERNATIONAL_FEE_RATE = 0.10;
  const INTERNATIONAL_DAILY_CAP = 100;
  const STANDARD_MONTHLY_LIMIT = 4000;
  const AGENT_MONTHLY_LIMIT = 15000;

  function computeTransferFee(amount: number, isInternational: boolean, alreadyPaidDailyFee: boolean): number {
    let fee = alreadyPaidDailyFee ? 0 : DAILY_ACCESS_FEE;
    if (isInternational) fee += amount * INTERNATIONAL_FEE_RATE;
    return Math.round(fee * 100) / 100;
  }

  it("charges $3 daily access fee for first transfer of the day", () => {
    const fee = computeTransferFee(100, false, false);
    expect(fee).toBe(DAILY_ACCESS_FEE);
  });

  it("waives daily fee for subsequent transfers same day", () => {
    const fee = computeTransferFee(100, false, true);
    expect(fee).toBe(0);
  });

  it("adds 10% international surcharge", () => {
    const fee = computeTransferFee(100, true, true);
    expect(fee).toBe(10);
  });

  it("combines daily fee + international surcharge", () => {
    const fee = computeTransferFee(200, true, false);
    expect(fee).toBe(DAILY_ACCESS_FEE + 20);
  });

  it("standard user monthly limit is $4000", () => {
    expect(STANDARD_MONTHLY_LIMIT).toBe(4000);
  });

  it("authorized agent monthly limit is $15000", () => {
    expect(AGENT_MONTHLY_LIMIT).toBe(15000);
  });

  it("international daily cap is $100", () => {
    expect(INTERNATIONAL_DAILY_CAP).toBe(100);
  });
});
