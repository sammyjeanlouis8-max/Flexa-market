/**
 * Native Boost entry — attach promo video to a listing or create video-only campaign.
 * Paid launch is blocked on Android; iOS can call wallet/initiate APIs.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  createBoosterCampaign,
  createVideoOnlyBoost,
  estimateBoost,
  initiateListingBoost,
  isPaidBoostBlockedOnPlatform,
} from "@/lib/boostApi";
import { uploadLocalFile } from "@/lib/mediaUpload";

export default function BoostScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const params = useLocalSearchParams<{ listingId?: string }>();
  const listingId = Number(params.listingId || 0) || null;

  const [budget, setBudget] = useState("5");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  useEffect(() => {
    if (!token || !listingId) return;
    void estimateBoost({ listingId, budget: Number(budget) || 5 }, { token })
      .then((e) => {
        const price = e.price != null ? Number(e.price) : Number(budget) || 5;
        setEstimate(`Est. ${e.currency || "USD"} ${price.toFixed(2)}`);
      })
      .catch(() => setEstimate(null));
  }, [token, listingId, budget]);

  const pickVideo = async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload a promo video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 0.7,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setVideoUri(asset.uri);
    setVideoUrl(null);
    setUploadError(null);
    await uploadVideo(asset.uri, asset.mimeType || "video/mp4", asset.fileName || "boost.mp4");
  };

  const uploadVideo = async (uri: string, contentType: string, fileName: string) => {
    if (!token) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      const { url } = await uploadLocalFile(uri, {
        token,
        contentType,
        fileName,
        signal: abort.signal,
        onProgress: (p) => setUploadProgress(p.percent),
      });
      setVideoUrl(url);
      setUploadProgress(100);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
      setVideoUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const retryUpload = () => {
    if (!videoUri) return;
    void uploadVideo(videoUri, "video/mp4", "boost.mp4");
  };

  const saveDraft = async () => {
    if (!token || !videoUrl) {
      Alert.alert("Video required", "Upload a promo video before saving a draft.");
      return;
    }
    setBusy(true);
    try {
      await createBoosterCampaign(
        {
          mode: "draft",
          videoUrl,
          budget: Number(budget) || 5,
          audienceCountry: country,
          listingId: listingId || undefined,
        },
        { token },
      );
      setDraftSaved(true);
      Alert.alert("Draft saved", "Your boost draft is stored. Launch when ready.");
    } catch (e) {
      Alert.alert("Draft failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    if (!token) return;
    if (!videoUrl) {
      Alert.alert("Video required", "Upload a promo video first. Form data is kept for retry.");
      return;
    }
    if (isPaidBoostBlockedOnPlatform()) {
      Alert.alert(
        "Unavailable on Android",
        "Paid boost purchases are blocked on Play Store builds. Save a draft instead, or use iOS / web wallet checkout.",
      );
      return;
    }
    setBusy(true);
    try {
      if (listingId) {
        await initiateListingBoost(
          listingId,
          {
            budget: Number(budget) || 5,
            videoUrl,
            paymentMethod: "wallet",
          },
          { token },
        );
      } else {
        await createVideoOnlyBoost(
          {
            videoUrl,
            budget: Number(budget) || 5,
            audienceCountry: country,
            ctaType: "listing",
          },
          { token },
        );
      }
      Alert.alert("Boost active", "Your campaign is live for the targeted audience.", [
        { text: "My boosts", onPress: () => router.replace("/my-boosts") },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      Alert.alert("Launch failed", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Pressable
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/my-boosts"))}
          >
            <Feather name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.title}>Flexa Boost</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.subtitle}>
          {listingId
            ? `Boost listing #${listingId} with a short promo video.`
            : "Upload a promotional video campaign for your audience."}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Promo video</Text>
          <Pressable style={styles.uploadBtn} onPress={pickVideo} disabled={uploading}>
            <Feather name="video" size={18} color="#F97316" />
            <Text style={styles.uploadText}>
              {videoUrl ? "Replace video" : "Choose video from library"}
            </Text>
          </Pressable>
          {uploading ? (
            <Text style={styles.progress}>Uploading… {Math.round(uploadProgress)}%</Text>
          ) : null}
          {uploadError ? (
            <View style={styles.retryRow}>
              <Text style={styles.error}>{uploadError}</Text>
              <Pressable onPress={retryUpload}>
                <Text style={styles.link}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {videoUrl ? <Text style={styles.ok}>Video ready</Text> : null}
          {draftSaved && !videoUrl ? (
            <Text style={styles.hint}>Draft fields preserved after upload failure.</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Daily budget (USD)</Text>
          <TextInput
            value={budget}
            onChangeText={setBudget}
            keyboardType="decimal-pad"
            style={styles.input}
            placeholder="5"
            placeholderTextColor="#94A3B8"
          />
          {estimate ? <Text style={styles.hint}>{estimate}</Text> : null}
          <Text style={styles.hint}>Audience country: {country}</Text>
        </View>

        {isPaidBoostBlockedOnPlatform() ? (
          <Text style={styles.banner}>
            Paid launch is disabled on Android. You can still draft campaigns and manage analytics.
          </Text>
        ) : null}

        <Pressable
          style={[styles.secondaryBtn, (busy || uploading) && styles.disabled]}
          onPress={saveDraft}
          disabled={busy || uploading}
        >
          <Text style={styles.secondaryBtnText}>Save draft</Text>
        </Pressable>

        <Pressable
          style={[styles.primaryBtn, (busy || uploading) && styles.disabled]}
          onPress={launch}
          disabled={busy || uploading}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {isPaidBoostBlockedOnPlatform() ? "Launch (unavailable)" : "Launch boost"}
            </Text>
          )}
        </Pressable>

        <Pressable style={styles.linkBtn} onPress={() => router.push("/my-boosts")}>
          <Text style={styles.link}>View my boosts</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => router.push("/videos")}>
          <Text style={styles.link}>Open promotional videos</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  subtitle: { color: "#64748B", fontSize: 14, lineHeight: 20, marginBottom: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  label: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#0F172A",
    backgroundColor: "#fff",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  uploadText: { color: "#C2410C", fontWeight: "700" },
  progress: { color: "#64748B", fontSize: 13 },
  ok: { color: "#16A34A", fontWeight: "700", fontSize: 13 },
  error: { color: "#B91C1C", flex: 1, fontSize: 13 },
  retryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  hint: { color: "#64748B", fontSize: 12 },
  banner: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: "#9A3412",
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  secondaryBtnText: { color: "#0F172A", fontWeight: "800" },
  disabled: { opacity: 0.55 },
  linkBtn: { alignItems: "center", paddingVertical: 10 },
  link: { color: "#F97316", fontWeight: "800" },
});
