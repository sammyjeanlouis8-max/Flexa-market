import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, insert, update, rows } = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), rows: vi.fn(),
}));
vi.mock("@workspace/db", async importOriginal => {
  const original = await importOriginal<typeof import("@workspace/db")>();
  return { ...original, db: { select, insert, update } };
});
vi.mock("../middlewares/auth", () => ({
  requireAuth: vi.fn(), requireFinanceAdmin: vi.fn(),
}));
import router from "../routes/seller-payouts";

const route = router.stack.find(layer => layer.route?.path === "/seller/payout-account/card-method");
const handler = route!.route!.stack.at(-1)!.handle;

beforeEach(() => {
  vi.resetAllMocks();
  select.mockReturnValue({ from: () => ({ where: rows }) });
});

describe("server enforcement for old clients", () => {
  it.each(["USA", "United States", "US"])("rejects Kat FM for US country %s without changing saved preferences", async country => {
    rows.mockResolvedValue([{ country }]);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ userId: 999001, body: { method: "fm_wallet" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "US_STRIPE_ONLY" }));
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