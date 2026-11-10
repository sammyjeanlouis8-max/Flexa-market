/**
 * Native booster campaign DRAFT builder.
 * mode:"draft" only — paid launch remains blocked on Android.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { createBoosterDraft, fetchBoosterMeta, type BoosterMeta } from "@/lib/boosterApi";
import { uploadChunkedVideo } from "@/lib/chunkedVideoUpload";
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
  const [dept, setDept] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const departments = meta?.haitiDepartments ?? [];
  const communes = useMemo(() => {
    if (!dept || !meta?.communesByDepartment) return [];
    return meta.communesByDepartment[dept] ?? [];
  }, [dept, meta]);

  useEffect(() => {
    if (!token || !user?.id) return;
    void Promise.all([
      fetchBoosterMeta({ token }),
      fetchUserListings(user.id, { token }),
    ])
      .then(([m, ls]) => {
        setMeta(m);
        setListings(ls);
      })
      .catch(() => {});
  }, [token, user?.id]);

  const pickVideo = async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Allow media access to upload a promo video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 0.7,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    setUploading(true);
    setUploadPct(0);
    try {
      const { url } = await uploadChunkedVideo(asset.uri, {
        token,
        contentType: asset.mimeType || "video/mp4",
        purpose: "boost",
        onProgress: (p) => setUploadPct(p.percent),
      });
      setVideoUrl(url);
      Alert.alert("Uploaded", "Promo video uploaded. Save as draft when ready.");
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Error");
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
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
    if (user.country === "Haiti" && !dept) {
      Alert.alert("Audience", "Select a Haiti department for custom targeting.");
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
          audience: {
            country: user.country,
            audienceType: "custom",
            state: dept,
            states: dept ? [dept] : [],
            cities,
          },
        },
        { token },
      );
      Alert.alert("Draft saved", `Campaign #${created.boostId} saved (not paid).`, [
        { text: "View drafts", onPress: () => router.replace("/drafts") },
        { text: "OK" },
      ]);
    } catch (e) {
      Alert.alert("Could not save draft", e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

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
          Draft only. Paid boost checkout remains unavailable on Android (Play policy).
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

        <Text style={styles.label}>Product (optional)</Text>
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
              <Text style={[styles.chipText, listingId === l.id && styles.chipTextOn]} numberOfLines={1}>
                {l.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {user?.country === "Haiti" ? (
          <>
            <Text style={styles.label}>Haiti department</Text>
            <View style={styles.wrap}>
              {departments.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.chip, dept === d && styles.chipOn]}
                  onPress={() => {
                    setDept(d);
                    setCities([]);
                  }}
                >
                  <Text style={[styles.chipText, dept === d && styles.chipTextOn]}>{d}</Text>
                </Pressable>
              ))}
            </View>
            {communes.length > 0 ? (
              <>
                <Text style={styles.label}>Communes (optional)</Text>
                <View style={styles.wrap}>
                  {communes.slice(0, 30).map((c) => {
                    const on = cities.includes(c);
                    return (
                      <Pressable
                        key={c}
                        style={[styles.chip, on && styles.chipOn]}
                        onPress={() =>
                          setCities((prev) =>
                            on ? prev.filter((x) => x !== c) : [...prev, c],
                          )
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
  saveBtn: {
    marginTop: 20,
    backgroundColor: "#F97316",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800" },
});
