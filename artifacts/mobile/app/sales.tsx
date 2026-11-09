import { Redirect } from "expo-router";
import React from "react";

/** Seller sales live under My Orders → Selling tab. */
export default function SalesRedirect() {
  return <Redirect href="/orders" />;
}
