/**
 * Native Sell — create listing with Wasabi image uploads (progress + cancel).
 * Requires ≥1 image. Uses POST /api/listings.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
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
import { useAuth } from "@/context/AuthContext";
import {
  loadVideoUploadSession,
  uploadChunkedVideo,
} from "@/lib/chunkedVideoUpload";
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  clearSellDraft,
  loadSellDraft,
  saveSellDraft,
} from "@/lib/sellDrafts";
import {
  createListing,
  fetchCategories,
  validateListingDraftFields,
  type Category,
  type CreateListingInput,
  type FieldErrors,
} from "@/lib/sellerApi";
import { pickSystemMedia } from "@/lib/systemMediaPicker";

const CONDITIONS: CreateListingInput["condition"][] = [
  "new",
  "like_new",
  "good",
  "fair",
  "poor",
];

const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "One size"];
const COLOR_PRESETS = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Brown", "Other"];

type LocalImage = {
  key: string;
  uri: string;
  remoteUrl?: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  abort?: AbortController;
};

export default function SellTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"USD" | "HTG" | "DOP">("USD");
  const [condition, setCondition] = useState<CreateListingInput["condition"]>("good");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [location, setLocation] = useState(user?.city || user?.location || "");
  const [city, setCity] = useState(user?.city || "");
  const [stock, setStock] = useState("1");
  const [itemSize, setItemSize] = useState("");
  const [sizePreset, setSizePreset] = useState<string | null>(null);
  const [colorPreset, setColorPreset] = useState<string | null>(null);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [listingVideoUrl, setListingVideoUrl] = useState<string | null>(null);
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const [videoAbort, setVideoAbort] = useState<AbortController | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [publishing, setPublishing] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const mounted = useRef(true);

  const composeItemSize = useCallback((size: string | null, color: string | null, custom: string) => {
    const parts = [size, color].filter(Boolean);
    if (custom.trim() && !parts.includes(custom.trim())) parts.push(custom.trim());
    return parts.join(" / ");
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (!token) return;
      void fetchCategories({ token })
        .then((cats) => {
          if (mounted.current) setCategories(cats);
        })
        .catch(() => {});
      if (!draftRestored) {
        void loadSellDraft().then((draft) => {
          if (!mounted.current || !draft) {
            setDraftRestored(true);
            return;
          }
          if (draft.title) setTitle(draft.title);
          if (draft.description) setDescription(draft.description);
          if (draft.price) setPrice(draft.price);
          if (draft.currency) setCurrency(draft.currency);
          if (draft.condition) setCondition(draft.condition as any);
          if (draft.categoryId) setCategoryId(draft.categoryId);
          if (draft.location) setLocation(draft.location);
          if (draft.city) setCity(draft.city);
          if (draft.stock) setStock(draft.stock);
          if (draft.itemSize) setItemSize(draft.itemSize);
          if (draft.listingVideoUrl) setListingVideoUrl(draft.listingVideoUrl);
          if (draft.imageUrls?.length) {
            setImages(
              draft.imageUrls.map((uri, idx) => ({
                key: `draft-${idx}`,
                uri,
                remoteUrl: uri,
                progress: 100,
                status: "done" as const,
              })),
            );
          }
          setDraftRestored(true);
        });
      }
    }, [authLoading, token, router, draftRestored]),
  );

  // Autosave draft (images that finished uploading + form fields).
  useEffect(() => {
    if (!draftRestored) return;
    const timer = setTimeout(() => {
      void saveSellDraft({
        title,
        description,
        price,
        currency,
        condition,
        categoryId,
        location,
        city,
        stock,
        itemSize,
        listingVideoUrl,
        imageUrls: images
          .filter((i) => i.status === "done" && i.remoteUrl)
          .map((i) => i.remoteUrl!),
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [
    draftRestored,
    title,
    description,
    price,
    currency,
    condition,
    categoryId,
    location,
    city,
    stock,
    itemSize,
    listingVideoUrl,
    images,
  ]);

  const doneUrls = useMemo(
    () => images.filter((i) => i.status === "done" && i.remoteUrl).map((i) => i.remoteUrl!),
    [images],
  );

  const pickImages = async () => {
    if (!token) return;
    const result = await pickSystemMedia({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 5 - images.length),
      quality: 0.7,
    });
    if (result.canceled || !result.assets.length) return;

    const next: LocalImage[] = result.assets.slice(0, 5 - images.length).map((a, idx) => ({
      key: `${Date.now()}-${idx}`,
      uri: a.uri,
      progress: 0,
      status: "pending" as const,
    }));
    setImages((prev) => [...prev, ...next].slice(0, 5));

    for (const item of next) {
      const asset = result.assets.find((a) => a.uri === item.uri);
      void uploadOne(item.key, item.uri, asset?.mimeType || "image/jpeg", asset?.fileName || "product.jpg");
    }
  };

  const uploadOne = async (
    key: string,
    uri: string,
    contentType: string,
    fileName: string,
  ) => {
    if (!token) return;
    const abort = new AbortController();
    setImages((prev) =>
      prev.map((i) =>
        i.key === key ? { ...i, status: "uploading", progress: 0, abort } : i,
      ),
    );
    try {
      const { url } = await uploadLocalFile(uri, {
        token,
        contentType,
        fileName,
        signal: abort.signal,
        onProgress: (p) => {
          if (!mounted.current) return;
          setImages((prev) =>
            prev.map((i) => (i.key === key ? { ...i, progress: p.percent } : i)),
          );
        },
      });
      if (!mounted.current) return;
      setImages((prev) =>
        prev.map((i) =>
          i.key === key
            ? { ...i, status: "done", progress: 100, remoteUrl: url, abort: undefined }
            : i,
        ),
      );
    } catch (e) {
      if (!mounted.current) return;
      setImages((prev) =>
        prev.map((i) =>
          i.key === key
            ? {
                ...i,
                status: "error",
                error: e instanceof Error ? e.message : "Upload failed",
                abort: undefined,
              }
            : i,
        ),
      );
    }
  };

  const removeImage = (key: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.key === key);
      target?.abort?.abort();
      return prev.filter((i) => i.key !== key);
    });
  };

  const retryImage = (item: LocalImage) => {
    void uploadOne(item.key, item.uri, "image/jpeg", "product.jpg");
  };

  const onPublish = async () => {
    if (!token || !user) return;
    const draft: CreateListingInput = {
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      currency,
      categoryId: categoryId!,
      condition,
      location: location.trim() || city.trim() || user.country || "Unknown",
      city: city.trim() || undefined,
      country: user.country || undefined,
      stockQuantity: stock.trim() ? Number(stock) : 1,
      itemSize: composeItemSize(sizePreset, colorPreset, itemSize) || null,
      images: doneUrls,
      listingVideoUrl: listingVideoUrl || null,
    };
    const errors = validateListingDraftFields(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      Alert.alert("Check listing", Object.values(errors)[0] || "Fix highlighted fields");
      return;
    }
    if (images.some((i) => i.status === "uploading") || videoPct != null) {
      Alert.alert("Uploading", "Wait for media uploads to finish.");
      return;
    }
    setPublishing(true);
    try {
      await createListing(draft, { token });
      await clearSellDraft();
      Alert.alert("Published", "Your listing was submitted for moderation.", [
        {
          text: "View my listings",
          onPress: () => router.push("/my-listings"),
        },
        { text: "OK" },
      ]);
      setTitle("");
      setDescription("");
      setPrice("");
      setItemSize("");
      setSizePreset(null);
      setColorPreset(null);
      setListingVideoUrl(null);
      setFieldErrors({});
      setImages([]);
    } catch (e) {
      Alert.alert("Publish failed", e instanceof Error ? e.message : "Could not publish");
    } finally {
      setPublishing(false);
    }
  };

  const runListingVideo = async (
    uri: string,
    contentType: string,
    resumeUploadId?: string | null,
  ) => {
    if (!token) return;
    const ac = new AbortController();
    setVideoAbort(ac);
    setVideoPct(0);
    try {
      const { url } = await uploadChunkedVideo(uri, {
        token,
        contentType,
        purpose: "listing",
        resumeUploadId,
        signal: ac.signal,
        onProgress: (p) => {
          if (mounted.current) setVideoPct(p.percent);
        },
      });
      if (mounted.current) setListingVideoUrl(url);
    } catch (e) {
      if (e instanceof Error && /cancelled/i.test(e.message)) {
        Alert.alert("Cancelled", "Video upload cancelled. Resume from Drafts when ready.");
      } else {
        Alert.alert("Video upload failed", e instanceof Error ? e.message : "Error");
      }
    } finally {
      if (mounted.current) {
        setVideoPct(null);
        setVideoAbort(null);
      }
    }
  };

  const pickListingVideo = async () => {
    if (!token) return;
    const existing = await loadVideoUploadSession();
    if (existing?.purpose === "listing" && existing.localUri) {
      Alert.alert("Resume product video?", "An interrupted upload was found on this device.", [
        {
          text: "Start new",
          style: "destructive",
          onPress: () => void pickFreshListingVideo(),
        },
        {
          text: "Resume",
          onPress: () =>
            void runListingVideo(existing.localUri, existing.contentType, existing.uploadId),
        },
      ]);
      return;
    }
    await pickFreshListingVideo();
  };

  const pickFreshListingVideo = async () => {
    if (!token) return;
    const result = await pickSystemMedia({
      mediaTypes: ["videos"],
      quality: 0.7,
      videoMaxDuration: 300,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    await runListingVideo(asset.uri, asset.mimeType || "video/mp4", null);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Sell</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/my-listings")}>
            <Text style={styles.linkText}>My listings</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/drafts")}>
            <Text style={styles.linkText}>Drafts</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.push("/sales")}>
            <Text style={styles.linkText}>Sales</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.section}>Photos (required · max 5)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {images.map((img) => (
            <View key={img.key} style={styles.thumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" />
              {img.status === "uploading" ? (
                <View style={styles.progressOverlay}>
                  <Text style={styles.progressText}>{img.progress}%</Text>
                  <Pressable onPress={() => img.abort?.abort()}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : null}
              {img.status === "error" ? (
                <View style={styles.progressOverlay}>
                  <Pressable onPress={() => retryImage(img)}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable style={styles.remove} onPress={() => removeImage(img.key)}>
                <Feather name="x" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {images.length < 5 ? (
            <Pressable style={styles.addThumb} onPress={() => void pickImages()}>
              <Feather name="camera" size={22} color="#F97316" />
              <Text style={styles.addThumbText}>Add</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Field
          label="Title"
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            setFieldErrors((e) => ({ ...e, title: undefined }));
          }}
          placeholder="What are you selling?"
          error={fieldErrors.title}
        />
        <Field
          label="Description"
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            setFieldErrors((e) => ({ ...e, description: undefined }));
          }}
          placeholder="Condition, details, delivery notes…"
          multiline
          error={fieldErrors.description}
        />
        <Text style={styles.label}>Price</Text>
        {fieldErrors.price ? <Text style={styles.fieldError}>{fieldErrors.price}</Text> : null}
        <View style={styles.priceRow}>
          {(["USD", "HTG", "DOP"] as const).map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, currency === c && styles.chipOn]}
              onPress={() => setCurrency(c)}
            >
              <Text style={[styles.chipText, currency === c && styles.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={(v) => {
            setPrice(v);
            setFieldErrors((e) => ({ ...e, price: undefined }));
          }}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.label}>Condition</Text>
        {fieldErrors.condition ? (
          <Text style={styles.fieldError}>{fieldErrors.condition}</Text>
        ) : null}
        <View style={styles.wrapChips}>
          {CONDITIONS.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, condition === c && styles.chipOn]}
              onPress={() => setCondition(c)}
            >
              <Text style={[styles.chipText, condition === c && styles.chipTextOn]}>
                {c.replace("_", " ")}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Category</Text>
        {fieldErrors.categoryId ? (
          <Text style={styles.fieldError}>{fieldErrors.categoryId}</Text>
        ) : null}
        <View style={styles.wrapChips}>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, categoryId === c.id && styles.chipOn]}
              onPress={() => {
                setCategoryId(c.id);
                setFieldErrors((e) => ({ ...e, categoryId: undefined }));
              }}
            >
              <Text style={[styles.chipText, categoryId === c.id && styles.chipTextOn]}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field label="City" value={city} onChangeText={setCity} placeholder="City" />
        <Field
          label="Location"
          value={location}
          onChangeText={(v) => {
            setLocation(v);
            setFieldErrors((e) => ({ ...e, location: undefined }));
          }}
          placeholder="Neighborhood / area"
          error={fieldErrors.location}
        />
        <Field
          label="Stock quantity"
          value={stock}
          onChangeText={setStock}
          keyboardType="number-pad"
          placeholder="1"
        />

        <Text style={styles.section}>Size / color (single itemSize field)</Text>
        <Text style={styles.hint}>
          Multi-SKU variations are not in the backend API yet. Choices map to one `itemSize` string.
        </Text>
        <Text style={styles.label}>Size</Text>
        <View style={styles.wrapChips}>
          {SIZE_PRESETS.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, sizePreset === s && styles.chipOn]}
              onPress={() => setSizePreset((prev) => (prev === s ? null : s))}
            >
              <Text style={[styles.chipText, sizePreset === s && styles.chipTextOn]}>{s}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Color</Text>
        <View style={styles.wrapChips}>
          {COLOR_PRESETS.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, colorPreset === c && styles.chipOn]}
              onPress={() => setColorPreset((prev) => (prev === c ? null : c))}
            >
              <Text style={[styles.chipText, colorPreset === c && styles.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <Field
          label="Custom note (optional)"
          value={itemSize}
          onChangeText={setItemSize}
          placeholder="e.g. EU 42"
        />

        {fieldErrors.images ? <Text style={styles.fieldError}>{fieldErrors.images}</Text> : null}

        <Text style={styles.section}>Product video (optional · ≤5 min)</Text>
        <Pressable style={styles.videoBtn} onPress={() => void pickListingVideo()}>
          <Text style={styles.videoBtnText}>
            {videoPct != null
              ? `Uploading video… ${videoPct}%`
              : listingVideoUrl
                ? "Video attached · tap to replace"
                : "Upload product video (chunked · resumable)"}
          </Text>
        </Pressable>
        {videoPct != null ? (
          <Pressable style={styles.cancelVideo} onPress={() => videoAbort?.abort()}>
            <Text style={styles.cancelVideoText}>Cancel upload</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.publish, publishing && { opacity: 0.7 }]}
          onPress={() => void onPublish()}
          disabled={publishing}
        >
          {publishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.publishText}>Publish listing</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>
          Listings go through moderation. At least one uploaded image is required. Prohibited
          items are rejected by the server.
        </Text>
      </ScrollView>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  error?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[
          styles.input,
          props.multiline && styles.inputMulti,
          props.error ? styles.inputError : null,
        ]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#94A3B8"
        multiline={props.multiline}
        keyboardType={props.keyboardType}
      />
      {props.error ? <Text style={styles.fieldError}>{props.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  headerActions: { flexDirection: "row", gap: 8 },
  linkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  linkText: { fontWeight: "700", color: "#0F172A", fontSize: 12 },
  section: { fontSize: 14, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginBottom: 6, marginTop: 4 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: "#0F172A",
    fontSize: 15,
    marginBottom: 8,
  },
  inputMulti: { minHeight: 100, paddingTop: 12, textAlignVertical: "top" },
  priceRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  wrapChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  chipOn: { borderColor: "#F97316", backgroundColor: "#FFF7ED" },
  chipText: { fontWeight: "700", color: "#64748B", fontSize: 12 },
  chipTextOn: { color: "#C2410C" },
  thumbWrap: { width: 96, height: 96, marginRight: 10, borderRadius: 12, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  addThumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDBA74",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
  },
  addThumbText: { color: "#C2410C", fontWeight: "700", marginTop: 4, fontSize: 12 },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  progressText: { color: "#fff", fontWeight: "800" },
  cancelText: { color: "#FDBA74", fontWeight: "700", fontSize: 12 },
  retryText: { color: "#fff", fontWeight: "800" },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  publish: {
    marginTop: 12,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  publishText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  hint: { marginTop: 12, fontSize: 12, lineHeight: 17, color: "#64748B" },
  videoBtn: {
    borderWidth: 1,
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  videoBtnText: { color: "#C2410C", fontWeight: "700" },
  cancelVideo: { alignItems: "center", marginBottom: 8 },
  cancelVideoText: { color: "#DC2626", fontWeight: "700" },
  fieldError: { color: "#B91C1C", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  inputError: { borderColor: "#FCA5A5" },
});
