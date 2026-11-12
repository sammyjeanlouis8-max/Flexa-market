import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchKycStatus, submitKyc, type KycStatus } from "@/lib/kycApi";

export default function KycScreen() {
  const router = useRouter();
  const { token, refreshUser } = useAuth();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [docType, setDocType] = useState<"national_id" | "passport" | "driving_license">("national_id");
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchKycStatus({ token })
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [token]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Verification" showBrand={false} showBack />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in to verify your account.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pick = async (kind: "doc" | "selfie") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photos to upload KYC documents.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    if (kind === "doc") setDocumentUri(res.assets[0].uri);
    else setSelfieUri(res.assets[0].uri);
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Account Verification" showBrand={false} showBack />
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? <ActivityIndicator color={colors.flexaGreen} /> : null}
        <Text style={styles.status}>Status: {status?.status || "not_submitted"}</Text>
        {status?.rejectionReason ? <Text style={styles.err}>{status.rejectionReason}</Text> : null}
        <Text style={styles.label}>Document type</Text>
        <View style={styles.row}>
          {(["national_id", "passport", "driving_license"] as const).map((t) => (
            <Pressable key={t} style={[styles.chip, docType === t && styles.chipOn]} onPress={() => setDocType(t)}>
              <Text style={[styles.chipText, docType === t && styles.chipTextOn]}>{t.replace("_", " ")}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.secondary} onPress={() => void pick("doc")}>
          <Text style={styles.secondaryText}>{documentUri ? "Document selected" : "Upload document"}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => void pick("selfie")}>
          <Text style={styles.secondaryText}>{selfieUri ? "Selfie selected" : "Upload selfie"}</Text>
        </Pressable>
        <Pressable
          style={styles.btn}
          disabled={busy || !documentUri || !selfieUri}
          onPress={() => {
            if (!documentUri || !selfieUri) return;
            setBusy(true);
            submitKyc({ docType, documentUri, selfieUri }, { token })
              .then(async () => {
                await refreshUser();
                const s = await fetchKycStatus({ token });
                setStatus(s);
                Alert.alert("Submitted", "KYC is under review.");
              })
              .catch((e) => Alert.alert("Submit failed", String(e.message || e)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Submit KYC</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  status: { fontWeight: "800", color: colors.flexaGreen, fontSize: 16 },
  label: { fontWeight: "700", marginTop: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontSize: 12, fontWeight: "700", color: "#334155", textTransform: "capitalize" },
  chipTextOn: { color: "#FFF" },
  secondary: { borderWidth: 1, borderColor: colors.flexaOrange, borderRadius: 12, padding: 12, alignItems: "center" },
  secondaryText: { color: colors.flexaOrange, fontWeight: "800" },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#FFF", fontWeight: "800" },
  msg: { color: "#64748B" },
  err: { color: "#B91C1C" },
});
