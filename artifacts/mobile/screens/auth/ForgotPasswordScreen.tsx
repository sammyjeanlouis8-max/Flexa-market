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
  recoveryGetQuestions,
  recoveryResendOtp,
  recoveryResetPassword,
  recoveryStart,
  recoveryVerifyOtp,
  recoveryVerifySecurity,
  type SecurityQuestion,
} from "../../lib/recoveryApi";

type Step = "identify" | "otp" | "questions" | "reset" | "done";

type Props = {
  onDone: () => void;
  onGoLogin: () => void;
};

export default function ForgotPasswordScreen({ onDone, onGoLogin }: Props) {
  const [step, setStep] = useState<Step>("identify");
  const [identifier, setIdentifier] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [maskedDest, setMaskedDest] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRemaining, setOtpRemaining] = useState(3);
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [sqRemaining, setSqRemaining] = useState(3);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showAlternate, setShowAlternate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devHint, setDevHint] = useState<string | null>(null);

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
    const result = await recoveryStart(identifier);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.error);
      return;
    }
    // Enumeration-safe responses may omit sessionToken — still show OTP step messaging.
    if (!result.data.sessionToken) {
      setError(
        "If an account exists, a recovery code was sent. Check your email and try again if needed.",
      );
      return;
    }
    setSessionToken(result.data.sessionToken);
    setMaskedDest(result.data.maskedDestination ?? "");
    setDevHint(
      typeof result.data.devCode === "string" ? `Dev code: ${result.data.devCode}` : null,
    );
    setResendCooldown(60);
    setStep("otp");
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await recoveryVerifyOtp({ sessionToken, code: otp });
    setLoading(false);
    if (!result.ok) {
      if (result.error.useSecurityQuestions) setShowAlternate(true);
      if (typeof result.error.remaining === "number") {
        setOtpRemaining(result.error.remaining);
      }
      setError(result.error.error);
      return;
    }
    setStep("reset");
  };

  const resend = async () => {
    if (resendCooldown > 0 || !sessionToken) return;
    setLoading(true);
    setError(null);
    const result = await recoveryResendOtp(sessionToken);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.error);
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
    const result = await recoveryGetQuestions(sessionToken);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.error);
      return;
    }
    setQuestions(result.data.questions);
    setAnswers(result.data.questions.map(() => ""));
    setStep("questions");
  };

  const verifySq = async () => {
    if (answers.some((a) => !a.trim())) {
      setError("Answer every security question");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await recoveryVerifySecurity({
      sessionToken,
      answers: questions.map((q, i) => ({ key: q.key, answer: answers[i] })),
    });
    setLoading(false);
    if (!result.ok) {
      if (typeof result.error.remaining === "number") {
        setSqRemaining(result.error.remaining);
      }
      setError(result.error.error);
      return;
    }
    setStep("reset");
  };

  const resetPw = async () => {
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await recoveryResetPassword({ sessionToken, password });
    setLoading(false);
    if (!result.ok) {
      setError(result.error.error);
      return;
    }
    setStep("done");
  };

  const subtitle =
    step === "identify"
      ? "Recover access with a code sent to your email"
      : step === "otp"
        ? maskedDest
          ? `Code sent to ${maskedDest}`
          : "Enter the recovery code"
        : step === "questions"
          ? "Answer your security questions"
          : step === "reset"
            ? "Choose a new password"
            : "Your password was updated";

  return (
    <AuthShell
      title={step === "done" ? "All set" : "Forgot password"}
      subtitle={subtitle}
      footer={
        <View>
          <Text style={styles.footerMuted}>
            Remembered it?{" "}
            <Text style={styles.footerLink} onPress={onGoLogin}>
              Sign in
            </Text>
          </Text>
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {devHint && step === "otp" ? (
        <Text style={styles.devHint}>{devHint}</Text>
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
            />
          </View>
          <AuthPrimaryButton
            title={loading ? "Sending…" : "Send recovery code"}
            onPress={start}
            disabled={loading}
            loading={loading}
            testID="btn-recovery-start"
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
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              editable={!loading}
            />
            <Text style={styles.meta}>Attempts left: {otpRemaining}</Text>
          </View>
          <AuthPrimaryButton
            title={loading ? "Verifying…" : "Verify code"}
            onPress={verifyOtp}
            disabled={loading}
            loading={loading}
            testID="btn-recovery-verify-otp"
          />
          <AuthLink
            label={
              resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend code"
            }
            onPress={resend}
            testID="link-recovery-resend"
          />
          {showAlternate ? (
            <Pressable onPress={loadQuestions} disabled={loading}>
              <Text style={styles.altLink}>Use security questions instead</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {step === "questions" ? (
        <>
          {questions.map((q, i) => (
            <View key={q.key} style={styles.field}>
              <Text style={styles.label}>{q.text}</Text>
              <TextInput
                value={answers[i] ?? ""}
                onChangeText={(t) =>
                  setAnswers((prev) => {
                    const next = [...prev];
                    next[i] = t;
                    return next;
                  })
                }
                autoCapitalize="none"
                style={styles.input}
                editable={!loading}
              />
            </View>
          ))}
          <Text style={styles.meta}>Attempts left: {sqRemaining}</Text>
          <AuthPrimaryButton
            title={loading ? "Checking…" : "Continue"}
            onPress={verifySq}
            disabled={loading}
            loading={loading}
            testID="btn-recovery-verify-sq"
          />
        </>
      ) : null}

      {step === "reset" ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>New password</Text>
            <TextInput
              testID="input-recovery-password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              editable={!loading}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              testID="input-recovery-confirm"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              style={styles.input}
              editable={!loading}
            />
          </View>
          <AuthPrimaryButton
            title={loading ? "Saving…" : "Update password"}
            onPress={resetPw}
            disabled={loading}
            loading={loading}
            testID="btn-recovery-reset"
          />
        </>
      ) : null}

      {step === "done" ? (
        <>
          <Text style={styles.doneBody}>
            You can sign in with your new password.
          </Text>
          <AuthPrimaryButton
            title="Back to sign in"
            onPress={onDone}
            testID="btn-recovery-done"
          />
        </>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: AUTH.fg,
  },
  input: {
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: AUTH.fg,
    backgroundColor: "#fff",
  },
  error: {
    color: "#b91c1c",
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  meta: { color: AUTH.muted, fontSize: 12, marginTop: 4 },
  altLink: {
    marginTop: 14,
    color: AUTH.accent,
    fontWeight: "600",
    textAlign: "center",
  },
  footerMuted: { color: AUTH.muted, textAlign: "center", fontSize: 14 },
  footerLink: { color: AUTH.accent, fontWeight: "700" },
  doneBody: {
    color: AUTH.muted,
    marginBottom: 16,
    lineHeight: 20,
    fontSize: 14,
  },
  devHint: {
    color: "#92400e",
    backgroundColor: "#fff7ed",
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 12,
  },
});
