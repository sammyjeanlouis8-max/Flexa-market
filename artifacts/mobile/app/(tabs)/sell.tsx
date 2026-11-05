import React from "react";

import { NativeScreen } from "@/components/NativeScreen";
import { NavLink } from "@/components/NavLink";
import { SignInGate } from "@/components/SignInGate";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";

/** Default UI language: English. */
export default function SellTab() {
  const { token } = useAuth();

  return (
    <NativeScreen
      title="Sell"
      subtitle="Native seller tools. Listing create form expands next — no WebView."
    >
      <StatusCard
        label="Account"
        value={token ? "Session active" : "Sign-in required"}
        detail="Same seller APIs as the website."
        tone={token ? "ok" : "warn"}
      />
      {!token ? (
        <SignInGate message="Sign in to sell on Flexa Market." />
      ) : (
        <>
          <NavLink href="/my-listings" label="My listings" />
          <NavLink href="/sales" label="Seller dashboard" />
          <NavLink href="/boost" label="Boost a listing" />
          <NavLink href="/subscription" label="Seller subscription" />
          <NavLink href="/wallet" label="Wallet" />
        </>
      )}
    </NativeScreen>
  );
}
