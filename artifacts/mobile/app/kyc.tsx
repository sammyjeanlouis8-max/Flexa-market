import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

type KycStatus = "not_submitted" | "pending" | "approved" | "rejected";

interface KycInfo {
  status: KycStatus;
  rejectionReason?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

export default function KycScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { request } = useApi();

  const [kycInfo, setKycInfo] = useState<KycInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [docPhoto, setDocPhoto] = useState<string | null>(null);
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null);
  const [docType, setDocType] = useState<"national_id" | "passport" | "driving_license">("national_id");

  const fetchKyc = useCallback(async () => {
    try {
      const data = await request<KycInfo>("/kyc/status");
      setKycInfo(data);
    } catch {
      setKycInfo({ status: "not_submitted" });
    }
  }, [request]);

  useEffect(() => {
    setLoading(true);
    fetchKyc().finally(() => setLoading(false));
  }, [fetchKyc]);

  async function pickImage(type: "doc" | "selfie") {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: type === "selfie" ? [1, 1] : [4, 3],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      if (type === "doc") setDocPhoto(result.assets[0].uri);
      else setSelfiePhoto(result.assets[0].uri);
    }
  }

  async function handleSubmit() {
    if (!docPhoto || !selfiePhoto) {
      Alert.alert("Erè", "Ou bezwen telechaje foto dokiman ak selfie ou.");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("docType", docType);
      form.append("document", { uri: docPhoto, name: "document.jpg", type: "image/jpeg" } as any);
      form.append("selfie", { uri: selfiePhoto, name: "selfie.jpg", type: "image/jpeg" } as any);

      await request("/kyc/submit", {
        method: "POST",
        body: form,
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchKyc();
      Alert.alert("Soumèt!", "Demann KYC ou soumèt. Admin pral revize li nan 24 èdtan.");
    } catch (e: any) {
      Alert.alert("Erè", e?.message ?? "Echèk soumisyon. Eseye ankò.");
    } finally {
      setSubmitting(false);
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Verifikasyon Idantite</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Verifikasyon Idantite</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {kycInfo?.status === "approved" ? (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: "#22C55E22" }]}>
              <Feather name="check-circle" size={40} color="#22C55E" />
            </View>
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>Idantite Verifye ✅</Text>
            <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>
              Kont ou verifye. Ou ka fè tout tranzaksyon san limit.
            </Text>
          </View>
        ) : kycInfo?.status === "pending" ? (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: "#F59E0B22" }]}>
              <Feather name="clock" size={40} color="#F59E0B" />
            </View>
            <Text style={[styles.statusTitle, { color: colors.foreground }]}>Annatant Revizyon</Text>
            <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>
              Demann ou soumèt. Admin pral revize li nan 24 èdtan.
            </Text>
            {kycInfo.submittedAt && (
              <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                Soumèt: {new Date(kycInfo.submittedAt).toLocaleDateString("fr-FR")}
              </Text>
            )}
          </View>
        ) : kycInfo?.status === "rejected" ? (
          <View style={[styles.rejectedBanner, { backgroundColor: "#450a0a", borderColor: "#EF444455" }]}>
            <Feather name="x-circle" size={20} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rejTitle, { color: "#EF4444" }]}>Demann Refize</Text>
              {kycInfo.rejectionReason && (
                <Text style={[styles.rejReason, { color: "#FCA5A5" }]}>{kycInfo.rejectionReason}</Text>
              )}
            </View>
          </View>
        ) : null}

        {(kycInfo?.status === "not_submitted" || kycInfo?.status === "rejected") && (
          <>
            <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Verifikasyon idantite obligatwa pou transfè plis pase $500 ak pou gwo tranzaksyon.
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Tip Dokiman</Text>
            <View style={[styles.docTypeRow]}>
              {(["national_id", "passport", "driving_license"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.docTypeBtn, { borderColor: docType === t ? colors.primary : colors.border, backgroundColor: docType === t ? colors.primary + "22" : colors.card }]}
                  onPress={() => setDocType(t)}
                >
                  <Text style={[styles.docTypeText, { color: docType === t ? colors.primary : colors.mutedForeground }]}>
                    {t === "national_id" ? "CIN" : t === "passport" ? "Paspo" : "Lisans"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Foto Dokiman</Text>
            <Pressable
              style={[styles.photoBox, { backgroundColor: colors.card, borderColor: docPhoto ? colors.primary : colors.border }]}
              onPress={() => pickImage("doc")}
            >
              {docPhoto ? (
                <Image source={{ uri: docPhoto }} style={styles.photoPreview} contentFit="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Feather name="file" size={28} color={colors.mutedForeground} />
                  <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>
                    Pran foto recto dokiman
                  </Text>
                </View>
              )}
            </Pressable>

            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Selfie Avèk Dokiman</Text>
            <Pressable
              style={[styles.photoBox, { backgroundColor: colors.card, borderColor: selfiePhoto ? colors.primary : colors.border }]}
              onPress={() => pickImage("selfie")}
            >
              {selfiePhoto ? (
                <Image source={{ uri: selfiePhoto }} style={styles.photoPreview} contentFit="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Feather name="camera" size={28} color={colors.mutedForeground} />
                  <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>
                    Selfie ou ak dokiman ou nan men ou
                  </Text>
                </View>
              )}
            </Pressable>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: (!docPhoto || !selfiePhoto || submitting) ? colors.muted : colors.primary }]}
              onPress={handleSubmit}
              disabled={!docPhoto || !selfiePhoto || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="send" size={18} color="#fff" />
                  <Text style={styles.submitText}>Soumèt pou Verifikasyon</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 4 },
  statusCard: { alignItems: "center", padding: 32, gap: 12 },
  statusIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  statusTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  statusSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rejectedBanner: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  rejTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rejReason: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  sectionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 16, marginBottom: 8 },
  docTypeRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  docTypeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10, borderWidth: 1.5 },
  docTypeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  photoBox: { height: 180, borderRadius: 14, borderWidth: 2, borderStyle: "dashed", overflow: "hidden", marginBottom: 4 },
  photoPreview: { flex: 1 },
  photoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  photoHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 20 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 24, height: 54, borderRadius: 14 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
