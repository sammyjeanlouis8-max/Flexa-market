import { Redirect } from "expo-router";

/** WebView `/delivery/deliveries` → native driver dashboard (Available). */
export default function DeliveryDeliveriesRedirect() {
  return <Redirect href="/driver-dashboard" />;
}
