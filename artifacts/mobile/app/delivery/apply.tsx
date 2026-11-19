import { Redirect } from "expo-router";

/** WebView `/delivery/apply` → native driver apply. */
export default function DeliveryApplyRedirect() {
  return <Redirect href="/driver-apply" />;
}
