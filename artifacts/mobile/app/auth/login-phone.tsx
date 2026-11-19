/**
 * Phone login — POST /api/auth/send-otp, /auth/verify-otp, /auth/login-phone
 * Note: send/verify-otp handlers may be missing on some API builds (see blockers).
 */
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import AuthShell, {
  AUTH,
  AuthLink,
  AuthPrimaryButton,
} from "@/components/auth/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { getBaseUrl } from "@/context/AuthContext";
import { getOrCreateDeviceId } from "@/lib/authApi";
import { ISO_TO_COUNTRY, PHONE_COUNTRIES, getPhoneCountry } from "@/lib/phoneCountries";

export default function LoginPhoneScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [phoneIso, setPhoneIso] = useState("HT");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [otp, setOtp] = useState("");
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const countryDef = getPhoneCountry(phoneIso)!;
  const countryName = ISO_TO_COUNTRY[phoneIso] ?? countryDef.name;
  const fullPhone = `${countryDef.dialCode}${phoneLocal.replace(/\D/g, "")}`;

  const sendOtp = async () => {
    if (!phoneLocal.trim()) {
      setError("Enter your phone number");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ phone: fullPhone, country: countryName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ||
            (res.status === 404
              ? "Phone OTP is temporarily unavailable on the server. Use email login."
              : `Could not send code (${res.status})`),
        );
      }
      setDevCode(typeof data.devCode === "string" ? data.devCode : null);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndLogin = async () => {
    if (otp.trim().length < 4) {
      setError("Enter the verification code");
      return;
    }
    if (!eulaAccepted) {
      setError("Accept the EULA and Terms to continue");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const verifyRes = await fetch(`${getBaseUrl()}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ phone: fullPhone, country: countryName, code: otp.trim() }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(
          verifyData.error ||
            (verifyRes.status === 404
              ? "Phone verification endpoint unavailable. Use email login."
              : "Invalid code"),
        );
      }
      const phoneToken = verifyData.phoneToken;
      if (!phoneToken) throw new Error("Verification succeeded but no phone token returned");

      const deviceId = await getOrCreateDeviceId();
      const loginRes = await fetch(`${getBaseUrl()}/auth/login-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ phoneToken, eulaAccepted: true, deviceId }),
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) {
        throw new Error(loginData.error || "Phone login failed");
      }
      if (!loginData.token) throw new Error("Login failed");
      await login(loginData.token, loginData.user);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in with phone"
      subtitle="No password needed — we'll text you a code."
      footer={
        <View style={{ gap: 8, alignItems: "center" }}>
          <AuthLink label="Use email instead" onPress={() => router.push("/auth/login")} />
          <AuthLink label="Create an account" onPress={() => router.push("/auth/register")} />
        </View>
      }
    >
      {step === 1 ? (
        <>
          <Text style={styles.label}>Country</Text>
          <View style={styles.isoRow}>
            {PHONE_COUNTRIES.slice(0, 4).map((c) => (
              <Pressable
                key={c.iso}
                style={[styles.isoChip, phoneIso === c.iso && styles.isoOn]}
                onPress={() => setPhoneIso(c.iso)}
              >
                <Text style={styles.isoText}>
                  {c.flag} {c.dialCode}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Phone</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.dial}>{countryDef.dialCode}</Text>
            <TextInput
              style={styles.phoneInput}
              value={phoneLocal}
              onChangeText={setPhoneLocal}
              keyboardType="phone-pad"
              placeholder={countryDef.example}
              placeholderTextColor="#9CA3AF"
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AuthPrimaryButton title="Send code" onPress={() => void sendOtp()} disabled={loading} loading={loading} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>Code sent to {fullPhone}</Text>
          {devCode ? <Text style={styles.dev}>Dev code: {devCode}</Text> : null}
          <Text style={styles.label}>Verification code</Text>
          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={8}
            placeholder="6-digit code"
            placeholderTextColor="#9CA3AF"
          />
          <Pressable style={styles.checkRow} onPress={() => setEulaAccepted((v) => !v)}>
            <View style={[styles.check, eulaAccepted && styles.checkOn]} />
            <Text style={styles.checkText}>
              I accept the EULA and Terms of Service
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push("/legal/eula")}>
            <Text style={styles.legalLink}>Read EULA</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AuthPrimaryButton
            title="Verify & sign in"
            onPress={() => void verifyAndLogin()}
            disabled={loading}
            loading={loading}
          />
          <AuthLink label="Change number" onPress={() => { setStep(1); setError(null); }} />
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "700", color: AUTH.muted, marginBottom: 6, marginTop: 8 },
  isoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  isoChip: {
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  isoOn: { borderColor: AUTH.accent, backgroundColor: "#FFF7ED" },
  isoText: { fontWeight: "700", color: AUTH.fg, fontSize: 12 },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  dial: {
    paddingHorizontal: 12,
    fontWeight: "800",
    color: AUTH.fg,
    backgroundColor: "#F8FAFC",
    height: 48,
    textAlignVertical: "center",
    paddingTop: 14,
  },
  phoneInput: { flex: 1, height: 48, paddingHorizontal: 12, color: AUTH.fg },
  input: {
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 12,
    color: AUTH.fg,
    marginBottom: 8,
  },
  hint: { color: AUTH.muted, marginBottom: 4 },
  dev: { color: AUTH.accent, fontWeight: "700", marginBottom: 8 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: AUTH.border,
  },
  checkOn: { backgroundColor: AUTH.accent, borderColor: AUTH.accent },
  checkText: { flex: 1, color: AUTH.fg, fontSize: 13 },
  legalLink: { color: AUTH.accent, fontWeight: "700", marginBottom: 8 },
  error: { color: "#DC2626", marginBottom: 8, fontSize: 13 },
});
