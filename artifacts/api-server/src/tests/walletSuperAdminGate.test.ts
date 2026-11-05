/**
 * Authorization regression guard for Wallet visual redesign.
 * Ensures FLEXA WALLET / KAT FM platform cards stay Super-Admin gated
 * exactly as before (no hardcoded emails/IDs; role flags only).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(__dirname, "../../../marketplace/src/pages/Wallet.tsx"), "utf8");

describe("Wallet Super Admin authorization (visual redesign)", () => {
  it("derives isSuperAdmin from user flags/role only", () => {
    expect(src).toMatch(
      /const isSuperAdmin = !!\(user\?\.isSuperAdmin \|\| user\?\.role === ["']super_admin["']\)/
    );
    expect(src).not.toMatch(/isSuperAdmin[^\n]{0,120}@(flexa|gmail|yahoo)/i);
  });

  it("gates platform revenue fetch behind isSuperAdmin", () => {
    expect(src).toMatch(/const loadPlatformRev = async \(\) => \{[\s\S]*?if \(!isSuperAdmin\) return;/);
    expect(src).toMatch(/useEffect\(\(\) => \{ loadPlatformRev\(\); \}, \[isSuperAdmin\]\)/);
  });

  it("renders KAT FM FLEXAMARKET only inside isSuperAdmin conditional", () => {
    expect(src).toMatch(
      /\{\/\* ═+ PLATFORM REVENUE CARD \(super admin only\)[\s\S]*?\{isSuperAdmin && \([\s\S]*?KAT FM FLEXAMARKET/
    );
  });

  it("does not expose /api/admin/platform-revenue without Super Admin gate", () => {
    expect(src).toContain('/api/admin/platform-revenue?period=all');
    const fetchIdx = src.indexOf('/api/admin/platform-revenue?period=all');
    const before = src.slice(Math.max(0, fetchIdx - 400), fetchIdx);
    expect(before).toMatch(/if \(!isSuperAdmin\) return/);
  });
});
