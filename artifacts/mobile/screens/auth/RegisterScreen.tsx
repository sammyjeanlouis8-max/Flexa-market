import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Platform,
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
import {
  COUNTRY_TO_ISO,
  getPhoneCountry,
  ISO_TO_COUNTRY,
  PHONE_COUNTRIES,
} from "../../lib/phoneCountries";

type RegisterScreenProps = {
  onSuccess: (token: string) => Promise<void> | void;
  onGoLogin: () => void;
  onOpenWebsite?: (path: string) => void;
  initialPromoCode?: string;
};

export default function RegisterScreen({
  onSuccess,
  onGoLogin,
  onOpenWebsite,
  initialPromoCode = "",
}: RegisterScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [phoneIso, setPhoneIso] = useState("US");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [promoCode, setPromoCode] = useState(initialPromoCode);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
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

  const selectedPhone = getPhoneCountry(phoneIso) ?? PHONE_COUNTRIES[1];

  const openPath = (path: string) => {
    if (onOpenWebsite) {
      onOpenWebsite(path);
      return;
    }
    Linking.openURL(`https://flexamarket.com${path}`).catch(() => {});
  };

  const submit = async () => {
    const next: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const digits = phoneNumber.trim().replace(/[\s\-().]/g, "");

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
    if (digits && !/^[0-9]{6,15}$/.test(digits)) {
      next.phone = "Enter digits only for your national number";
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
    const phone = digits ? `${selectedPhone.dialCode}${digits}` : undefined;
    const result = await registerAccount({
      name: trimmedName,
      email: trimmedEmail,
      password: trimmedPassword,
      country,
      ...(phone ? { phone } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
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

      {/* Web: grid-cols-2 password + confirm */}
      <View style={styles.passwordRow}>
        <View style={styles.passwordCol}>
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
        </View>
        <View style={styles.passwordCol}>
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
        </View>
      </View>
      {!fieldErrors.password && !fieldErrors.confirmPassword ? (
        <Text style={styles.hint}>Password must be at least 6 characters</Text>
      ) : null}

      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>Location & contact</Text>

      <Text style={styles.label}>
        Your Country{" "}
        <Text style={styles.labelHint}>You&apos;ll see listings from your country</Text>
      </Text>
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
        label="City"
        labelHint="(Optional)"
        value={location}
        onChangeText={setLocation}
        placeholder="e.g. Port-au-Prince"
        autoComplete="postal-address-locality"
        testID="input-register-city"
        editable={!loading}
      />
      <Text style={styles.hintBelow}>
        Street address is only needed when you place your first order.
      </Text>

      <Text style={styles.label}>
        Phone <Text style={styles.labelHint}>(Optional)</Text>
      </Text>
      <View style={styles.phoneRow}>
        <Pressable
          testID="select-calling-code"
          onPress={() => setDialOpen(true)}
          style={[styles.input, styles.dialSelect]}
          disabled={loading}
        >
          <Text style={styles.dialText} numberOfLines={1}>
            {selectedPhone.flag} {selectedPhone.dialCode}
          </Text>
          <Feather name="chevron-down" size={16} color={AUTH.muted} />
        </Pressable>
        <View style={styles.phoneInputWrap}>
          <TextInput
            testID="input-phone"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder={selectedPhone.example}
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            editable={!loading}
            style={[styles.input, fieldErrors.phone ? styles.inputError : null]}
          />
        </View>
      </View>
      {fieldErrors.phone ? (
        <Text style={styles.fieldError}>{fieldErrors.phone}</Text>
      ) : null}

      <View style={styles.promoBlock}>
        <Text style={styles.label}>
          <Feather name="gift" size={14} color={AUTH.accent} /> Promo Code{" "}
          <Text style={styles.labelHint}>(Optional)</Text>
        </Text>
        <TextInput
          testID="input-promo"
          value={promoCode}
          onChangeText={(v) => setPromoCode(v.toUpperCase())}
          placeholder="e.g. FXAB1234"
          placeholderTextColor="#9ca3af"
          autoCapitalize="characters"
          maxLength={16}
          editable={!loading}
          style={[styles.input, styles.promoInput]}
        />
        <Text style={styles.hintBelow}>
          Enter a referral or promo code if you have one.
        </Text>
      </View>

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
          <Text style={styles.inlineLink} onPress={() => openPath("/eula")}>
            EULA
          </Text>{" "}
          and{" "}
          <Text style={styles.inlineLink} onPress={() => openPath("/terms")}>
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
                    const iso = COUNTRY_TO_ISO[item.name];
                    if (iso) setPhoneIso(iso);
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

      <Modal
        visible={dialOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDialOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDialOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Calling code</Text>
            <FlatList
              data={[...PHONE_COUNTRIES]}
              keyExtractor={(item) => item.iso}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    setPhoneIso(item.iso);
                    const mapped = ISO_TO_COUNTRY[item.iso];
                    if (mapped) setCountry(mapped);
                    setDialOpen(false);
                  }}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>
                    {item.name} ({item.dialCode})
                  </Text>
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
  labelHint,
  error,
  right,
  style,
  ...inputProps
}: {
  label: string;
  labelHint?: string;
  error?: string;
  right?: ReactNode;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {labelHint ? <Text style={styles.labelHint}> {labelHint}</Text> : null}
      </Text>
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
    fontSize: 14,
    fontWeight: "500",
  },
  labelHint: {
    color: AUTH.muted,
    fontSize: 12,
    fontWeight: "400",
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
  passwordRow: {
    flexDirection: "row",
    gap: 12,
  },
  passwordCol: {
    flex: 1,
    minWidth: 0,
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectValue: {
    color: AUTH.fg,
    fontSize: 16,
    flex: 1,
    minWidth: 0,
  },
  selectPlaceholder: {
    color: "#9ca3af",
    fontSize: 16,
    flex: 1,
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  dialSelect: {
    width: "38%",
    maxWidth: 148,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    gap: 4,
  },
  dialText: {
    color: AUTH.fg,
    fontSize: 14,
    flex: 1,
    minWidth: 0,
  },
  phoneInputWrap: {
    flex: 1,
    minWidth: 0,
  },
  promoBlock: {
    gap: 6,
  },
  promoInput: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: undefined }),
    letterSpacing: 2,
  },
  hint: {
    marginTop: -8,
    color: AUTH.muted,
    fontSize: 12,
  },
  hintBelow: {
    marginTop: -6,
    color: AUTH.muted,
    fontSize: 12,
    lineHeight: 16,
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
    flex: 1,
  },
});
