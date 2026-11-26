/**
 * Restaurant identity verification gate — Passport or ID Card.
 * Submits through existing Market KYC endpoints (DigitalOcean).
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { mapKycToRestaurantVerification } from "@/lib/restaurantAccess";
import {
  fetchKycStatus,
  submitKyc,
  type KycDocType,
  type KycImageAsset,
  type KycInfo,
} from "@/lib/kycApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

type DocChoice = "passport" | "id_card";
type Picked = KycImageAsset & { previewUri: string };

const MAX_BYTES = 8 * 1024 * 1024;

export default function RestaurantVerifyScreen() {
  const { token, user, refreshUser } = useAuth();
  const router = useRouter();
  const [kycInfo, setKycInfo] = useState<KycInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [docChoice, setDocChoice] = useState<DocChoice>("passport");
  const [legalName, setLegalName] = useState(user?.name || "");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuingCountry, setIssuingCountry] = useState("HT");
  const [front, setFront] = useState<Picked | null>(null);
  const [back, setBack] = useState<Picked | null>(null);
  const [selfie, setSelfie] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const verification = mapKycToRestaurantVerification(
    kycInfo?.status ?? user?.kycStatus,
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
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
      void load();
    }, [load]),
  );

  const pick = async (slot: "front" | "back" | "selfie", useCamera: boolean) => {
    setError(null);
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError("Camera permission is required to capture your document.");
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("Photo library permission is required.");
        return;
      }
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.85,
        });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setError("Image must be under 8 MB.");
      return;
    }
    const mime = asset.mimeType || "image/jpeg";
    if (!mime.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    const picked: Picked = {
      uri: asset.uri,
      previewUri: asset.uri,
      name: asset.fileName || `${slot}.jpg`,
      type: mime,
    };
    if (slot === "front") setFront(picked);
    else if (slot === "back") setBack(picked);
    else setSelfie(picked);
  };

  const toKycDocType = (): KycDocType =>
    docChoice === "passport" ? "passport" : "national_id";

  const handleSubmit = async () => {
    if (!token) return;
    if (!legalName.trim()) {
      setError("Enter your full legal name as shown on the document.");
      return;
    }
    if (!front) {
      setError(
        docChoice === "passport"
          ? "Capture or upload the passport photo page."
          : "Capture or upload the front of your ID card.",
      );
      return;
    }
    if (docChoice === "id_card" && !back) {
      setError("ID Card requires both front and back photos.");
      return;
    }
    if (!selfie) {
      setError("A selfie is required for identity verification.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setProgress("Uploading documents…");
    try {
      await submitKyc(
        {
          docType: toKycDocType(),
          document: front,
          selfie,
        },
        { token },
      );
      setProgress(null);
      setKycInfo({ status: "pending" });
      try {
        await refreshUser?.();
      } catch {
        /* optional refresh */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification submit failed");
      setProgress(null);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = verification === "unverified" || verification === "rejected";

  return (
    <RestaurantGate>
      <RestaurantShell
        title="Identity Verification"
        subtitle="Passport or ID Card required to publish a restaurant"
        scroll={false}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {loading ? (
            <ActivityIndicator color={T.accent} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.pad}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>Status</Text>
                <Text style={styles.statusValue}>
                  {verification === "verified"
                    ? "Verified"
                    : verification === "pending_review"
                      ? "Pending review"
                      : verification === "rejected"
                        ? "Rejected"
                        : "Unverified"}
                </Text>
                {verification === "rejected" && kycInfo?.rejectionReason ? (
                  <Text style={styles.rejectReason}>{kycInfo.rejectionReason}</Text>
                ) : null}
                {verification === "pending_review" ? (
                  <Text style={styles.hint}>
                    Your documents are under review. You cannot publish a restaurant until
                    approved.
                  </Text>
                ) : null}
                {verification === "verified" ? (
                  <Pressable
                    style={styles.cta}
                    onPress={() => router.replace("/restaurant/add" as never)}
                  >
                    <Text style={styles.ctaText}>Continue to Add Restaurant</Text>
                  </Pressable>
                ) : null}
              </View>

              {canSubmit ? (
                <>
                  <Text style={styles.section}>Document type</Text>
                  <View style={styles.choiceRow}>
                    {(
                      [
                        { key: "passport", label: "Passport", icon: "book" as const },
                        { key: "id_card", label: "ID Card", icon: "credit-card" as const },
                      ] as const
                    ).map((opt) => (
                      <Pressable
                        key={opt.key}
                        style={[styles.choice, docChoice === opt.key && styles.choiceOn]}
                        onPress={() => setDocChoice(opt.key)}
                      >
                        <Feather
                          name={opt.icon}
                          size={18}
                          color={docChoice === opt.key ? T.forest : T.muted}
                        />
                        <Text
                          style={[
                            styles.choiceText,
                            docChoice === opt.key && styles.choiceTextOn,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.section}>Legal name</Text>
                  <TextInput
                    style={styles.input}
                    value={legalName}
                    onChangeText={setLegalName}
                    placeholder="Full name on document"
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={styles.section}>Document number (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={documentNumber}
                    onChangeText={setDocumentNumber}
                    placeholder="Passport / ID number"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                  />
                  <Text style={styles.section}>Issuing country</Text>
                  <TextInput
                    style={styles.input}
                    value={issuingCountry}
                    onChangeText={setIssuingCountry}
                    placeholder="HT"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="characters"
                    maxLength={2}
                  />

                  <PhotoSlot
                    label={
                      docChoice === "passport" ? "Passport photo page" : "ID Card — Front"
                    }
                    image={front}
                    onCamera={() => void pick("front", true)}
                    onLibrary={() => void pick("front", false)}
                    onClear={() => setFront(null)}
                  />
                  {docChoice === "id_card" ? (
                    <PhotoSlot
                      label="ID Card — Back"
                      image={back}
                      onCamera={() => void pick("back", true)}
                      onLibrary={() => void pick("back", false)}
                      onClear={() => setBack(null)}
                    />
                  ) : null}
                  <PhotoSlot
                    label="Selfie holding document"
                    image={selfie}
                    onCamera={() => void pick("selfie", true)}
                    onLibrary={() => void pick("selfie", false)}
                    onClear={() => setSelfie(null)}
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                  {progress ? <Text style={styles.progress}>{progress}</Text> : null}

                  <Pressable
                    style={[styles.cta, submitting && { opacity: 0.7 }]}
                    disabled={submitting}
                    onPress={() => void handleSubmit()}
                    testID="restaurant-verify-submit"
                  >
                    {submitting ? (
                      <ActivityIndicator color={T.white} />
                    ) : (
                      <Text style={styles.ctaText}>Submit for review</Text>
                    )}
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </RestaurantShell>
    </RestaurantGate>
  );
}

function PhotoSlot({
  label,
  image,
  onCamera,
  onLibrary,
  onClear,
}: {
  label: string;
  image: Picked | null;
  onCamera: () => void;
  onLibrary: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.slot}>
      <Text style={styles.slotLabel}>{label}</Text>
      {image ? (
        <View>
          <Image source={{ uri: image.previewUri }} style={styles.preview} />
          <Pressable style={styles.remove} onPress={onClear}>
            <Feather name="trash-2" size={14} color={T.danger} />
            <Text style={styles.removeText}>Remove / Retake</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.slotActions}>
          <Pressable style={styles.slotBtn} onPress={onCamera}>
            <Feather name="camera" size={16} color={T.forest} />
            <Text style={styles.slotBtnText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.slotBtn} onPress={onLibrary}>
            <Feather name="image" size={16} color={T.forest} />
            <Text style={styles.slotBtnText}>Gallery</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40, gap: 8 },
  statusCard: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 8,
  },
  statusLabel: { fontSize: 11, fontWeight: "700", color: T.muted, letterSpacing: 0.4 },
  statusValue: { fontSize: 18, fontWeight: "800", color: T.ink, marginTop: 4 },
  rejectReason: { marginTop: 8, color: T.danger, fontSize: 13, fontWeight: "600" },
  hint: { marginTop: 8, fontSize: 13, color: T.muted, lineHeight: 18 },
  section: { marginTop: 10, fontSize: 12, fontWeight: "800", color: T.forest },
  input: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: "600",
    color: T.ink,
  },
  choiceRow: { flexDirection: "row", gap: 10 },
  choice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: T.line,
  },
  choiceOn: { borderColor: T.accent, backgroundColor: T.mint },
  choiceText: { fontSize: 13, fontWeight: "700", color: T.muted },
  choiceTextOn: { color: T.forest },
  slot: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginTop: 8,
  },
  slotLabel: { fontSize: 13, fontWeight: "700", color: T.ink, marginBottom: 8 },
  slotActions: { flexDirection: "row", gap: 8 },
  slotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.mint,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  slotBtnText: { fontSize: 12, fontWeight: "700", color: T.forest },
  preview: { width: "100%", height: 160, borderRadius: 10 },
  remove: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  removeText: { color: T.danger, fontWeight: "700", fontSize: 12 },
  error: { color: T.danger, fontWeight: "600", marginTop: 8 },
  progress: { color: T.muted, fontWeight: "600", marginTop: 4 },
  cta: {
    marginTop: 12,
    backgroundColor: T.forest,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: T.white, fontWeight: "800", fontSize: 14 },
});
