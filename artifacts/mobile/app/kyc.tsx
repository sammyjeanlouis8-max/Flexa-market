/**
 * Native KYC / seller identity verification.
 * Submits to admin review — never auto-approves.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchKycStatus,
  submitKyc,
  type DocType,
  type KycStatus,
} from "@/lib/kycApi";
import { pickSystemMedia } from "@/lib/systemMediaPicker";

const DOC_TYPES: { id: DocType; label: string }[] = [
  { id: "national_id", label: "National ID" },
  { id: "passport", label: "Passport" },
  { id: "driving_license", label: "Driving license" },
];

export default function KycScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [docType, setDocType] = useState<DocType>("national_id");
  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const s = await fetchKycStatus({ token });
      setStatus(s);
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
    const result = await pickSystemMedia({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    if (kind === "document") setDocumentUri(result.assets[0].uri);
    else setSelfieUri(result.assets[0].uri);
  };

  const onSubmit = async () => {
    if (!token) return;
    if (!documentUri || !selfieUri) {
      Alert.alert("Required", "Upload both ID document and selfie.");
      return;
    }
    setSubmitting(true);
    try {
      await submitKyc(
        { docType, documentUri, selfieUri },
        { token },
      );
      Alert.alert(
        "Submitted",
        "Your documents are pending admin review. You will not be auto-approved.",
      );
      await load();
      setDocumentUri(null);
      setSelfieUri(null);
    } catch (e) {
      Alert.alert("Submit failed", e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    status?.status !== "pending" &&
    status?.status !== "approved" &&
    !!documentUri &&
    !!selfieUri;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{t("sKyc") || "Identity verification"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Application status</Text>
            <Text style={styles.statusValue}>
              {(status?.status || "not_submitted").replace(/_/g, " ")}
            </Text>
            {status?.rejectionReason ? (
              <Text style={styles.reject}>Reason: {status.rejectionReason}</Text>
            ) : null}
            <Text style={styles.note}>
              Seller verification requires admin approval. Country-specific rules still apply.
            </Text>
          </View>

          {status?.status === "approved" ? (
            <Text style={styles.ok}>Your identity is verified.</Text>
          ) : status?.status === "pending" ? (
            <Text style={styles.pending}>Pending review — do not resubmit yet.</Text>
          ) : (
            <>
              <Text style={styles.section}>Document type</Text>
              <View style={styles.row}>
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

              <Text style={styles.section}>ID document</Text>
              <Pressable style={styles.pick} onPress={() => void pick("document")} testID="pick-kyc-doc">
                {documentUri ? (
                  <Image source={{ uri: documentUri }} style={styles.preview} contentFit="cover" />
                ) : (
                  <Text style={styles.pickText}>Choose document photo</Text>
                )}
              </Pressable>

              <Text style={styles.section}>Selfie</Text>
              <Pressable style={styles.pick} onPress={() => void pick("selfie")} testID="pick-kyc-selfie">
                {selfieUri ? (
                  <Image source={{ uri: selfieUri }} style={styles.preview} contentFit="cover" />
                ) : (
                  <Text style={styles.pickText}>Choose selfie photo</Text>
                )}
              </Pressable>

              <Pressable
                style={[styles.btn, (!canSubmit || submitting) && { opacity: 0.6 }]}
                onPress={onSubmit}
                disabled={!canSubmit || submitting}
                testID="btn-kyc-submit"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Submit for review</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A", maxWidth: "70%" },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
    gap: 6,
  },
  statusLabel: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  statusValue: { fontSize: 18, fontWeight: "800", color: "#0F172A", textTransform: "capitalize" },
  reject: { color: "#B91C1C", fontSize: 13 },
  note: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  ok: { color: "#15803D", fontWeight: "700" },
  pending: { color: "#C2410C", fontWeight: "700" },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 8, marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { fontWeight: "700", color: "#475569", fontSize: 12 },
  chipTextOn: { color: "#EA580C" },
  pick: {
    height: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  pickText: { color: "#64748B", fontWeight: "600" },
  preview: { width: "100%", height: "100%" },
  btn: {
    marginTop: 8,
    backgroundColor: "#F97316",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
