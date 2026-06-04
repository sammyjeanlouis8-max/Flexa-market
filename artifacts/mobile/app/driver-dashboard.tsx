import SiteWebView from "@/components/SiteWebView";
import React from "react";

export default function DriverDashboardScreen() {
  const uri = "https://flexamarket.com/driver-dashboard";
  return <SiteWebView uri={uri} />;
}
