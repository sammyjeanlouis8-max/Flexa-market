import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

/** Legacy route — redirect into native checkout (no WebView). */
export default function StripeCheckoutRedirect() {
  const params = useLocalSearchParams<{ listingId?: string }>();
  if (params.listingId) {
    return (
      <Redirect
        href={{
          pathname: "/checkout",
          params: { mode: "single", listingId: String(params.listingId) },
        }}
      />
    );
  }
  return <Redirect href="/cart" />;
}
