import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React, { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AuthShell, {
  AUTH,
  AuthPrimaryButton,
} from "../../components/auth/AuthShell";
import { registerAccount } from "../../lib/authApi";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "../../lib/countries";

type RegisterScreenProps = {
  onSuccess: (token: string) => Promise<void> | void;
  onGoLogin: () => void;
  onOpenLegal?: (path: "/eula" | "/terms") => void;
  initialPromoCode?: string;
};

export default function RegisterScreen({
  onSuccess,
  onGoLogin,
  onOpenLegal,
  initialPromoCode = "",
}: RegisterScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [promoCode, setPromoCode] = useState(initialPromoCode);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const countries = useMemo(
    () =>
      SUPPORTED_COUNTRIES.map((c) => ({
        name: c,
        flag: COUNTRY_FLAGS[c] ?? "",
      })),
    [],
  );

  const openLegal = (path: "/eula" | "/terms") => {
    if (onOpenLegal) {
      onOpenLegal(path);
      return;
    }
    void WebBrowser.openBrowserAsync(`https://flexamarket.com${path}`);
  };

  const submit = async () => {
    const next: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const normalizedPhone = phone.trim().replace(/[\s\-().]/g, "");

    if (trimmedName.length < 2) next.name = "Name must be at least 2 characters";
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = "Invalid email address";
    }
    if (trimmedPassword.length < 6) {
      next.password = "Password must be at least 6 characters";
    }
    if (!confirmPassword.trim()) {
      next.confirmPassword = "Please confirm your password";
    } else if (trimmedPassword !== confirmPassword.trim()) {
      next.confirmPassword = "Passwords don't match";
    }
    if (!country) next.country = "Please select your country";
    if (normalizedPhone && !/^\+?[0-9]{8,16}$/.test(normalizedPhone)) {
      next.phone = "Use an international number, e.g. +50934455823";
    }
    if (!eulaAccepted) {
      next.eulaAccepted = "You must accept the EULA and Terms of Service";
    }

    setFieldErrors(next);
    if (Object.keys(next).length) {
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await registerAccount({
      name: trimmedName,
      email: trimmedEmail,
      password: trimmedPassword,
      country,
      ...(normalizedPhone
        ? {
            phone: normalizedPhone.startsWith("+")
              ? normalizedPhone
              : `+${normalizedPhone}`,
          }
        : {}),
      ...(promoCode.trim()
        ? { promoCode: promoCode.trim().toUpperCase() }
        : {}),
      eulaAccepted: true,
    });
    setLoading(false);

    if (!result.ok) {
      const { status, error: msg, field } = result.error;
      if (status >= 500 || status === 0) {
        setError(msg || "Could not connect to server");
        return;
      }
      if (field) {
        setFieldErrors({ [field]: msg });
      } else {
        setError(msg || "Could not create account");
      }
      return;
    }

    await onSuccess(result.data.token);
  };

  return (
    <AuthShell
      title="Create Account"
      subtitle="Join to buy and sell in your country or anywhere in the world."
      footer={
        <Text style={styles.footerMuted}>
          Already have an account?{" "}
          <Text style={styles.footerLink} onPress={onGoLogin}>
            Sign In
          </Text>
        </Text>
      }
    >
      <Text style={styles.sectionLabel}>Your account</Text>

      <Field
        label="Full Name"
        error={fieldErrors.name}
        value={name}
        onChangeText={setName}
        placeholder="Your full name"
        autoComplete="name"
        testID="input-name"
        editable={!loading}
      />

      <Field
        label="Email"
        error={fieldErrors.email}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        testID="input-email"
        editable={!loading}
      />

      <Field
        label="Password"
        error={fieldErrors.password}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="password-new"
        testID="input-password"
        editable={!loading}
        right={
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            <Feather
              name={showPassword ? "eye-off" : "eye"}
              size={18}
              color={AUTH.muted}
            />
          </Pressable>
        }
      />
      <Text style={styles.hint}>Password must be at least 6 characters</Text>

      <Field
        label="Confirm Password"
        error={fieldErrors.confirmPassword}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="••••••••"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        testID="input-confirm-password"
        editable={!loading}
      />

      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>Location & contact</Text>

      <Text style={styles.label}>Country</Text>
      <Pressable
        testID="select-country"
        onPress={() => setCountryOpen(true)}
        style={[styles.input, styles.select, fieldErrors.country ? styles.inputError : null]}
        disabled={loading}
      >
        <Text style={country ? styles.selectValue : styles.selectPlaceholder}>
          {country
            ? `${COUNTRY_FLAGS[country] ?? ""}  ${country}`
            : "Select your country"}
        </Text>
        <Feather name="chevron-down" size={18} color={AUTH.muted} />
      </Pressable>
      {fieldErrors.country ? (
        <Text style={styles.fieldError}>{fieldErrors.country}</Text>
      ) : null}

      <Field
        label="Phone Number (optional)"
        error={fieldErrors.phone}
        value={phone}
        onChangeText={setPhone}
        placeholder="+509..."
        keyboardType="phone-pad"
        testID="input-phone"
        editable={!loading}
      />

      <Field
        label="Promo Code (optional)"
        value={promoCode}
        onChangeText={setPromoCode}
        placeholder="e.g. FXAB1234"
        autoCapitalize="characters"
        testID="input-promo"
        editable={!loading}
      />

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        testID="checkbox-eula"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: eulaAccepted }}
        onPress={() => setEulaAccepted((v) => !v)}
        style={styles.eulaRow}
        disabled={loading}
      >
        <View style={[styles.checkbox, eulaAccepted && styles.checkboxOn]}>
          {eulaAccepted ? <Feather name="check" size={12} color="#fff" /> : null}
        </View>
        <Text style={styles.eulaText}>
          I agree to the{" "}
          <Text style={styles.inlineLink} onPress={() => openLegal("/eula")}>
            EULA
          </Text>{" "}
          and{" "}
          <Text style={styles.inlineLink} onPress={() => openLegal("/terms")}>
            Terms of Service
          </Text>
          .
        </Text>
      </Pressable>
      {fieldErrors.eulaAccepted ? (
        <Text style={styles.fieldError}>{fieldErrors.eulaAccepted}</Text>
      ) : null}

      <AuthPrimaryButton
        testID="button-register"
        title={loading ? "Creating account..." : "Create Account"}
        onPress={submit}
        loading={loading}
        disabled={loading}
      />

      <Modal
        visible={countryOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCountryOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCountryOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select your country</Text>
            <FlatList
              data={countries}
              keyExtractor={(item) => item.name}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    setCountry(item.name);
                    setCountryOpen(false);
                  }}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </AuthShell>
  );
}

function Field({
  label,
  error,
  right,
  style,
  ...inputProps
}: {
  label: string;
  error?: string;
  right?: ReactNode;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor="#9ca3af"
          style={[
            styles.input,
            right ? styles.inputWithRight : null,
            error ? styles.inputError : null,
            style,
          ]}
          {...inputProps}
        />
        {right ? <View style={styles.rightSlot}>{right}</View> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: AUTH.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  field: {
    gap: 6,
  },
  label: {
    color: AUTH.fg,
    fontSize: 13,
    fontWeight: "600",
  },
  inputWrap: {
    position: "relative",
    justifyContent: "center",
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
  inputWithRight: {
    paddingRight: 44,
  },
  inputError: {
    borderColor: "#fca5a5",
  },
  rightSlot: {
    position: "absolute",
    right: 12,
    height: 48,
    justifyContent: "center",
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectValue: {
    color: AUTH.fg,
    fontSize: 16,
  },
  selectPlaceholder: {
    color: "#9ca3af",
    fontSize: 16,
  },
  hint: {
    marginTop: -8,
    color: AUTH.muted,
    fontSize: 12,
  },
  fieldError: {
    color: "#b91c1c",
    fontSize: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AUTH.border,
    marginVertical: 6,
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
  checkbox: {
    width: 20,
    height: 20,
    marginTop: 2,
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
  footerMuted: {
    color: AUTH.muted,
    fontSize: 14,
    textAlign: "center",
  },
  footerLink: {
    color: AUTH.accent,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 27, 51, 0.45)",
  },
  modalSheet: {
    maxHeight: "70%",
    backgroundColor: AUTH.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: AUTH.fg,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AUTH.border,
  },
  countryFlag: {
    fontSize: 22,
  },
  countryName: {
    fontSize: 16,
    color: AUTH.fg,
  },
});
