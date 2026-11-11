/**
 * Native Edit Product — PUT /api/listings/:id + Wasabi image upload.
 * Owner-only; requires ≥1 image; preserves moderation via server.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useAuth } from "@/context/AuthContext";
import { fetchListing } from "@/lib/api";
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  fetchCategories,
  updateListing,
  validateListingDraft,
  type Category,
  type CreateListingInput,
} from "@/lib/sellerApi";
import { pickSystemMedia } from "@/lib/systemMediaPicker";

const CONDITIONS: CreateListingInput["condition"][] = [
  "new",
  "like_new",
  "good",
  "fair",
  "poor",
];

type LocalImage = {
  key: string;
  uri: string;
  remoteUrl?: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  abort?: AbortController;
  error?: string;
};

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const mounted = useRef(true);

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"USD" | "HTG" | "DOP">("USD");
  const [condition, setCondition] = useState<CreateListingInput["condition"]>("good");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [stock, setStock] = useState("1");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (!token || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [listing, cats] = await Promise.all([
          fetchListing(id, { token }),
          fetchCategories({ token }),
        ]);
        if (cancelled) return;
        if (listing.sellerId && user?.id && listing.sellerId !== user.id) {
          Alert.alert("Forbidden", "You can only edit your own listings.");
          router.replace("/my-listings");
          return;
        }
        setCategories(cats);
        setTitle(listing.title || "");
        setDescription(listing.description || "");
        setPrice(String(listing.price ?? ""));
        setCurrency((listing.currency as any) || "USD");
        setCondition((listing.condition as any) || "good");
        setLocation(listing.location || "");
        setCity(listing.city || "");
        setStock(String((listing as any).stockQuantity ?? 1));
        const slug = (listing as any).categorySlug || listing.category;
        const match = cats.find(
          (c) => c.slug === slug || c.name === listing.category || c.name === slug,
        );
        setCategoryId(match?.id ?? cats[0]?.id ?? null);
        const existing = (listing.images || []).map((uri, idx) => ({
          key: `existing-${idx}`,
          uri,
          remoteUrl: uri,
          progress: 100,
          status: "done" as const,
        }));
        setImages(existing);
      } catch (e) {
        if (!cancelled) {
          Alert.alert("Error", e instanceof Error ? e.message : "Could not load listing");
          router.replace("/my-listings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, id, user?.id, router]);

  const doneUrls = useMemo(
    () => images.filter((i) => i.status === "done" && i.remoteUrl).map((i) => i.remoteUrl!),
    [images],
  );

  const uploadOne = async (key: string, uri: string, contentType: string, fileName: string) => {
    if (!token) return;
    const abort = new AbortController();
    setImages((prev) =>
      prev.map((i) => (i.key === key ? { ...i, status: "uploading", progress: 0, abort } : i)),
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

  const onSave = async () => {
    if (!token || !id) return;
    const draft: CreateListingInput = {
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      currency,
      categoryId: categoryId!,
      condition,
      location: location.trim() || city.trim() || "Unknown",
      city: city.trim() || undefined,
      country: user?.country || undefined,
      stockQuantity: stock.trim() ? Number(stock) : 1,
      images: doneUrls,
    };
    const err = validateListingDraft(draft);
    setFieldError(err);
    if (err) return;
    if (images.some((i) => i.status === "uploading")) {
      Alert.alert("Uploading", "Wait for image uploads to finish.");
      return;
    }
    setSaving(true);
    try {
      await updateListing(Number(id), draft, { token });
      Alert.alert("Saved", "Listing updated. Moderation rules still apply.", [
        { text: "OK", onPress: () => router.replace("/my-listings") },
      ]);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not update");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator color="#F97316" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/my-listings"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Edit product</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.section}>Photos (required · max 5)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {images.map((img) => (
            <View key={img.key} style={styles.thumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" />
              {img.status === "uploading" ? (
                <View style={styles.overlay}>
                  <Text style={styles.overlayText}>{img.progress}%</Text>
                </View>
              ) : null}
              <Pressable
                style={styles.remove}
                onPress={() =>
                  setImages((prev) => {
                    const t = prev.find((x) => x.key === img.key);
                    t?.abort?.abort();
                    return prev.filter((x) => x.key !== img.key);
                  })
                }
              >
                <Feather name="x" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {images.length < 5 ? (
            <Pressable style={styles.addThumb} onPress={() => void pickImages()}>
              <Feather name="camera" size={22} color="#F97316" />
            </Pressable>
          ) : null}
        </ScrollView>

        {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} testID="edit-title" />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          multiline
          testID="edit-description"
        />
        <Text style={styles.label}>Price</Text>
        <View style={styles.row}>
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
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          testID="edit-price"
        />
        <Text style={styles.label}>Stock</Text>
        <TextInput
          style={styles.input}
          value={stock}
          onChangeText={setStock}
          keyboardType="number-pad"
          testID="edit-stock"
        />
        <Text style={styles.label}>Condition</Text>
        <View style={styles.wrap}>
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
        <View style={styles.wrap}>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, categoryId === c.id && styles.chipOn]}
              onPress={() => setCategoryId(c.id)}
            >
              <Text style={[styles.chipText, categoryId === c.id && styles.chipTextOn]}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>City</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} />
        <Text style={styles.label}>Location</Text>
        <TextInput style={styles.input} value={location} onChangeText={setLocation} />

        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={onSave}
          disabled={saving}
          testID="btn-save-listing"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save changes</Text>
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
    marginBottom: 8,
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
  section: { fontWeight: "800", color: "#0F172A", marginBottom: 8, marginTop: 4 },
  label: { fontWeight: "700", color: "#334155", marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#0F172A",
    fontSize: 15,
  },
  fieldError: {
    color: "#B91C1C",
    marginTop: 10,
    fontWeight: "600",
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { color: "#475569", fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: "#EA580C" },
  thumbWrap: { width: 88, height: 88, marginRight: 8, borderRadius: 12, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayText: { color: "#fff", fontWeight: "700" },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    padding: 2,
  },
  addThumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDBA74",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: "#F97316",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
