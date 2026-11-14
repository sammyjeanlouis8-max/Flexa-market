import { Redirect } from "expo-router";

/** WebView `/booster` → native My Boosts. */
export default function BoosterRedirect() {
  return <Redirect href="/my-boosts" />;
}
