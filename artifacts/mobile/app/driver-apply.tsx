import React from "react";

import { NativeScreen } from "@/components/NativeScreen";
import { SignInGate } from "@/components/SignInGate";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";

export default function DriverApplyScreen() {
  const { token } = useAuth();

  if (!token) {
    return (
      <NativeScreen title="Become a driver" subtitle="Apply to deliver with Flexa Market.">
        <SignInGate message="Sign in to apply as a driver." />
      </NativeScreen>
    );
  }

  return (
    <NativeScreen
      title="Become a driver"
      subtitle="Native application shell. Submission uses existing delivery/driver APIs — form fields expand next."
    >
      <StatusCard
        label="Application"
        value="Ready for form"
        detail="No WebView. Full multi-step application UI is scheduled after Orders/Delivery polish."
        tone="warn"
      />
    </NativeScreen>
  );
}
