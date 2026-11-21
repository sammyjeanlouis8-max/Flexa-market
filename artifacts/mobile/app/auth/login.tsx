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

  const openInApp = (path: string) => {
    // Forgot password is native; legal/FAQ stay in embedded WebView (not Chrome).
    if (path.startsWith("/auth/forgot-password")) {
      router.push("/auth/forgot-password");
      return;
    }
    if (path.startsWith("/terms") || path.startsWith("/eula")) {
      router.push("/embed/terms");
      return;
    }
    if (path.startsWith("/privacy")) {
      router.push("/embed/privacy");
      return;
    }
    router.push({ pathname: "/embed/help-center" });
  };

  return (
    <LoginScreen
      onSuccess={async (token) => {
        await login(token);
        router.replace("/");
      }}
      onGoRegister={() => router.replace("/auth/register")}
      onOpenWebsite={openInApp}
    />
  );
}
