import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, insert, update, rows, retrieveAccount, createAccount, createLink, getClient } = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), rows: vi.fn(),
  retrieveAccount: vi.fn(), createAccount: vi.fn(), createLink: vi.fn(), getClient: vi.fn(),
}));
vi.mock("@workspace/db", async importOriginal => {
  const original = await importOriginal<typeof import("@workspace/db")>();
  return { ...original, db: { select, insert, update } };
});
vi.mock("../middlewares/auth", () => ({
  requireAuth: vi.fn(), requireFinanceAdmin: vi.fn(),
}));
vi.mock("../lib/stripeClient", () => ({
  getStripeClient: getClient, getStripePublishableKey: vi.fn(),
}));
import router from "../routes/seller-payouts";
import connectRouter from "../routes/stripeConnect";

const route = router.stack.find(layer => layer.route?.path === "/seller/payout-account/card-method");
const handler = route!.route!.stack.at(-1)!.handle;
const onboardingRoute = connectRouter.stack.find(layer => layer.route?.path === "/stripe/connect/onboard");
const onboardingHandler = onboardingRoute!.route!.stack.at(-1)!.handle;

beforeEach(() => {
  vi.resetAllMocks();
  select.mockReturnValue({ from: () => ({ where: rows }) });
  getClient.mockResolvedValue({
    accounts: { retrieve: retrieveAccount, create: createAccount },
    accountLinks: { create: createLink },
  });
});

describe("Stripe onboarding country without wallet mutation", () => {
  it.each([["USA", "US"], ["Canada", "CA"], ["Mexico", "MX"], ["France", "FR"], ["United Kingdom", "GB"]])(
    "creates a new %s seller account with country %s", async (country, code) => {
      rows.mockResolvedValue([{ id: 999001, country, email: "seller@example.test", stripeAccountId: null }]);
      retrieveAccount.mockResolvedValue({ country: "MX" });
      createAccount.mockResolvedValue({ id: "acct_created" });
      createLink.mockResolvedValue({ url: "https://connect.stripe.com/test-onboarding" });
      update.mockReturnValue({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) });
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await onboardingHandler({ userId: 999001 } as any, res as any, vi.fn());
      expect(createAccount).toHaveBeenCalledWith(expect.objectContaining({ country: code, type: "express" }));
      expect(res.json).toHaveBeenCalledWith({ url: "https://connect.stripe.com/test-onboarding" });
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it("blocks unsupported Mexico onboarding without creating an account or changing any balance", async () => {
    rows.mockResolvedValue([{ id: 999001, country: "Mexico", stripeAccountId: null }]);
    retrieveAccount.mockResolvedValue({ country: "US" });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await onboardingHandler({ userId: 999001 } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "STRIPE_COUNTRY_UNSUPPORTED" }));
    expect(createAccount).not.toHaveBeenCalled();
    expect(createLink).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps existing connected accounts instead of replacing them", async () => {
    rows.mockResolvedValue([{ id: 999001, country: "Canada", stripeAccountId: "acct_existing" }]);
    createLink.mockResolvedValue({ url: "https://connect.stripe.com/test-onboarding" });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await onboardingHandler({ userId: 999001 } as any, res as any, vi.fn());
    expect(createAccount).not.toHaveBeenCalled();
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ account: "acct_existing" }));
    expect(update).not.toHaveBeenCalled();
  });
});

describe("server enforcement for old clients", () => {
  it.each(["USA", "United States", "US", "Canada", "CA", "Mexico", "México", "Mexique", "Meksik", "MX", "Dominican Republic", "France", "United Kingdom", "", null])("rejects Kat FM as a new sales payout for %s without changing wallets or saved preferences", async country => {
    rows.mockResolvedValue([{ country }]);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ userId: 999001, body: { method: "fm_wallet" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "STRIPE_ONLY_PAYOUT" }));
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves the existing non-US preference path available", async () => {
    rows.mockResolvedValueOnce([{ country: "Haiti" }]).mockResolvedValueOnce([{ id: 1 }]);
    update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [{ cardPayoutMethod: "fm_wallet" }] }) }),
    });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ userId: 999001, body: { method: "fm_wallet" } } as any, res as any, vi.fn());
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ cardPayoutMethod: "fm_wallet" });
    expect(update).toHaveBeenCalledOnce();
  });
});