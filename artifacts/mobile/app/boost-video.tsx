/**
 * Boost Video — Existing Product / New Product / Video Only
 * + Renew Boost confirmation (idempotent POST /boost/:id/renew)
 */
import { Feather } from "@expo/vector-icons";
import { Audio, ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  ApiError,
  estimateBoost,
  fetchBoostMethods,
  fetchBoosterMeta,
  renewBoost,
  saveBoosterCampaign,
  type BoostEstimate,
  type BoostPlan,
} from "@/lib/boostApi";
import { getApiBase } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { formatMoney } from "@/lib/orderUi";
import { apiRequest } from "@/lib/request";
import { fetchSellerListings } from "@/lib/sellerListingsApi";

type Mode = "existing" | "new" | "video_only";
const MAX_VIDEO_MS = 120_000;

type ListingOption = { id: number; title: string; thumbnail?: string | null; boostVideoUrl?: string | null };

export default function BoostVideoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user, isLoading: authLoading } = useAuth();
  const { country } = useMarketplace();
  const params = useLocalSearchParams<{
    renewBoostId?: string;
    listingId?: string;
    videoUrl?: string;
    title?: string;
    plan?: string;
    budget?: string;
  }>();

  const renewBoostId = params.renewBoostId ? Number(params.renewBoostId) : null;
  const isRenew = !!renewBoostId;

  const [mode, setMode] = useState<Mode>(params.listingId ? "existing" : "video_only");
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [listingId, setListingId] = useState<number | null>(
    params.listingId ? Number(params.listingId) : null,
  );
  const [videoUri, setVideoUri] = useState<string | null>(
    resolveMediaUrl(params.videoUrl) || params.videoUrl || null,
  );
  const [remoteVideoUrl, setRemoteVideoUrl] = useState<string | null>(
    params.videoUrl ? resolveMediaUrl(params.videoUrl) || params.videoUrl : null,
  );
  const [adTitle, setAdTitle] = useState(params.title || "");
  const [plans, setPlans] = useState<BoostPlan[]>([]);
  const [plan, setPlan] = useState(params.plan || "");
  const [budget, setBudget] = useState(params.budget || "10");
  const [estimate, setEstimate] = useState<BoostEstimate | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [communesByDept, setCommunesByDept] = useState<Record<string, string[]>>({});
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedCommunes, setSelectedCommunes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const renewLock = useRef(false);
  const idempotencyKey = useRef(
    `renew-${renewBoostId || "x"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) router.replace("/auth/login");
    }, [authLoading, token, router]),
  );

  useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const methods = await fetchBoostMethods({ token });
        if (cancelled) return;
        setPlans(methods.plans || []);
        if (!plan && methods.plans?.[0]) {
          setPlan(methods.plans[0].id);
          if (!params.budget) setBudget(String(methods.plans[0].basePrice));
        }
        const meta = await fetchBoosterMeta({ token });
        if (cancelled) return;
        setDepartments(meta.haitiDepartments || methods.haitiDepartments || []);
        setCommunesByDept(meta.communesByDepartment || {});
      } catch {
        /* soft */
      }
      if (user?.id) {
        try {
          const rows = await fetchSellerListings(user.id, { token });
          if (!cancelled) {
            setListings(
              rows.map((r) => ({
                id: Number(r.id),
                title: r.title || `Listing #${r.id}`,
                thumbnail: r.images?.[0] ?? null,
                boostVideoUrl: (r as any).boostVideoUrl ?? null,
              })),
            );
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.id]);

  useEffect(() => {
    if (!token || !plan) return;
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void estimateBoost(
        {
          plan,
          budget: budgetNum,
          audience: {
            country: user?.country || country || "Haiti",
            state: selectedDepts[0] || undefined,
            cities: selectedCommunes.length ? selectedCommunes : undefined,
          },
        },
        { token },
      )
        .then((e) => {
          if (!cancelled) setEstimate(e);
        })
        .catch(() => {
          if (!cancelled) setEstimate(null);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, plan, budget, selectedDepts, selectedCommunes, user?.country, country]);

  const accountCountry = user?.country || country || "Haiti";

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to pick a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
      videoMaxDuration: 120,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.duration && asset.duration > MAX_VIDEO_MS) {
      Alert.alert("Too long", "Videos must be 2 minutes or less.");
      return;
    }
    setVideoUri(asset.uri);
    setRemoteVideoUrl(null);
    if (!adTitle) setAdTitle(params.title || "Boost Video");
  };

  const uploadLocalVideo = async (): Promise<string | null> => {
    if (!token || !videoUri) return remoteVideoUrl;
    if (remoteVideoUrl && !videoUri.startsWith("file:")) return remoteVideoUrl;
    if (!videoUri.startsWith("file:") && !videoUri.startsWith("content:")) {
      return resolveMediaUrl(videoUri) || videoUri;
    }

    setUploadPct(0);
    const info = await fetch(videoUri);
    const blob = await info.blob();
    const totalBytes = blob.size;
    if (totalBytes < 1 || totalBytes > 200 * 1024 * 1024) {
      throw new Error("Video size is invalid.");
    }
    const contentType = blob.type || "video/mp4";
    const chunkSize = 5 * 1024 * 1024;
    const totalChunks = Math.ceil(totalBytes / chunkSize);

    const init = await apiRequest<{ uploadId: string }>("/storage/uploads/chunk-init", {
      token,
      method: "POST",
      body: { totalChunks, totalBytes, contentType, purpose: "boost" },
    });
    const uploadId = init.uploadId;
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkSize;
      const chunk = blob.slice(start, start + chunkSize);
      const buf = await chunk.arrayBuffer();
      const res = await fetch(`${getApiBase()}/storage/uploads/chunk/${uploadId}/${index}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType,
        },
        body: buf,
      });
      if (!res.ok) throw new Error(`Chunk ${index + 1} upload failed`);
      setUploadPct(Math.round(((index + 1) / totalChunks) * 90));
    }

    let finalized = await apiRequest<{ status?: string; url?: string }>(
      `/storage/uploads/chunk-finalize/${uploadId}`,
      { token, method: "POST", body: {} },
    );
    if (finalized.status === "complete" && finalized.url) {
      setUploadPct(100);
      setRemoteVideoUrl(finalized.url);
      return finalized.url;
    }
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await apiRequest<{ status?: string; url?: string }>(
        `/storage/uploads/chunk-status/${uploadId}`,
        { token },
      );
      setUploadPct(90 + Math.min(9, i));
      if (status.status === "complete" && status.url) {
        setUploadPct(100);
        setRemoteVideoUrl(status.url);
        return status.url;
      }
      if (status.status === "failed") throw new Error("Video processing failed");
    }
    throw new Error("Video processing timed out");
  };

  const audiencePayload = useMemo(
    () => ({
      country: accountCountry,
      state: selectedDepts.length === 1 ? selectedDepts[0] : selectedDepts.join(",") || undefined,
      cities: selectedCommunes.length ? selectedCommunes : undefined,
      audienceType: "advantage_plus",
    }),
    [accountCountry, selectedDepts, selectedCommunes],
  );

  const onSaveDraft = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const url = await uploadLocalVideo();
      const body: Record<string, unknown> = {
        mode: "draft",
        adFormat: "video",
        adTitle: adTitle.trim() || "Boost Video draft",
        videoUrl: url,
        listingId: mode === "existing" ? listingId : null,
        audience: audiencePayload,
        budget: Number(budget) || 10,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        ctaType: mode === "video_only" ? "message" : "buy_now",
      };
      const saved = await saveBoosterCampaign(body, { token });
      Alert.alert("Draft saved", `Campaign #${saved.boostId} saved.`, [
        { text: "Open drafts", onPress: () => router.push("/my-drafts" as any) },
        { text: "OK" },
      ]);
    } catch (e) {
      Alert.alert("Save draft failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  };

  const onContinue = async () => {
    if (!token) return;
    if (isRenew) {
      setConfirmOpen(true);
      return;
    }
    if (mode === "new") {
      router.push("/sell" as any);
      return;
    }
    if (mode === "existing" && !listingId) {
      Alert.alert("Select a product", "Choose an existing listing to boost.");
      return;
    }
    if (!videoUri && !remoteVideoUrl && mode !== "existing") {
      Alert.alert("Video required", "Pick a video of 2 minutes or less.");
      return;
    }
    setBusy(true);
    try {
      let url = remoteVideoUrl;
      if (videoUri && (videoUri.startsWith("file:") || videoUri.startsWith("content:"))) {
        url = await uploadLocalVideo();
      } else if (mode === "existing" && listingId) {
        const sel = listings.find((l) => l.id === listingId);
        url = url || sel?.boostVideoUrl || null;
      }
      if (!url && mode !== "existing") {
        Alert.alert("Video required", "Upload or select a video first.");
        return;
      }
      const body: Record<string, unknown> = {
        mode: "launch",
        adFormat: "video",
        adTitle: adTitle.trim() || "Boost Video",
        videoUrl: url,
        listingId: mode === "existing" ? listingId : null,
        audience: audiencePayload,
        budget: Number(budget) || 10,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + (plans.find((p) => p.id === plan)?.days || 7) * 86400000)
          .toISOString()
          .slice(0, 10),
        ctaType: mode === "video_only" ? "message" : "buy_now",
      };
      const launched = await saveBoosterCampaign(body, { token });
      Alert.alert("Boost launched", `Status: ${launched.status}`, [
        { text: "My Videos", onPress: () => router.replace("/my-videos" as any) },
        { text: "OK" },
      ]);
    } catch (e) {
      const msg =
        e instanceof ApiError && e.code === "INSUFFICIENT_WALLET"
          ? "Insufficient wallet balance"
          : e instanceof Error
            ? e.message
            : "Try again";
      Alert.alert("Boost failed", msg);
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  };

  const onConfirmRenew = async () => {
    if (!token || !renewBoostId || renewLock.current) return;
    renewLock.current = true;
    setBusy(true);
    try {
      const result = await renewBoost(
        renewBoostId,
        {
          plan: plan || undefined,
          budget: Number(budget) || undefined,
          audience: audiencePayload,
          idempotencyKey: idempotencyKey.current,
        },
        { token },
      );
      setConfirmOpen(false);
      Alert.alert(
        result.idempotent ? "Already renewed" : "Renewed",
        `Status: ${result.status}${result.amountCharged != null ? `\nCharged: ${formatMoney(result.amountCharged)}` : ""}`,
        [{ text: "My Videos", onPress: () => router.replace("/my-videos" as any) }],
      );
    } catch (e) {
      renewLock.current = false;
      Alert.alert(
        "Renew failed",
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Try again",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleDept = (d: string) => {
    setSelectedDepts((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };
  const toggleCommune = (c: string) => {
    setSelectedCommunes((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const communeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of selectedDepts) {
      for (const c of communesByDept[d] || []) set.add(c);
    }
    return Array.from(set);
  }, [selectedDepts, communesByDept]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/videos"))}
          style={styles.iconBtn}
        >
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.brand}>Flexa Market</Text>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/my-listings" as any)}>
          <Feather name="home" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>{isRenew ? "Renew Boost" : "Boost Video"}</Text>
        <Text style={styles.sub}>
          {isRenew
            ? "Renew with the original video already selected. Adjust audience and duration, then confirm."
            : "Turn your video into a sponsored video to reach more shoppers on Flexa Market."}
        </Text>

        <View style={styles.preview}>
          {videoUri || remoteVideoUrl ? (
            <Video
              style={styles.previewVideo}
              source={{ uri: (videoUri || remoteVideoUrl)! }}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping
              useNativeControls
            />
          ) : (
            <Pressable style={styles.previewEmpty} onPress={() => void pickVideo()}>
              <Feather name="video" size={28} color="#94A3B8" />
              <Text style={styles.previewEmptyText}>Tap to add video (max 2 min)</Text>
            </Pressable>
          )}
          {(videoUri || remoteVideoUrl) && !isRenew ? (
            <Pressable style={styles.changeVideo} onPress={() => void pickVideo()}>
              <Text style={styles.changeVideoText}>Change video</Text>
            </Pressable>
          ) : null}
        </View>
        {uploadPct != null ? (
          <Text style={styles.uploadPct}>Upload {uploadPct}%</Text>
        ) : null}

        {!isRenew ? (
          <>
            <Text style={styles.section}>Boost Mode</Text>
            <View style={styles.modeRow}>
              {(
                [
                  { id: "existing", label: "Existing Product", icon: "tag" },
                  { id: "new", label: "New Product", icon: "plus" },
                  { id: "video_only", label: "Video Only", icon: "video" },
                ] as const
              ).map((m) => {
                const active = mode === m.id;
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.modeCard, active && styles.modeCardActive]}
                    onPress={() => setMode(m.id)}
                    testID={`boost-mode-${m.id}`}
                  >
                    <Feather
                      name={m.icon as any}
                      size={14}
                      color={active ? colors.flexaGreen : "#64748B"}
                    />
                    <Text style={[styles.modeText, active && styles.modeTextActive]} numberOfLines={2}>
                      {m.label}
                    </Text>
                    <View style={[styles.radio, active && styles.radioOn]} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {mode === "existing" && !isRenew ? (
          <View style={styles.block}>
            <Text style={styles.section}>Select product</Text>
            {listings.slice(0, 8).map((l) => (
              <Pressable
                key={l.id}
                style={[styles.listingRow, listingId === l.id && styles.listingRowActive]}
                onPress={() => {
                  setListingId(l.id);
                  if (l.boostVideoUrl) {
                    setRemoteVideoUrl(resolveMediaUrl(l.boostVideoUrl) || l.boostVideoUrl);
                    setVideoUri(resolveMediaUrl(l.boostVideoUrl) || l.boostVideoUrl);
                  }
                  if (!adTitle) setAdTitle(l.title);
                }}
              >
                <Text style={styles.listingTitle} numberOfLines={1}>
                  {l.title}
                </Text>
                {listingId === l.id ? <Feather name="check" size={16} color={colors.flexaGreen} /> : null}
              </Pressable>
            ))}
            {!listings.length ? (
              <Text style={styles.hint}>No listings yet — use New Product or Video Only.</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.section}>Title</Text>
        <TextInput
          style={styles.input}
          value={adTitle}
          onChangeText={setAdTitle}
          placeholder="Ad title"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.section}>Audience</Text>
        <View style={styles.audienceCard}>
          <View style={styles.audienceRow}>
            <Feather name="map-pin" size={14} color={colors.flexaGreen} />
            <Text style={styles.audienceCountry}>{accountCountry}</Text>
          </View>
          {accountCountry === "Haiti" && departments.length > 0 ? (
            <>
              <Text style={styles.audienceLabel}>Departments (multi-select)</Text>
              <View style={styles.chipWrap}>
                {departments.map((d) => {
                  const on = selectedDepts.includes(d);
                  return (
                    <Pressable
                      key={d}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => toggleDept(d)}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {communeOptions.length > 0 ? (
                <>
                  <Text style={styles.audienceLabel}>Communes (multi-select)</Text>
                  <View style={styles.chipWrap}>
                    {communeOptions.map((c) => {
                      const on = selectedCommunes.includes(c);
                      return (
                        <Pressable
                          key={c}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => toggleCommune(c)}
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
            <Text style={styles.hint}>Audience defaults to your account country.</Text>
          )}
        </View>

        <Text style={styles.section}>Plan & budget</Text>
        <View style={styles.chipWrap}>
          {plans.map((p) => {
            const on = plan === p.id;
            return (
              <Pressable
                key={p.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => {
                  setPlan(p.id);
                  setBudget(String(p.basePrice));
                }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {p.days}d · {formatMoney(p.basePrice)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={styles.input}
          value={budget}
          onChangeText={setBudget}
          keyboardType="decimal-pad"
          placeholder="Budget USD"
          placeholderTextColor="#94A3B8"
        />
        {estimate ? (
          <Text style={styles.hint}>
            Est. reach {estimate.estimatedReach.toLocaleString()} · payable{" "}
            {formatMoney(estimate.amountPayable)}
          </Text>
        ) : null}

        {confirmOpen ? (
          <View style={styles.confirmBox} testID="renew-confirm">
            <Text style={styles.confirmTitle}>Confirm renewal</Text>
            <Text style={styles.hint}>
              Final cost: {formatMoney(Number(budget) || estimate?.amountPayable || 0)}
            </Text>
            <Text style={styles.hint}>Duration: {plans.find((p) => p.id === plan)?.days || 7} days</Text>
            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void onConfirmRenew()}
              testID="renew-confirm-submit"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Confirm & charge wallet</Text>
              )}
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setConfirmOpen(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void onContinue()}
              testID="boost-continue"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>{isRenew ? "Continue" : "Continue"}</Text>
              )}
            </Pressable>
            {!isRenew ? (
              <Pressable
                style={[styles.secondaryBtn, busy && styles.disabled]}
                disabled={busy}
                onPress={() => void onSaveDraft()}
                testID="boost-save-draft"
              >
                <Text style={styles.secondaryText}>Save Draft</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.flexaGreen },
  header: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  brand: { color: "#fff", fontSize: 14, fontWeight: "700" },
  body: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginTop: 14 },
  sub: { fontSize: 12, color: "#64748B", marginTop: 6, marginBottom: 12, lineHeight: 17 },
  preview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  previewVideo: { width: "100%", height: "100%" },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  previewEmptyText: { color: "#94A3B8", fontSize: 12 },
  changeVideo: { position: "absolute", right: 8, bottom: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  changeVideoText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  uploadPct: { marginTop: 6, fontSize: 12, color: colors.flexaGreen, fontWeight: "700" },
  section: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: "800", color: "#0F172A" },
  modeRow: { flexDirection: "row", gap: 8 },
  modeCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 8,
    gap: 6,
    backgroundColor: "#fff",
  },
  modeCardActive: {
    borderColor: colors.flexaGreen,
    backgroundColor: "rgba(20,108,67,0.08)",
  },
  modeText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  modeTextActive: { color: colors.flexaGreen },
  radio: {
    marginTop: "auto",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignSelf: "flex-end",
  },
  radioOn: { borderColor: colors.flexaGreen, backgroundColor: colors.flexaGreen },
  block: { marginTop: 4 },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  listingRowActive: { backgroundColor: "rgba(20,108,67,0.06)" },
  listingTitle: { flex: 1, fontSize: 13, color: "#0F172A", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  audienceCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
  },
  audienceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  audienceCountry: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  audienceLabel: { marginTop: 10, fontSize: 11, fontWeight: "700", color: "#64748B" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  chipOn: { borderColor: colors.flexaGreen, backgroundColor: "rgba(20,108,67,0.1)" },
  chipText: { fontSize: 11, fontWeight: "600", color: "#475569" },
  chipTextOn: { color: colors.flexaGreen },
  hint: { fontSize: 12, color: "#64748B", marginTop: 6 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: colors.flexaGreen,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: colors.flexaGreen, fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.6 },
  confirmBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.flexaGreen,
    borderRadius: 12,
    padding: 14,
    backgroundColor: "rgba(20,108,67,0.06)",
  },
  confirmTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
});
