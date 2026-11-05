import { useRouter } from "expo-router";
import React from "react";

import { NativeScreen } from "@/components/NativeScreen";
import { NavLink } from "@/components/NavLink";
import { SignInGate } from "@/components/SignInGate";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";

export default function DriverDashboardScreen() {
  const { token } = useAuth();
  const router = useRouter();
  void router;

  if (!token) {
    return (
      <NativeScreen title="Driver dashboard" subtitle="Active deliveries and earnings.">
        <SignInGate message="Sign in to open the driver dashboard." />
      </NativeScreen>
    );
  }

  return (
    <NativeScreen
      title="Driver dashboard"
      subtitle="Native driver hub. Live map and job accept flows continue on delivery APIs."
    >
      <StatusCard
        label="Mode"
        value="Native"
        detail="Use delivery tracking for in-progress routes."
        tone="ok"
      />
      <NavLink href="/deliveries" label="Available & my deliveries" />
      <NavLink href="/delivery-tracking" label="Open delivery tracking" />
      <NavLink href="/driver-apply" label="Driver application" />
    </NativeScreen>
  );
}
