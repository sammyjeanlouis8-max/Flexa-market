import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/tests/**/*.test.ts",
      // Client-side boost delivery / Home promo contracts live next to the SPA.
      "../marketplace/src/lib/boostAdRotation.test.ts",
      "../marketplace/src/lib/boostAdControls.test.ts",
      "../marketplace/src/components/boostVideoOverlayControls.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
    },
  },
});
