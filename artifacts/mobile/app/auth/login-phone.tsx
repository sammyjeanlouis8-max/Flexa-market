/**
 * Native phone login — OpenAPI contract:
 * POST /otp/send {phone,country} → SMS (Twilio) or DEV code
 * POST /otp/verify {phone,country,code} → phoneToken (never withdrawalToken)
 * POST /auth/login-phone {phoneToken,eulaAccepted} → session JWT
 */
import { useRouter } from "expo-router";
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
} from "@/components/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  loginWithPhoneToken,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/phase3mApis";

function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s\-().]/g, "");
  if (!trimmed) return "";
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

export default function LoginPhoneScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Haiti");
  const [code, setCode] = useState("");
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const onSend = async () => {
    setError(null);
    setHint(null);
    setDevCode(null);
    const normalized = normalizePhone(phone);
    if (!/^\+[0-9]{8,16}$/.test(normalized)) {
      setError(t("phoneLoginInvalidPhone"));
      return;
    }
    if (!country.trim()) {
      setError(t("phoneLoginInvalidCountry"));
      return;
    }
    setLoading(true);
    try {
      const res = await sendPhoneOtp({ phone: normalized, country: country.trim() });
      setPhone(normalized);
      if (res.devCode) setDevCode(String(res.devCode));
      setHint(
        res.maskedPhone
          ? t("phoneLoginCodeSent").replace("{phone}", res.maskedPhone)
          : t("phoneLoginCodeSentGeneric"),
      );
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("phoneLoginSendFailed"));
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t("phoneLoginInvalidCode"));
      return;
    }
    if (!eulaAccepted) {
      setError(t("phoneLoginEulaRequired"));
      return;
    }
    setLoading(true);
    try {
      const verified = await verifyPhoneOtp({
        phone: normalizePhone(phone),
        country: country.trim(),
        code: code.trim(),
      });
      const session = await loginWithPhoneToken({
        phoneToken: verified.phoneToken,
        eulaAccepted: true,
      });
      await login(session.token);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("phoneLoginVerifyFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t("phoneLoginTitle")} subtitle={t("phoneLoginSubtitle")}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {devCode ? (
        <Text style={styles.dev} testID="phone-otp-dev-code">
          DEV code: {devCode}
        </Text>
      ) : null}

      {step === "phone" ? (
        <>
          <Text style={styles.label}>{t("phoneLoginPhone")}</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+509XXXXXXXX"
            placeholderTextColor={AUTH.muted}
            keyboardType="phone-pad"
            autoComplete="tel"
            testID="phone-login-phone"
          />
          <Text style={styles.label}>{t("phoneLoginCountry")}</Text>
          <TextInput
            style={styles.input}
            value={country}
            onChangeText={setCountry}
            placeholder="Haiti"
            placeholderTextColor={AUTH.muted}
            testID="phone-login-country"
          />
          <AuthPrimaryButton
            title={loading ? t("phoneLoginSending") : t("phoneLoginSendCode")}
            onPress={() => void onSend()}
            disabled={loading}
            loading={loading}
            testID="phone-login-send"
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>{t("phoneLoginCode")}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={AUTH.muted}
            keyboardType="number-pad"
            maxLength={6}
            testID="phone-login-code"
          />
          <Pressable
            style={styles.eulaRow}
            onPress={() => setEulaAccepted((v) => !v)}
            testID="phone-login-eula"
          >
            <View style={[styles.checkbox, eulaAccepted && styles.checkboxOn]} />
            <Text style={styles.eulaText}>
              {t("phoneLoginEula")}{" "}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL("https://flexamarket.com/terms").catch(() => {})}
              >
                {t("phoneLoginTerms")}
              </Text>
            </Text>
          </Pressable>
          <AuthPrimaryButton
            title={loading ? t("phoneLoginVerifying") : t("phoneLoginVerify")}
            onPress={() => void onVerify()}
            disabled={loading}
            loading={loading}
            testID="phone-login-verify"
          />
          <AuthLink label={t("phoneLoginResend")} onPress={() => void onSend()} />
          <AuthLink
            label={t("phoneLoginBack")}
            onPress={() => {
              setStep("phone");
              setCode("");
              setError(null);
            }}
          />
        </>
      )}

      <AuthLink label={t("phoneLoginEmailInstead")} onPress={() => router.replace("/auth/login")} />
      <Text style={styles.note}>{t("phoneLoginNote")}</Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { color: "#DC2626", fontWeight: "700", marginBottom: 8 },
  hint: { color: "#15803D", fontWeight: "600", marginBottom: 8 },
  dev: {
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    fontWeight: "700",
  },
  label: { color: AUTH.fg, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: AUTH.fg,
    backgroundColor: "#fff",
    marginBottom: 10,
    fontSize: 16,
  },
  eulaRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: AUTH.border,
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: "#F97316", borderColor: "#F97316" },
  eulaText: { flex: 1, color: AUTH.fg, lineHeight: 20 },
  link: { color: "#EA580C", fontWeight: "700" },
  note: { color: AUTH.muted, fontSize: 12, marginTop: 16, lineHeight: 18 },
});
