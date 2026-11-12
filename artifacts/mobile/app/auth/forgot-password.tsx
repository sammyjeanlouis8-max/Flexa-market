import { useRouter } from "expo-router";
import React from "react";
import ForgotPasswordScreen from "../../screens/auth/ForgotPasswordScreen";

/**
 * Native account recovery — AuthShell + AuthGlobe preserved.
 * Uses /api/recovery/* (not legacy /auth/forgot-password).
 */
export default function ForgotPasswordRoute() {
  const router = useRouter();
  const goLogin = () => router.replace("/auth/login");

  return <ForgotPasswordScreen onDone={goLogin} onGoLogin={goLogin} />;
}
