import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import React from "react";
import LoginScreen from "../../screens/auth/LoginScreen";

/**
 * Fully native Login screen (expo-router path).
 * Uses the GPU-rendered AuthGlobe — no WebView.
 */
export default function LoginRoute() {
  const { login } = useAuth();
  const router = useRouter();

  return (
    <LoginScreen
      onSuccess={async (token) => {
        await login(token);
        router.replace("/");
      }}
      onGoRegister={() => router.replace("/auth/register")}
      onForgotPassword={() => router.push("/auth/forgot-password")}
    />
  );
}
