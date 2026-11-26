/**
 * Native KYC — identity verification (document + selfie).
 * Matches marketplace web KYCVerification layout and Creole copy.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";
import {
  fetchKycStatus,
  submitKyc,
  type KycDocType,
  type KycInfo,
  type KycImageAsset,
} from "@/lib/kycApi";

const DOC_OPTIONS: {
  value: KycDocType;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}[] = [
  { value: "national_id", label: "Kat Idantite Nasyonal", icon: "user" },
  { value: "passport", label: "Paspò", icon: "file-text" },
  { value: "driving_license", label: "Lisans Kondwi", icon: "truck" },
];

type PickedImage = KycImageAsset & { previewUri: string };

export default function KycScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();

  const [kycInfo, setKycInfo] = useState<KycInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [docType, setDocType] = useState<KycDocType>("national_id");
  const [docImage, setDocImage] = useState<PickedImage | null>(null);
  const [selfieImage, setSelfieImage] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const info = await fetchKycStatus({ token });
      setKycInfo(info);
    } catch {
      setKycInfo({ status: "not_submitted" });
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

  const pickImage = async (kind: "document" | "selfie") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Tanpri otorize aksè nan galri foto a.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const picked: PickedImage = {
      uri: asset.uri,
      previewUri: asset.uri,
      name: asset.fileName || (kind === "document" ? "document.jpg" : "selfie.jpg"),
      type: asset.mimeType || "image/jpeg",
    };
    if (kind === "document") setDocImage(picked);
    else setSelfieImage(picked);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!token || !docImage || !selfieImage) {
      setError("Tanpri telechaje foto dokiman ak selfie ou a.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitKyc(
        {
          docType,
          document: docImage,
          selfie: selfieImage,
        },
        { token },
      );
      setSuccess(true);
      setKycInfo({ status: "pending" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Soumisyon echwe");
    } finally {
      setSubmitting(false);
    }
  };

  const status = kycInfo?.status ?? "not_submitted";
  const canSubmit = status === "not_submitted" || status === "rejected";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Verifikasyon Idantite</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.flexaOrange} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.shield}>
              <Feather name="shield" size={22} color={colors.flexaGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>Verifikasyon Idantite</Text>
              <Text style={styles.sub}>KYC — Know Your Customer</Text>
            </View>
          </View>

          {status !== "not_submitted" ? (
            <View style={styles.statusCard}>
              {status === "pending" ? (
                <StatusBlock
                  icon="clock"
                  iconBg="#FEF9C3"
                  iconColor="#CA8A04"
                  title="Ap tann revizyon"
                  body="Demann ou a ap revize pa ekip nou an (1-3 jou travay)."
                  badge="An Atant"
                  badgeColor="#CA8A04"
                  badgeBorder="#EAB308"
                />
              ) : null}
              {status === "approved" ? (
                <StatusBlock
                  icon="check-circle"
                  iconBg="#DCFCE7"
                  iconColor="#16A34A"
                  title="Idantite Verifye ✓"
                  body="Ou ka fè tranzaksyon gwo montan san restriksyon."
                  badge="Apwouve"
                  badgeColor="#16A34A"
                  badgeBorder="#22C55E"
                />
              ) : null}
              {status === "rejected" ? (
                <StatusBlock
                  icon="x-circle"
                  iconBg="#FEE2E2"
                  iconColor="#DC2626"
                  title="Demann Rejte"
                  body={kycInfo?.rejectionReason || "Tanpri soumèt dokiman yo ankò."}
                  badge="Rejte"
                  badgeColor="#DC2626"
                  badgeBorder="#EF4444"
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.whyCard}>
            <View style={styles.whyTitleRow}>
              <Feather name="alert-circle" size={16} color={colors.flexaGreen} />
              <Text style={styles.whyTitle}>Poukisa KYC?</Text>
            </View>
            {[
              "Transfè P2P plis pase $500 egzije KYC",
              "Pwoteje kont ou kont fwod ak vol idantite",
              "Debloye limit transfè pou ajan otorize",
            ].map((line) => (
              <View key={line} style={styles.whyRow}>
                <Feather name="chevron-right" size={14} color={colors.flexaGreen} />
                <Text style={styles.whyText}>{line}</Text>
              </View>
            ))}
          </View>

          {success ? (
            <View style={styles.successCard}>
              <View style={[styles.iconCircle, { backgroundColor: "#DCFCE7" }]}>
                <Feather name="check-circle" size={36} color="#16A34A" />
              </View>
              <Text style={styles.successTitle}>Dokiman yo Soumèt ✓</Text>
              <Text style={styles.successBody}>
                Ekip nou an ap revize demann ou a nan 1-3 jou travay. Ou ap resevwa yon
                imel lè verifikasyon an fini.
              </Text>
            </View>
          ) : null}

          {canSubmit && !success ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Soumèt Dokiman ou</Text>

              <Text style={styles.label}>Tip Dokiman</Text>
              <View style={styles.docGrid}>
                {DOC_OPTIONS.map((opt) => {
                  const on = docType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.docTile, on && styles.docTileOn]}
                      onPress={() => setDocType(opt.value)}
                    >
                      <Feather
                        name={opt.icon}
                        size={20}
                        color={on ? colors.flexaGreen : "#64748B"}
                      />
                      <Text style={[styles.docLabel, on && styles.docLabelOn]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>
                Foto Dokiman <Text style={styles.labelMuted}>(devan)</Text>
              </Text>
              <ImagePickerBox
                previewUri={docImage?.previewUri}
                emptyIcon="upload"
                emptyTitle="Klike pou telechaje foto dokiman"
                emptyHint="JPG, PNG — maks 10 MB"
                changeLabel="Chanje foto"
                onPress={() => void pickImage("document")}
              />

              <Text style={styles.label}>
                Selfie <Text style={styles.labelMuted}>(foto ou ak dokiman a)</Text>
              </Text>
              <ImagePickerBox
                previewUri={selfieImage?.previewUri}
                emptyIcon="user"
                emptyTitle="Klike pou telechaje selfie"
                emptyHint="Kenbe dokiman a bò figi ou"
                changeLabel="Chanje selfie"
                onPress={() => void pickImage("selfie")}
              />

              {error ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={16} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.submitBtn,
                  (!docImage || !selfieImage || submitting) && styles.submitDisabled,
                ]}
                disabled={!docImage || !selfieImage || submitting}
                onPress={() => void handleSubmit()}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="shield" size={18} color="#fff" />
                    <Text style={styles.submitText}>Soumèt pou Verifikasyon</Text>
                  </>
                )}
              </Pressable>
              <Text style={styles.privacy}>
                Dokiman ou yo pwoteje epi pa janm pataje ak twazyèm pati.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function StatusBlock({
  icon,
  iconBg,
  iconColor,
  title,
  body,
  badge,
  badgeColor,
  badgeBorder,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  badge: string;
  badgeColor: string;
  badgeBorder: string;
}) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusBody}>{body}</Text>
      </View>
      <View style={[styles.badge, { borderColor: badgeBorder }]}>
        <Text style={[styles.badgeText, { color: badgeColor }]}>{badge}</Text>
      </View>
    </View>
  );
}

function ImagePickerBox({
  previewUri,
  emptyIcon,
  emptyTitle,
  emptyHint,
  changeLabel,
  onPress,
}: {
  previewUri?: string;
  emptyIcon: React.ComponentProps<typeof Feather>["name"];
  emptyTitle: string;
  emptyHint: string;
  changeLabel: string;
  onPress: () => void;
}) {
  if (previewUri) {
    return (
      <Pressable style={styles.previewWrap} onPress={onPress}>
        <Image source={{ uri: previewUri }} style={styles.previewImg} />
        <View style={styles.previewOverlay}>
          <Text style={styles.previewChange}>{changeLabel}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable style={styles.dashBox} onPress={onPress}>
      <Feather name={emptyIcon} size={28} color="#94A3B8" />
      <Text style={styles.dashTitle}>{emptyTitle}</Text>
      <Text style={styles.dashHint}>{emptyHint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    marginTop: 4,
  },
  shield: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  sub: { fontSize: 13, color: "#64748B", marginTop: 2 },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 14,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTitle: { fontWeight: "700", fontSize: 15, color: "#0F172A" },
  statusBody: { fontSize: 13, color: "#64748B", marginTop: 2, lineHeight: 18 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  whyCard: {
    backgroundColor: "#F1F5F9",
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    padding: 16,
    marginBottom: 14,
  },
  whyTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  whyTitle: { fontWeight: "700", fontSize: 15, color: "#0F172A" },
  whyRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 6 },
  whyText: { flex: 1, fontSize: 13, color: "#64748B", lineHeight: 18 },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
  },
  formTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A", marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "700", color: "#0F172A", marginBottom: 8 },
  labelMuted: { fontWeight: "400", color: "#64748B" },
  docGrid: { flexDirection: "row", gap: 8, marginBottom: 16 },
  docTile: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  docTileOn: {
    borderColor: colors.flexaGreen,
    backgroundColor: "#ECFDF5",
  },
  docLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 14,
  },
  docLabelOn: { color: colors.flexaGreen },
  dashBox: {
    height: 140,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
    backgroundColor: "#FAFBFC",
  },
  dashTitle: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  dashHint: { fontSize: 11, color: "#94A3B8" },
  previewWrap: {
    height: 176,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  previewImg: { width: "100%", height: "100%" },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewChange: { color: "#fff", fontWeight: "700", fontSize: 14 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { flex: 1, color: "#DC2626", fontSize: 13, fontWeight: "600" },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  privacy: {
    textAlign: "center",
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 12,
    lineHeight: 16,
  },
  successCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 28,
    alignItems: "center",
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 12,
    marginBottom: 6,
  },
  successBody: {
    textAlign: "center",
    fontSize: 13,
    color: "#64748B",
    lineHeight: 19,
  },
});
