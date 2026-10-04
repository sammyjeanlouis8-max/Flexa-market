import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("support access for restricted accounts", () => {
  it("keeps support requests and replies accessible through authenticated support routes", () => {
    const support = readFileSync(new URL("../routes/support.ts", import.meta.url), "utf8");
    expect(support).not.toContain("requireNotRestricted");
    expect(support).toContain('router.post("/support/threads", requireAuth,');
    expect(support).toContain('router.post("/support/threads/:id/messages", requireAuth,');
  });

  it("offers the support action from shared restriction notices", () => {
    const hook = readFileSync(new URL("../../../marketplace/src/hooks/useRestriction.ts", import.meta.url), "utf8");
    expect(hook).toContain("createElement(ToastAction");
    expect(hook).toContain('setLocation("/support")');
    expect(hook).toContain('altText: t("restriction.contactSupport")');
  });

  it("offers support instead of a publish retry for both cached and server restrictions", () => {
    const sell = readFileSync(new URL("../../../marketplace/src/pages/Sell.tsx", import.meta.url), "utf8");
    expect(sell).toContain('submitRestricted ? setLocation("/support")');
    expect(sell).toContain('submitRestricted ? t("restriction.contactSupport")');
    const cachedRestriction = sell.slice(sell.indexOf("if (isRestricted)"), sell.indexOf("setSubmitRestricted(false)"));
    expect(cachedRestriction).toContain("setSubmitRestricted(true)");
    const serverRestriction = sell.slice(sell.indexOf('e?.data?.code === "USER_RESTRICTED"'));
    expect(serverRestriction).toContain("setSubmitRestricted(true)");
  });
});