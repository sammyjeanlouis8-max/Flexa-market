/**
 * Wallet / Promo Account is intentionally invisible on native Android.
 * Keep this route so old notifications and flexamarket://wallet links cannot
 * open money UI — they redirect to Account instead.
 */
import { Redirect } from "expo-router";

export default function WalletRouteDisabled() {
  return <Redirect href="/(tabs)/profile" />;
}
