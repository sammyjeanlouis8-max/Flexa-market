/**
 * Account recovery — /api/recovery/* flow (OTP + optional security questions).
 */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import AuthShell, { AUTH, AuthLink, AuthPrimaryButton } from "@/components/auth/AuthShell";
import { getBaseUrl } from "@/context/AuthContext";

type Step = "identify" | "otp" | "questions" | "reset" | "done";
type SecurityQuestion = { key: string; text: string };

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [maskedDest, setMaskedDest] = useState("");
  const [otp, setOtp] = useState("");
  const [securityQuestions, setSecurityQuestions] = useState<SecurityQuestion[]>([]);
  const [sqAnswers, setSqAnswers] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAlternate, setShowAlternate] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const start = async () => {
    if (!identifier.trim()) {
      setError("Enter your email or phone");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/recovery/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start recovery");
      setSessionToken(data.sessionToken ?? "");
      setMaskedDest(data.maskedDestination ?? "");
      setResendCooldown(60);
      setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recovery");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/recovery/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sessionToken, code: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.useSecurityQuestions) setShowAlternate(true);
        throw new Error(data.error || "Invalid code");
      }
      setStep("reset");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/recovery/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sessionToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not resend");
      setOtp("");
      setResendCooldown(60);
      setShowAlternate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resend failed");
    } finally {
      setSubmitting(false);
    }
  };

  const loadQuestions = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/recovery/get-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sessionToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No security questions");
      setSecurityQuestions(data.questions ?? []);
      setSqAnswers(new Array((data.questions ?? []).length).fill(""));
      setStep("questions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load questions");
    } finally {
      setSubmitting(false);
    }
  };

  const verifySecurity = async () => {
    if (sqAnswers.some((a) => !a.trim())) {
      setError("Answer all questions");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const answers = securityQuestions.map((q, i) => ({ key: q.key, answer: sqAnswers[i] }));
      const res = await fetch(`${getBaseUrl()}/recovery/verify-security`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sessionToken, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Answers incorrect");
      setStep("reset");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/recovery/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sessionToken, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={step === "done" ? "Password updated" : "Reset password"}
      subtitle={
        step === "identify"
          ? "We'll email a code to verify it's you."
          : step === "otp"
            ? `Enter the code sent to ${maskedDest || "your inbox"}`
            : step === "questions"
              ? "Answer your security questions"
              : step === "reset"
                ? "Choose a new password"
                : "You can sign in with your new password."
      }
      footer={<AuthLink label="Back to login" onPress={() => router.replace("/auth/login")} />}
    >
      {step === "identify" ? (
        <>
          <Text style={styles.label}>Email or phone</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            placeholder="you@email.com"
            placeholderTextColor="#9CA3AF"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AuthPrimaryButton title="Continue" onPress={() => void start()} loading={submitting} disabled={submitting} />
        </>
      ) : null}

      {step === "otp" ? (
        <>
          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="6-digit code"
            placeholderTextColor="#9CA3AF"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AuthPrimaryButton title="Verify code" onPress={() => void verifyOtp()} loading={submitting} disabled={submitting} />
          <AuthLink
            label={resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            onPress={() => void resend()}
          />
          {showAlternate ? (
            <AuthLink label="Use security questions instead" onPress={() => void loadQuestions()} />
          ) : null}
        </>
      ) : null}

      {step === "questions" ? (
        <>
          {securityQuestions.map((q, i) => (
            <View key={q.key}>
              <Text style={styles.label}>{q.text}</Text>
              <TextInput
                style={styles.input}
                value={sqAnswers[i] || ""}
                onChangeText={(v) =>
                  setSqAnswers((prev) => {
                    const next = [...prev];
                    next[i] = v;
                    return next;
                  })
                }
                placeholder="Your answer"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AuthPrimaryButton
            title="Continue"
            onPress={() => void verifySecurity()}
            loading={submitting}
            disabled={submitting}
          />
        </>
      ) : null}

      {step === "reset" ? (
        <>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 6 characters"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="Repeat password"
            placeholderTextColor="#9CA3AF"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AuthPrimaryButton
            title="Update password"
            onPress={() => void resetPassword()}
            loading={submitting}
            disabled={submitting}
          />
        </>
      ) : null}

      {step === "done" ? (
        <Pressable style={styles.done} onPress={() => router.replace("/auth/login")}>
          <Text style={styles.doneText}>Go to login</Text>
        </Pressable>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "700", color: AUTH.muted, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 12,
    color: AUTH.fg,
    marginBottom: 8,
  },
  error: { color: "#DC2626", marginBottom: 8, fontSize: 13 },
  done: {
    height: 48,
    borderRadius: 12,
    backgroundColor: AUTH.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { color: "#fff", fontWeight: "800" },
});
