import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Linking,
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
import { loginWithEmail } from "../../lib/authApi";

type LoginScreenProps = {
  onSuccess: (token: string) => Promise<void> | void;
  onGoRegister: () => void;
  onOpenWebsite?: (path: string) => void;
};

export default function LoginScreen({
  onSuccess,
  onGoRegister,
  onOpenWebsite,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    eula?: string;
  }>({});

  const openPath = (path: string) => {
    if (onOpenWebsite) {
      onOpenWebsite(path);
      return;
    }
    Linking.openURL(`https://flexamarket.com${path}`).catch(() => {});
  };

  const submit = async () => {
    const nextField: typeof fieldErrors = {};
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextField.email = "Invalid email address";
    }
    if (!password.trim()) {
      nextField.password = "Please enter your password";
    }
    if (!eulaAccepted) {
      nextField.eula = "You must accept the EULA and Terms of Service";
    }
    setFieldErrors(nextField);
    if (Object.keys(nextField).length) {
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await loginWithEmail({
      email: trimmedEmail,
      password,
      eulaAccepted: true,
    });
    setLoading(false);

    if (!result.ok) {
      const { status, error: msg, field } = result.error;
      if (status >= 500 || status === 0) {
        setError(msg || "Could not connect to server");
        return;
      }
      if (status === 403 || msg.toLowerCase().includes("suspend")) {
        setError("Your account has been suspended. Contact support.");
        return;
      }
      if (field === "email") {
        setFieldErrors({ email: msg });
      } else if (field === "password") {
        setFieldErrors({ password: msg });
      } else {
        setError(msg || "Incorrect email or password");
      }
      return;
    }

    await onSuccess(result.data.token);
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to buy, sell, and chat"
      footer={
        <View style={styles.footerBlock}>
          <AuthLink
            label="Sign in with phone number"
            onPress={() => openPath("/auth/login-phone")}
            testID="link-login-phone"
          />
          <Text style={styles.footerMuted}>
            Don&apos;t have an account?{" "}
            <Text style={styles.footerLink} onPress={onGoRegister}>
              Sign up
            </Text>
          </Text>
        </View>
      }
    >
      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          testID="input-email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
          placeholderTextColor="#9ca3af"
          style={[styles.input, fieldErrors.email ? styles.inputError : null]}
          editable={!loading}
          returnKeyType="next"
        />
        {fieldErrors.email ? (
          <Text style={styles.fieldError}>{fieldErrors.email}</Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Password</Text>
          <AuthLink
            label="Forgot password?"
            onPress={() => openPath("/auth/forgot-password")}
            testID="link-forgot-password"
          />
        </View>
        <View style={styles.passwordWrap}>
          <TextInput
            testID="input-password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            secureTextEntry={!showPassword}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            style={[
              styles.input,
              styles.passwordInput,
              fieldErrors.password ? styles.inputError : null,
            ]}
            editable={!loading}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
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
        {fieldErrors.password ? (
          <Text style={styles.fieldError}>{fieldErrors.password}</Text>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.eulaRow}>
        <Pressable
          testID="checkbox-eula"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: eulaAccepted }}
          accessibilityLabel="I agree to the EULA and Terms of Service"
          onPress={() => setEulaAccepted((v) => !v)}
          hitSlop={8}
          disabled={loading}
          style={styles.checkboxHit}
        >
          <View style={[styles.checkbox, eulaAccepted && styles.checkboxOn]}>
            {eulaAccepted ? <Feather name="check" size={12} color="#fff" /> : null}
          </View>
        </Pressable>
        <Text style={styles.eulaText}>
          I agree to the{" "}
          <Text
            style={styles.inlineLink}
            onPress={() => openPath("/eula")}
            accessibilityRole="link"
          >
            EULA
          </Text>{" "}
          and{" "}
          <Text
            style={styles.inlineLink}
            onPress={() => openPath("/terms")}
            accessibilityRole="link"
          >
            Terms of Service
          </Text>
          .
        </Text>
      </View>
      {fieldErrors.eula ? (
        <Text style={styles.fieldError}>{fieldErrors.eula}</Text>
      ) : null}

      <AuthPrimaryButton
        testID="button-login"
        title={loading ? "Signing in..." : "Sign In"}
        onPress={submit}
        loading={loading}
        disabled={loading}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  label: {
    color: AUTH.fg,
    // Web FormLabel ≈ 14px
    fontSize: 14,
    fontWeight: "500",
  },
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
  inputError: {
    borderColor: "#fca5a5",
  },
  passwordWrap: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    height: 48,
    justifyContent: "center",
  },
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
  },
  eulaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkboxHit: {
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: AUTH.accent,
    borderColor: AUTH.accent,
  },
  eulaText: {
    flex: 1,
    color: AUTH.fg,
    fontSize: 14,
    lineHeight: 20,
  },
  inlineLink: {
    color: AUTH.accent,
    fontWeight: "700",
  },
  footerBlock: {
    alignItems: "center",
    gap: 8,
  },
  footerMuted: {
    color: AUTH.muted,
    fontSize: 14,
    textAlign: "center",
  },
  footerLink: {
    color: AUTH.accent,
    fontWeight: "700",
  },
});
