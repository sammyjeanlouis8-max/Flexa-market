import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AuthShell, {
  AUTH,
  AuthLink,
  AuthPrimaryButton,
} from "../../components/auth/AuthShell";
import {
  getRecoveryQuestions,
  resendRecoveryOtp,
  resetRecoveryPassword,
  startRecovery,
  type RecoveryQuestion,
  verifyRecoveryOtp,
  verifyRecoverySecurity,
} from "../../lib/authApi";

type Step = "identify" | "otp" | "questions" | "reset" | "done";

type Props = {
  onDone: () => void;
  onBackToLogin: () => void;
};

export default function ForgotPasswordScreen({ onDone, onBackToLogin }: Props) {
  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [maskedDest, setMaskedDest] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRemaining, setOtpRemaining] = useState(3);
  const [showAlternate, setShowAlternate] = useState(false);
  const [securityQuestions, setSecurityQuestions] = useState<RecoveryQuestion[]>([]);
  const [sqAnswers, setSqAnswers] = useState<string[]>([]);
  const [sqRemaining, setSqRemaining] = useState(3);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

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
    setLoading(true);
    setError(null);
    const result = await startRecovery(identifier.trim());
    setLoading(false);
    if (!result.ok) {
      if (result.error.status === 403) {
        setError(result.error.error || "Account suspended. Contact support.");
        return;
      }
      setError(result.error.error || "Could not start recovery");
      return;
    }
    setSessionToken(result.data.sessionToken ?? "");
    setMaskedDest(result.data.maskedDestination ?? "");
    setResendCooldown(60);
    setStep("otp");
  };

  const verifyOtp = async () => {
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await verifyRecoveryOtp(sessionToken, otp);
    setLoading(false);
    if (!result.ok) {
      if ((result.error as any).useSecurityQuestions) {
        setShowAlternate(true);
        setError("Too many OTP attempts. Try security questions.");
      } else {
        if (typeof (result.error as any).remaining === "number") {
          setOtpRemaining((result.error as any).remaining);
        }
        setError(result.error.error || "Invalid code");
      }
      return;
    }
    setStep("reset");
  };

  const resend = async () => {
    if (resendCooldown > 0 || !sessionToken) return;
    setLoading(true);
    setError(null);
    const result = await resendRecoveryOtp(sessionToken);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.error || "Could not resend code");
      return;
    }
    setOtp("");
    setOtpRemaining(3);
    setShowAlternate(false);
    setResendCooldown(60);
    if (result.data.maskedDestination) setMaskedDest(result.data.maskedDestination);
  };

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);
    const result = await getRecoveryQuestions(sessionToken);
    setLoading(false);
    if (!result.ok) {
      if ((result.error as any).noQuestions) {
        setError("No security questions on file. Contact support.");
      } else {
        setError(result.error.error || "Could not load questions");
      }
      return;
    }
    const qs = result.data.questions ?? [];
    setSecurityQuestions(qs);
    setSqAnswers(new Array(qs.length).fill(""));
    setStep("questions");
  };

  const verifySecurity = async () => {
    if (sqAnswers.some((a) => !a.trim())) {
      setError("Answer all security questions");
      return;
    }
    setLoading(true);
    setError(null);
    const answers = securityQuestions.map((q, i) => ({
      key: q.key,
      answer: sqAnswers[i],
    }));
    const result = await verifyRecoverySecurity(sessionToken, answers);
    setLoading(false);
    if (!result.ok) {
      if (typeof (result.error as any).remaining === "number") {
        setSqRemaining((result.error as any).remaining);
      }
      if ((result.error as any).locked) {
        setError("Too many attempts. Try again in an hour.");
      } else {
        setError(result.error.error || "Incorrect answers");
      }
      return;
    }
    setStep("reset");
  };

  const resetPassword = async () => {
    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await resetRecoveryPassword(sessionToken, password.trim());
    setLoading(false);
    if (!result.ok) {
      setError(result.error.error || "Could not reset password");
      return;
    }
    setStep("done");
  };

  const title =
    step === "identify"
      ? "Reset password"
      : step === "otp"
        ? "Enter code"
        : step === "questions"
          ? "Security questions"
          : step === "reset"
            ? "New password"
            : "Password updated";

  const subtitle =
    step === "identify"
      ? "We'll email a one-time code to recover your account"
      : step === "otp"
        ? maskedDest
          ? `Code sent to ${maskedDest}`
          : "Check your email for the code"
        : step === "questions"
          ? "Answer the questions you set on your account"
          : step === "reset"
            ? "Choose a new password for Flexa Market"
            : "You can sign in with your new password";

  return (
    <AuthShell
      title={title}
      subtitle={subtitle}
      globeActive={step === "identify" || step === "done"}
      footer={
        <View style={styles.footerBlock}>
          <AuthLink label="Back to sign in" onPress={onBackToLogin} testID="link-back-login" />
        </View>
      }
    >
      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {step === "identify" ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Email or phone</Text>
            <TextInput
              testID="input-recovery-identifier"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={start}
            />
          </View>
          <AuthPrimaryButton
            testID="button-recovery-start"
            title={loading ? "Sending…" : "Send reset code"}
            onPress={start}
            loading={loading}
            disabled={loading}
          />
        </>
      ) : null}

      {step === "otp" ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              testID="input-recovery-otp"
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              placeholder="000000"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={verifyOtp}
            />
            <Text style={styles.hint}>{otpRemaining} attempts remaining</Text>
          </View>
          <AuthPrimaryButton
            testID="button-recovery-verify-otp"
            title={loading ? "Verifying…" : "Verify code"}
            onPress={verifyOtp}
            loading={loading}
            disabled={loading}
          />
          <Pressable
            onPress={resend}
            disabled={loading || resendCooldown > 0}
            style={styles.secondaryLink}
          >
            <Text style={styles.secondaryLinkText}>
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </Text>
          </Pressable>
          {showAlternate ? (
            <Pressable onPress={loadQuestions} disabled={loading} style={styles.secondaryLink}>
              <Text style={styles.secondaryLinkText}>Use security questions</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {step === "questions" ? (
        <>
          {securityQuestions.map((q, i) => (
            <View key={q.key} style={styles.field}>
              <Text style={styles.label}>{q.text}</Text>
              <TextInput
                value={sqAnswers[i] ?? ""}
                onChangeText={(t) =>
                  setSqAnswers((prev) => {
                    const next = [...prev];
                    next[i] = t;
                    return next;
                  })
                }
                autoCapitalize="none"
                style={styles.input}
                editable={!loading}
                placeholder="Your answer"
                placeholderTextColor="#9ca3af"
              />
            </View>
          ))}
          <Text style={styles.hint}>{sqRemaining} attempts remaining</Text>
          <AuthPrimaryButton
            testID="button-recovery-verify-sq"
            title={loading ? "Checking…" : "Continue"}
            onPress={verifySecurity}
            loading={loading}
            disabled={loading}
          />
        </>
      ) : null}

      {step === "reset" ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>New password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                testID="input-recovery-password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={[styles.input, styles.passwordInput]}
                editable={!loading}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Feather
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color={AUTH.muted}
                />
              </Pressable>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              testID="input-recovery-confirm"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={styles.input}
              editable={!loading}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
            />
          </View>
          <AuthPrimaryButton
            testID="button-recovery-reset"
            title={loading ? "Saving…" : "Save new password"}
            onPress={resetPassword}
            loading={loading}
            disabled={loading}
          />
        </>
      ) : null}

      {step === "done" ? (
        <>
          <View style={styles.doneBox}>
            <Feather name="check-circle" size={28} color="#16A34A" />
            <Text style={styles.doneText}>Your password was updated.</Text>
          </View>
          <AuthPrimaryButton
            testID="button-recovery-done"
            title="Sign in"
            onPress={onDone}
          />
        </>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: AUTH.fg, fontSize: 13, fontWeight: "600" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: AUTH.fg,
    backgroundColor: AUTH.white,
  },
  passwordWrap: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 44 },
  eyeBtn: {
    position: "absolute",
    right: 12,
    height: 48,
    justifyContent: "center",
  },
  hint: { color: AUTH.muted, fontSize: 12 },
  errorBox: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { color: "#b91c1c", fontSize: 14 },
  secondaryLink: { alignItems: "center", paddingVertical: 8 },
  secondaryLinkText: { color: AUTH.accent, fontWeight: "700", fontSize: 14 },
  footerBlock: { alignItems: "center" },
  doneBox: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  doneText: { color: AUTH.fg, fontSize: 15, fontWeight: "600" },
});
