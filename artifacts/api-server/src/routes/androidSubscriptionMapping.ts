export function getAndroidRevenueCatPlan(event: Record<string, unknown>): "standard" | "premium" | undefined {
  if (event.app_id !== "app516a5c6a4b" || event.store !== "PLAY_STORE"
      || !["SANDBOX", "PRODUCTION"].includes(String(event.environment))) return undefined;
  switch (event.product_id) {
    case "flexa_standard_monthly":
    case "flexa_standard_monthly:monthly": return "standard";
    case "flexa_premium_monthly":
    case "flexa_premium_monthly:monthly": return "premium";
    default: return undefined;
  }
}