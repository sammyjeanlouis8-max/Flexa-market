import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import React from "react";
import RegisterScreen from "../../screens/auth/RegisterScreen";

/**
 * Fully native Signup screen (expo-router path).
 * Uses the GPU-rendered AuthGlobe — no WebView.
 */
export default function RegisterRoute() {
  const { login } = useAuth();
  const router = useRouter();

  return (
    <RegisterScreen
      onSuccess={async (token) => {
        await login(token);
        router.replace("/");
      }}
      onGoLogin={() => router.replace("/auth/login")}
    />
  );
}
