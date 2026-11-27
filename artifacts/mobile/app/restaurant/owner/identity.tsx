import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getApiBase } from "@/lib/api";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function OwnerIdentityScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const { rid } = useLocalSearchParams<{ rid?: string }>();
  const restaurantId = Number(rid) || 0;
  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState("national_id");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentFrontKey, setDocumentFrontKey] = useState("");
  const [selfieKey, setSelfieKey] = useState("");
  const [reuseKyc, setReuseKyc] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!restaurantId || !token) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/identity`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          reuseKyc
            ? { reuseMarketKyc: true }
            : {
                legalName: legalName.trim(),
                documentType,
                documentNumber: documentNumber.trim(),
                documentFrontKey: documentFrontKey.trim(),
                selfieKey: selfieKey.trim(),
              },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Identity submit failed");
      setMsg(t("restaurant_identitySubmitted") || "Identity submitted for review");
      setTimeout(() => router.replace(`/restaurant/owner?rid=${restaurantId}` as any), 700);
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantShell
      title={t("restaurant_identityVerification") || "Identity verification"}
      subtitle={t("restaurant_identityVerificationSubtitle") || ""}
    >
      <Text style={styles.note}>{t("restaurant_identityPrivacyBody")}</Text>
      <Pressable style={styles.row} onPress={() => setReuseKyc((v) => !v)}>
        <Text style={{ fontSize: 18 }}>{reuseKyc ? "☑" : "☐"}</Text>
        <Text style={styles.p}>{t("restaurant_reuseMarketKyc") || "Reuse verified Flexa Market KYC"}</Text>
      </Pressable>

      {!reuseKyc ? (
        <View>
          <TextInput value={legalName} onChangeText={setLegalName} placeholder="Legal name" placeholderTextColor={T.muted} style={styles.input} />
          <View style={styles.row}>
            {["national_id", "passport", "drivers_license"].map((d) => (
              <Pressable key={d} style={[styles.chip, documentType === d && styles.chipOn]} onPress={() => setDocumentType(d)}>
                <Text style={[styles.chipText, documentType === d && styles.chipTextOn]}>{d}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={documentNumber} onChangeText={setDocumentNumber} placeholder="Document number" placeholderTextColor={T.muted} style={styles.input} />
          <TextInput
            value={documentFrontKey}
            onChangeText={setDocumentFrontKey}
            placeholder="Document front storage key"
            placeholderTextColor={T.muted}
            style={styles.input}
            autoCapitalize="none"
          />
          <TextInput
            value={selfieKey}
            onChangeText={setSelfieKey}
            placeholder="Selfie storage key"
            placeholderTextColor={T.muted}
            style={styles.input}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            {t("restaurant_identityUploadHint") ||
              "Upload private documents via secure Wasabi keys from the verified upload flow. Keys never appear on your public profile."}
          </Text>
        </View>
      ) : null}

      <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void submit()}>
        {saving ? <ActivityIndicator color={T.white} /> : <Text style={styles.btnText}>{t("restaurant_submitIdentity") || "Submit identity"}</Text>}
      </Pressable>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, color: T.muted, marginBottom: 12, lineHeight: 18 },
  p: { flex: 1, fontSize: 14, color: T.ink, lineHeight: 20 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: T.white,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { fontSize: 11, fontWeight: "800", color: T.ink },
  chipTextOn: { color: T.white },
  hint: { fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 17 },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  msg: { marginTop: 10, color: T.accent, fontWeight: "700" },
});
