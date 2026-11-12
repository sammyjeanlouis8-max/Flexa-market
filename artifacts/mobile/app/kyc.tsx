/**
 * Native KYC — GET /api/kyc/status + POST /api/kyc/submit (multipart).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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

const DOC_TYPES = [
  { id: "national_id" as const, label: "National ID" },
  { id: "passport" as const, label: "Passport" },
  { id: "driving_license" as const, label: "Driving license" },
];

export default function KycScreen() {
  const router = useRouter();
  const { token, refreshUser, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]["id"]>("national_id");
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const s = await fetchKycStatus({ token });
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load KYC status");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const pick = async (kind: "document" | "selfie") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload KYC documents.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    if (kind === "document") setDocumentUri(result.assets[0].uri);
    else setSelfieUri(result.assets[0].uri);
  };

  const onSubmit = async () => {
    if (!token) return;
    if (!documentUri || !selfieUri) {
      Alert.alert("Photos required", "Upload both ID document and selfie.");
      return;
    }
    setBusy(true);
    try {
      await submitKyc(
        { docType, documentUri, selfieUri },
        { token },
      );
      await refreshUser();
      await load();
      Alert.alert("Submitted", "Your documents are pending review.");
    } catch (e) {
      Alert.alert("Submit failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    status &&
    status.status !== "approved" &&
    status.status !== "pending";

  return (
    <View style={styles.root}>
      <AppHeader title="Identity verification" showBrand={false} showBack showCart={false} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.pad}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>{status?.status || "unknown"}</Text>
            {status?.rejectionReason ? (
              <Text style={styles.reject}>Reason: {status.rejectionReason}</Text>
            ) : null}
            {status?.submittedAt ? (
              <Text style={styles.meta}>Submitted {new Date(status.submittedAt).toLocaleString()}</Text>
            ) : null}
          </View>

          {canSubmit ? (
            <>
              <Text style={styles.label}>Document type</Text>
              <View style={styles.chipRow}>
                {DOC_TYPES.map((d) => (
                  <Pressable
                    key={d.id}
                    style={[styles.chip, docType === d.id && styles.chipOn]}
                    onPress={() => setDocType(d.id)}
                  >
                    <Text style={[styles.chipText, docType === d.id && styles.chipTextOn]}>
                      {d.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>ID document</Text>
              <Pressable style={styles.upload} onPress={() => void pick("document")}>
                {documentUri ? (
                  <Image source={{ uri: documentUri }} style={styles.preview} contentFit="cover" />
                ) : (
                  <>
                    <Feather name="file-text" size={22} color={colors.flexaGreen} />
                    <Text style={styles.uploadText}>Choose document photo</Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.label}>Selfie</Text>
              <Pressable style={styles.upload} onPress={() => void pick("selfie")}>
                {selfieUri ? (
                  <Image source={{ uri: selfieUri }} style={styles.preview} contentFit="cover" />
                ) : (
                  <>
                    <Feather name="camera" size={22} color={colors.flexaGreen} />
                    <Text style={styles.uploadText}>Choose selfie</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={[styles.submit, busy && styles.submitDisabled]}
                disabled={busy}
                onPress={() => void onSubmit()}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Submit for review</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.hint}>
              {status?.status === "approved"
                ? "Your identity is verified."
                : "Your submission is pending review. You cannot resubmit until a decision is made."}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pad: { padding: 16, paddingBottom: 48 },
  error: { color: "#B91C1C", marginBottom: 12 },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 8,
  },
  statusLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  statusValue: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: "800",
    color: colors.flexaGreen,
    textTransform: "capitalize",
  },
  reject: { marginTop: 8, color: "#B91C1C" },
  meta: { marginTop: 6, fontSize: 12, color: "#64748B" },
  label: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "700", color: "#334155" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#fff" },
  upload: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.flexaGreen,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  uploadText: { fontWeight: "700", color: colors.flexaGreen },
  preview: { width: "100%", height: 160 },
  submit: {
    marginTop: 22,
    backgroundColor: colors.flexaGreen,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  hint: { marginTop: 16, color: "#64748B", lineHeight: 20 },
});
