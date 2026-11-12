/**
 * Native listing edit — reuses seller APIs + Wasabi upload with retry.
 * Form state is preserved if an upload fails.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { fetchListing } from "@/lib/api";
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  fetchCategories,
  updateListing,
  validateListingDraft,
  type Category,
  type CreateListingInput,
} from "@/lib/sellerApi";

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
};

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Number(id);
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
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [stock, setStock] = useState("1");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

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
    if (!token || !listingId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [listing, cats] = await Promise.all([
          fetchListing(listingId, { token }),
          fetchCategories({ token }),
        ]);
        if (cancelled) return;
        if (user?.id && listing.sellerId && listing.sellerId !== user.id) {
          Alert.alert("Not allowed", "You can only edit your own listings.");
          router.back();
          return;
        }
        setCategories(cats);
        setTitle(listing.title || "");
        setDescription(listing.description || "");
        setPrice(String(listing.price ?? ""));
        setCurrency((listing.currency as any) || "USD");
        setCondition(((listing as any).condition as any) || "good");
        setCategoryId((listing as any).categoryId || null);
        setLocation(listing.location || "");
        setCity(listing.city || "");
        setStock(String(listing.stockQuantity ?? 1));
        setImages(
          (listing.images || []).map((url, idx) => ({
            key: `existing-${idx}`,
            uri: url,
            remoteUrl: url,
            progress: 100,
            status: "done" as const,
          })),
        );
      } catch (e) {
        Alert.alert("Load failed", e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, listingId, user?.id, router]);

  const doneUrls = useMemo(
    () => images.filter((i) => i.status === "done" && i.remoteUrl).map((i) => i.remoteUrl!),
    [images],
  );

  const pickImages = async (fromCamera: boolean) => {
    if (!token) return;
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow camera access to photograph your product.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      await enqueueUploads(result.assets);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to update listing images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 5 - images.length),
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    await enqueueUploads(result.assets);
  };

  const enqueueUploads = async (
    assets: ImagePicker.ImagePickerAsset[],
  ) => {
    const next: LocalImage[] = assets.slice(0, 5 - images.length).map((a, idx) => ({
      key: `${Date.now()}-${idx}`,
      uri: a.uri,
      progress: 0,
      status: "pending" as const,
    }));
    setImages((prev) => [...prev, ...next].slice(0, 5));
    for (const item of next) {
      const asset = assets.find((a) => a.uri === item.uri);
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
                abort: undefined,
              }
            : i,
        ),
      );
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Error",
        [{ text: "OK" }],
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

  const onSave = async () => {
    if (!token) return;
    const draft: Partial<CreateListingInput> = {
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      currency,
      categoryId: categoryId!,
      condition,
      location: location.trim() || city.trim() || user?.country || "Unknown",
      city: city.trim() || undefined,
      country: user?.country || undefined,
      stockQuantity: stock.trim() ? Number(stock) : 1,
      images: doneUrls,
    };
    const err = validateListingDraft(draft);
    if (err) {
      Alert.alert("Check listing", err);
      return;
    }
    if (images.some((i) => i.status === "uploading")) {
      Alert.alert("Uploading", "Wait for image uploads to finish (form data is kept).");
      return;
    }
    setSaving(true);
    try {
      await updateListing(listingId, draft, { token });
      Alert.alert("Saved", "Listing updated.", [
        { text: "OK", onPress: () => router.replace("/my-listings") },
      ]);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#F97316" />
      </View>
    );
  }

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
          <Pressable style={styles.back} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.title}>Edit listing</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.section}>Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {images.map((img) => (
            <View key={img.key} style={styles.thumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" />
              {img.status === "uploading" ? (
                <View style={styles.progressOverlay}>
                  <Text style={styles.progressText}>{Math.round(img.progress)}%</Text>
                </View>
              ) : null}
              {img.status === "error" ? (
                <View style={styles.progressOverlay}>
                  <Pressable onPress={() => uploadOne(img.key, img.uri, "image/jpeg", "product.jpg")}>
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
            <>
              <Pressable style={styles.addThumb} onPress={() => void pickImages(false)}>
                <Feather name="image" size={20} color="#F97316" />
                <Text style={styles.addThumbText}>Library</Text>
              </Pressable>
              <Pressable style={styles.addThumb} onPress={() => void pickImages(true)}>
                <Feather name="camera" size={20} color="#F97316" />
                <Text style={styles.addThumbText}>Camera</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Text style={styles.label}>Price ({currency})</Text>
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
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Condition</Text>
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
        <View style={styles.wrapChips}>
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
        <Text style={styles.label}>Stock</Text>
        <TextInput
          style={styles.input}
          value={stock}
          onChangeText={setStock}
          keyboardType="number-pad"
        />

        <Pressable
          style={[styles.publish, saving && { opacity: 0.7 }]}
          onPress={() => void onSave()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.publishText}>Save changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
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
    marginRight: 10,
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
  },
  progressText: { color: "#fff", fontWeight: "800" },
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
});
