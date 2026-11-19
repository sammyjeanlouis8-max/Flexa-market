import { Redirect } from "expo-router";

/** WebView `/driver/dashboard` → native driver dashboard (My Deliveries). */
export default function DriverDashboardAliasRedirect() {
  return <Redirect href="/driver-dashboard" />;
}
