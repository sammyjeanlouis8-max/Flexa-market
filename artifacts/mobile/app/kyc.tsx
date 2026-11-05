import React from "react";

import { NativeScreen } from "@/components/NativeScreen";
import { SignInGate } from "@/components/SignInGate";
import { StatusCard } from "@/components/StatusCard";
import { useAuth } from "@/context/AuthContext";

export default function KycScreen() {
  const { token, user } = useAuth();

  if (!token) {
    return (
      <NativeScreen title="Identity verification" subtitle="KYC for higher limits.">
        <SignInGate message="Sign in to view your KYC status." />
      </NativeScreen>
    );
  }

  return (
    <NativeScreen
      title="Identity verification"
      subtitle="Native KYC status. Document upload UI continues in the next sub-phase using existing /api/kyc endpoints."
    >
      <StatusCard
        label="Status"
        value={String(user?.kycStatus ?? "not_submitted")}
        detail="Your account KYC state comes from /api/auth/me. Upload flow stays API-compatible."
        tone={user?.kycStatus === "approved" ? "ok" : "warn"}
      />
    </NativeScreen>
  );
}
