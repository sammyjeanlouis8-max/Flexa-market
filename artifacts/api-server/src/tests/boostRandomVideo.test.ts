/**
 * /api/boost/random-video must not 500 on first visit (empty exclude history).
 * Production regression: orderBy(sql`0`, random()) threw → Layout silently
 * dropped the interstitial, so shoppers never saw automatic boosts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const boostRoutes = readFileSync(
  resolve(__dirname, "../routes/boost.ts"),
  "utf8",
);

describe("boost/random-video first-visit safety", () => {
  it("does not order by a bare SQL literal 0 when exclude is empty", () => {
    const handler = boostRoutes.slice(
      boostRoutes.indexOf('router.get("/boost/random-video"'),
      boostRoutes.indexOf('router.post("/boost/video-only"'),
    );
    expect(handler).toBeTruthy();
    // Soft-rank CASE is fine; a fallback `sql\`0\`` used in orderBy is not.
    expect(handler).toMatch(/rotationPreferSql/);
    expect(handler).toMatch(/excludeIds\.length > 0/);
    expect(handler).toMatch(/base\.orderBy\(sql`random\(\)`\)/);
    expect(handler).not.toMatch(/:\s*sql`0`;/);
  });

  it("soft-fails to listing:null instead of bubbling a 500", () => {
    const handler = boostRoutes.slice(
      boostRoutes.indexOf('router.get("/boost/random-video"'),
      boostRoutes.indexOf('router.post("/boost/video-only"'),
    );
    expect(handler).toMatch(/catch \(err\)/);
    expect(handler).toMatch(/listing:\s*null/);
    expect(handler).toMatch(/boost\/random-video failed/);
  });
});
