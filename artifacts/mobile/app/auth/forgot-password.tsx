import { useRouter } from "expo-router";
import React from "react";
import ForgotPasswordScreen from "../../screens/auth/ForgotPasswordScreen";

/**
 * Fully native password recovery — /api/recovery/* (no website redirect).
 */
export default function ForgotPasswordRoute() {
  const router = useRouter();

  return (
    <ForgotPasswordScreen
      onDone={() => router.replace("/auth/login")}
      onBackToLogin={() => router.replace("/auth/login")}
    />
  );
}
