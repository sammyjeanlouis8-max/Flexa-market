/**
 * Native booster campaign DRAFT builder.
 * mode:"draft" only — paid launch remains blocked on Android.
 * Persists form fields locally; resumable chunked video upload; local preview.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeVideoPlayer } from "@/components/NativeVideoPlayer";
import { useAuth } from "@/context/AuthContext";
import {
  clearBoostFormDraft,
  loadBoostFormDraft,
  saveBoostFormDraft,
} from "@/lib/boostDrafts";
import { createBoosterDraft, fetchBoosterMeta, type BoosterMeta } from "@/lib/boosterApi";
import { pickSystemMedia } from "@/lib/systemMediaPicker";
import {
  loadVideoUploadSession,
  uploadChunkedVideo,
} from "@/lib/chunkedVideoUpload";
import { fetchUserListings } from "@/lib/sellerApi";
import type { Listing } from "@/lib/api";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function BoostCreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const [meta, setMeta] = useState<BoosterMeta | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingId, setListingId] = useState<number | null>(null);
  const [depts, setDepts] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadAbort, setUploadAbort] = useState<AbortController | null>(null);
  const draftHydrated = useRef(false);

  const departments = meta?.haitiDepartments ?? [];
  const communes = useMemo(() => {
    if (!meta?.communesByDepartment || depts.length === 0) return [];
    const set = new Set<string>();
    for (const d of depts) {
      for (const c of meta.communesByDepartment[d] ?? []) set.add(c);
    }
    return [...set];
  }, [depts, meta]);

  useEffect(() => {
    if (!token || !user?.id) return;
    void Promise.all([
      fetchBoosterMeta({ token }),
      fetchUserListings(user.id, { token }),
      loadBoostFormDraft(),
    ])
      .then(([m, ls, draft]) => {
        setMeta(m);
        setListings(ls);
        if (!draftHydrated.current && draft) {
          draftHydrated.current = true;
          if (draft.title) setTitle(draft.title);
          if (draft.description) setDescription(draft.description);
          if (draft.listingId !== undefined) setListingId(draft.listingId);
          if (draft.depts) setDepts(draft.depts);
          if (draft.cities) setCities(draft.cities);
          if (draft.videoUrl) setVideoUrl(draft.videoUrl);
          if (draft.ageMin) setAgeMin(draft.ageMin);
          if (draft.ageMax) setAgeMax(draft.ageMax);
          if (draft.gender) setGender(draft.gender);
        } else {
          draftHydrated.current = true;
        }
      })
      .catch(() => {
        draftHydrated.current = true;
      });
  }, [token, user?.id]);

  useEffect(() => {
    if (!draftHydrated.current) return;
    void saveBoostFormDraft({
      title,
      description,
      listingId,
      depts,
      cities,
      videoUrl,
      ageMin,
      ageMax,
      gender,
    });
  }, [title, description, listingId, depts, cities, videoUrl, ageMin, ageMax, gender]);

  const runVideoUpload = async (
    uri: string,
    contentType: string,
    resumeUploadId?: string | null,
  ) => {
    if (!token) return;
    setLocalPreviewUri(uri);
    const ac = new AbortController();
    setUploadAbort(ac);
    setUploading(true);
    setUploadPct(0);
    try {
      const { url } = await uploadChunkedVideo(uri, {
        token,
        contentType,
        purpose: "boost",
        resumeUploadId,
        signal: ac.signal,
        onProgress: (p) => setUploadPct(p.percent),
      });
      setVideoUrl(url);
      Alert.alert("Uploaded", "Promo video uploaded. Save as draft when ready.");
    } catch (e) {
      if (e instanceof Error && /cancelled/i.test(e.message)) {
        Alert.alert("Cancelled", "Upload cancelled. You can resume from Drafts later.");
      } else {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Error");
      }
    } finally {
      setUploading(false);
      setUploadPct(null);
      setUploadAbort(null);
    }
  };

  const pickVideo = async () => {
    if (!token) return;
    const existing = await loadVideoUploadSession();
    if (existing?.purpose === "boost" && existing.localUri) {
      Alert.alert("Resume upload?", "An interrupted boost video upload was found.", [
        { text: "Start new", style: "destructive", onPress: () => void pickFreshVideo() },
        {
          text: "Resume",
          onPress: () =>
            void runVideoUpload(existing.localUri, existing.contentType, existing.uploadId),
        },
      ]);
      return;
    }
    await pickFreshVideo();
  };

  const pickFreshVideo = async () => {
    if (!token) return;
    const result = await pickSystemMedia({
      mediaTypes: ["videos"],
      quality: 0.7,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    await runVideoUpload(asset.uri, asset.mimeType || "video/mp4", null);
  };

  const onSaveDraft = async () => {
    if (!token || !user?.country) {
      Alert.alert("Sign in", "Seller country is required for audience targeting.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Title required", "Enter a campaign title.");
      return;
    }
    if (user.country === "Haiti" && depts.length === 0) {
      Alert.alert("Audience", "Select at least one Haiti department for custom targeting.");
      return;
    }
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    setSaving(true);
    try {
      const created = await createBoosterDraft(
        {
          adTitle: title.trim(),
          adDescription: description.trim(),
          videoUrl,
          listingId,
          startDate: isoDate(start),
          endDate: isoDate(end),
          ctaType: listingId ? "buy_now" : "none",
          audience: {
            country: user.country,
            audienceType: "custom",
            state: depts[0] ?? null,
            states: depts,
            cities,
            ageMin,
            ageMax,
            gender,
          },
        },
        { token },
      );
      await clearBoostFormDraft();
      setTitle("");
      setDescription("");
      setListingId(null);
      setDepts([]);
      setCities([]);
      setVideoUrl(null);
      setLocalPreviewUri(null);
      Alert.alert("Draft saved", `Campaign #${created.boostId} saved (not paid).`, [
        { text: "View campaigns", onPress: () => router.replace("/my-boosts") },
        { text: "OK" },
      ]);
    } catch (e) {
      Alert.alert("Could not save draft", e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const previewUri = videoUrl || localPreviewUri;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/boost"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Campaign draft</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.banner}>
          Draft only. Form fields auto-save locally. Paid boost checkout remains unavailable on
          Android (Play policy).
        </Text>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Campaign title"
          placeholderTextColor="#94A3B8"
          testID="input-campaign-title"
        />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Product (optional · video-only if None)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[styles.chip, listingId == null && styles.chipOn]}
            onPress={() => setListingId(null)}
          >
            <Text style={[styles.chipText, listingId == null && styles.chipTextOn]}>None</Text>
          </Pressable>
          {listings.slice(0, 20).map((l) => (
            <Pressable
              key={l.id}
              style={[styles.chip, listingId === l.id && styles.chipOn]}
              onPress={() => setListingId(l.id)}
            >
              <Text
                style={[styles.chipText, listingId === l.id && styles.chipTextOn]}
                numberOfLines={1}
              >
                {l.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {user?.country === "Haiti" ? (
          <>
            <Text style={styles.label}>Haiti departments (multi-select)</Text>
            <View style={styles.wrap}>
              {departments.map((d) => {
                const on = depts.includes(d);
                return (
                  <Pressable
                    key={d}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => {
                      setDepts((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]));
                      setCities([]);
                    }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>
            {communes.length > 0 ? (
              <>
                <Text style={styles.label}>Communes (optional · multi-select)</Text>
                <View style={styles.wrap}>
                  {communes.slice(0, 40).map((c) => {
                    const on = cities.includes(c);
                    return (
                      <Pressable
                        key={c}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() =>
                          setCities((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))
                        }
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>
            Audience country locked to your account country: {user?.country || "—"}
          </Text>
        )}

        <Text style={styles.label}>Age range</Text>
        <View style={styles.wrap}>
          {[18, 25, 35, 45].map((n) => (
            <Pressable
              key={`min-${n}`}
              style={[styles.chip, ageMin === n && styles.chipOn]}
              onPress={() => setAgeMin(n)}
            >
              <Text style={[styles.chipText, ageMin === n && styles.chipTextOn]}>Min {n}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.wrap}>
          {[35, 45, 55, 65].map((n) => (
            <Pressable
              key={`max-${n}`}
              style={[styles.chip, ageMax === n && styles.chipOn]}
              onPress={() => setAgeMax(Math.max(n, ageMin))}
            >
              <Text style={[styles.chipText, ageMax === n && styles.chipTextOn]}>Max {n}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Gender</Text>
        <View style={styles.wrap}>
          {(["all", "male", "female"] as const).map((g) => (
            <Pressable
              key={g}
              style={[styles.chip, gender === g && styles.chipOn]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.chipText, gender === g && styles.chipTextOn]}>{g}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Promo video (≤120s for boost)</Text>
        <Pressable
          style={styles.videoBtn}
          onPress={() => void pickVideo()}
          disabled={uploading}
          testID="btn-upload-boost-video"
        >
          {uploading ? (
            <Text style={styles.videoText}>Uploading… {uploadPct ?? 0}%</Text>
          ) : (
            <Text style={styles.videoText}>
              {videoUrl ? "Video uploaded · tap to replace" : "Select & upload video"}
            </Text>
          )}
        </Pressable>
        {uploading ? (
          <Pressable
            style={styles.cancelUpload}
            onPress={() => uploadAbort?.abort()}
            testID="btn-cancel-boost-video"
          >
            <Text style={styles.cancelUploadText}>Cancel upload</Text>
          </Pressable>
        ) : null}

        {previewUri ? (
          <View style={styles.preview} testID="boost-video-preview">
            <NativeVideoPlayer
              uri={previewUri}
              title="Preview"
              posterUrl={null}
              autoPlay={false}
            />
          </View>
        ) : null}

        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={onSaveDraft}
          disabled={saving || uploading}
          testID="btn-save-campaign-draft"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save draft (no charge)</Text>
          )}
        </Pressable>
      </ScrollView>
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
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  banner: {
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 12,
    color: "#9A3412",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  label: { fontWeight: "700", color: "#0F172A", marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#0F172A",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginRight: 6,
    marginBottom: 6,
    maxWidth: 180,
  },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { color: "#475569", fontWeight: "700", fontSize: 12 },
  chipTextOn: { color: "#EA580C" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 8 },
  videoBtn: {
    borderWidth: 1,
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  videoText: { color: "#C2410C", fontWeight: "700" },
  cancelUpload: { alignItems: "center", paddingVertical: 10 },
  cancelUploadText: { color: "#DC2626", fontWeight: "700" },
  preview: { marginTop: 12 },
  saveBtn: {
    marginTop: 20,
    backgroundColor: "#F97316",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800" },
});
