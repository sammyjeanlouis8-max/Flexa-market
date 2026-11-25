/**
 * Source contracts for critical notification + wallet transfer hardening.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const srcRoot = join(process.cwd(), "src");

describe("critical notification + wallet fixes", () => {
  it("safeNotify requires actorId and logs insert failures", () => {
    const src = readFileSync(join(srcRoot, "lib/safeNotify.ts"), "utf8");
    expect(src).toContain("actorId: number");
    expect(src).toContain("safeNotify skipped: invalid actorId");
    expect(src).toContain("safeNotify insert failed");
    expect(src).toContain("notificationsTable");
  });

  it("delivery routes notify via safeNotify with actorId + referenceId", () => {
    const src = readFileSync(join(srcRoot, "routes/delivery.ts"), "utf8");
    expect(src).toContain('from "../lib/safeNotify"');
    expect(src).toContain("safeNotify({");
    expect(src).toContain("actorId:");
    expect(src).toContain("referenceId:");
    // No silent swallowed inserts left on the delivery route.
    expect(src).not.toMatch(
      /db\.insert\(notificationsTable\)[\s\S]{0,200}\.catch\(\(\)\s*=>\s*\{\s*\}\)/,
    );
  });

  it("wallet transfer debits with returning() and rolls back if credit fails", () => {
    const src = readFileSync(join(srcRoot, "routes/wallet.ts"), "utf8");
    const transfer = src.slice(src.indexOf("Atomic debit sender"));
    expect(transfer).toContain(".returning(");
    expect(transfer).toContain("if (!debited)");
    expect(transfer).toContain("if (!credited)");
    expect(transfer).toContain("Roll back sender debit");
    expect(transfer).toContain("safeNotify");
  });

  it("order lifecycle notifications include actorId and referenceId", () => {
    const src = readFileSync(join(srcRoot, "routes/transactions.ts"), "utf8");
    for (const type of [
      "order_delivered",
      "order_cancelled",
      "driver_assigned",
      "delivery_returned",
    ]) {
      expect(src).toContain(`type: "${type}"`);
    }
    // Critical cancelled/delivered paths carry both required columns.
    expect(src).toMatch(/type:\s*"order_cancelled"[\s\S]{0,120}actorId|actorId:[\s\S]{0,120}type:\s*"order_cancelled"/);
    expect(src).toMatch(/referenceId:\s*txId|referenceId:\s*tx\.id|referenceId:\s*orderId/);
  });
});
