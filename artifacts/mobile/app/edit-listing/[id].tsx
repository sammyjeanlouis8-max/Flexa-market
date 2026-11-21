/**
 * Native Edit Listing — load via fetchListing / fetchUserListings, save with updateListing.
 * Blocks removing/saving with zero usable product images.
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
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
import { useAuth } from "@/context/AuthContext";
import { fetchListing, type Listing } from "@/lib/api";
import {
  cleanListingImages,
  hasUsableListingImage,
} from "@/lib/listingImages";
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  fetchUserListings,
  updateListing,
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
  error?: string;
  abort?: AbortController;
};

function imagesFromListing(listing: Listing): LocalImage[] {
  return cleanListingImages(listing.images).map((url, idx) => ({
    key: `existing-${idx}-${url.slice(-24)}`,
    uri: url,
    remoteUrl: url,
    progress: 100,
    status: "done" as const,
  }));
}

function normalizeCondition(
  value: string | null | undefined,
): CreateListingInput["condition"] {
  if (value && CONDITIONS.includes(value as CreateListingInput["condition"])) {
    return value as CreateListingInput["condition"];
  }
  return "good";
}

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] =
    useState<CreateListingInput["condition"]>("good");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [stock, setStock] = useState("1");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyListing = useCallback((listing: Listing) => {
    setTitle(listing.title ?? "");
    setDescription(listing.description ?? "");
    setPrice(String(listing.price ?? ""));
    setCondition(normalizeCondition(listing.condition));
    setLocation(listing.location ?? "");
    setCity(listing.city ?? "");
    setStock(
      listing.stockQuantity != null && listing.stockQuantity !== undefined
        ? String(listing.stockQuantity)
        : "1",
    );
    setImages(imagesFromListing(listing));
  }, []);

  const loadListing = useCallback(async () => {
    if (!token || !user?.id || !id) return;
    setLoading(true);
    setLoadError(null);
    try {
      let listing: Listing | null = null;
      try {
        listing = await fetchListing(id, { token });
      } catch {
        listing = null;
      }
      if (!listing || listing.sellerId !== user.id) {
        const mine = await fetchUserListings(user.id, { token });
        listing = mine.find((row) => String(row.id) === String(id)) ?? null;
      }
      if (!listing) throw new Error("Listing not found");
      if (listing.sellerId && listing.sellerId !== user.id) {
        throw new Error("You can only edit your own listings");
      }
      if (!mounted.current) return;
      applyListing(listing);
    } catch (e) {
      if (!mounted.current) return;
      setLoadError(e instanceof Error ? e.message : "Could not load listing");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [token, user?.id, id, applyListing]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && user?.id) void loadListing();
    }, [authLoading, token, user?.id, router, loadListing]),
  );

  const doneUrls = useMemo(
    () =>
      cleanListingImages(
        images
          .filter((i) => i.status === "done" && i.remoteUrl)
          .map((i) => i.remoteUrl!),
      ),
    [images],
  );

  const pickImages = async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload product images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 5 - images.length),
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    const next: LocalImage[] = result.assets.slice(0, 5 - images.length).map((a, idx) => ({
      key: `${Date.now()}-${idx}`,
      uri: a.uri,
      progress: 0,
      status: "pending" as const,
    }));
    setImages((prev) => [...prev, ...next].slice(0, 5));

    for (const item of next) {
      const asset = result.assets.find((a) => a.uri === item.uri);
      void uploadOne(
        item.key,
        item.uri,
        asset?.mimeType || "image/jpeg",
        asset?.fileName || "product.jpg",
      );
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
    const target = images.find((i) => i.key === key);
    const remaining = images.filter((i) => i.key !== key);
    const remainingUrls = cleanListingImages(
      remaining
        .filter((i) => i.status === "done" && i.remoteUrl)
        .map((i) => i.remoteUrl!),
    );
    // Block removing the last usable product photo (done uploads only).
    if (
      target?.status === "done" &&
      target.remoteUrl &&
      hasUsableListingImage([target.remoteUrl]) &&
      !hasUsableListingImage(remainingUrls)
    ) {
      Alert.alert(
        "Photo required",
        "A listing must keep at least one product photo.",
      );
      return;
    }
    target?.abort?.abort();
    setImages(remaining);
  };

  const retryImage = (item: LocalImage) => {
    void uploadOne(item.key, item.uri, "image/jpeg", "product.jpg");
  };

  const onSave = async () => {
    if (!token || !id) return;
    if (!title.trim() || title.trim().length < 3) {
      Alert.alert("Check listing", "Title must be at least 3 characters");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      Alert.alert("Check listing", "Description must be at least 10 characters");
      return;
    }
    const priceNum = Number(price);
    if (!(priceNum > 0)) {
      Alert.alert("Check listing", "Enter a valid price");
      return;
    }
    if (!location.trim() && !city.trim()) {
      Alert.alert("Check listing", "Location is required");
      return;
    }
    if (images.some((i) => i.status === "uploading")) {
      Alert.alert("Uploading", "Wait for image uploads to finish.");
      return;
    }
    if (images.some((i) => i.status === "error")) {
      Alert.alert("Photo upload", "Fix failed uploads before saving.");
      return;
    }
    if (!hasUsableListingImage(doneUrls)) {
      Alert.alert(
        "Photo required",
        "A listing must keep at least one product photo.",
      );
      return;
    }

    setSaving(true);
    try {
      await updateListing(
        Number(id),
        {
          title: title.trim(),
          description: description.trim(),
          price: priceNum,
          condition,
          location: location.trim() || city.trim(),
          city: city.trim() || undefined,
          stockQuantity: stock.trim() ? Number(stock) : 1,
          images: doneUrls,
        },
        { token },
      );
      Alert.alert("Saved", "Your listing was updated.", [
        {
          text: "OK",
          onPress: () =>
            router.canGoBack() ? router.back() : router.replace("/my-listings"),
        },
      ]);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/my-listings")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Edit listing</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void loadListing()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.section}>Photos (keep at least 1 · max 5)</Text>
          <Text style={styles.hint}>
            Placeholders do not count. You cannot remove the last usable product photo.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
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
            onChangeText={setTitle}
            placeholder="What are you selling?"
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Condition, details, delivery notes…"
            multiline
          />
          <Field
            label="Price"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
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

          <Field label="City" value={city} onChangeText={setCity} placeholder="City" />
          <Field
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="Neighborhood / area"
          />
          <Field
            label="Stock quantity"
            value={stock}
            onChangeText={setStock}
            keyboardType="number-pad"
            placeholder="1"
          />

          <Pressable
            style={[styles.save, saving && { opacity: 0.7 }]}
            onPress={() => void onSave()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Save changes</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
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
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMulti]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#94A3B8"
        multiline={props.multiline}
        keyboardType={props.keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  headerSpacer: { width: 40 },
  errorBox: { marginTop: 40, alignItems: "center", gap: 12 },
  error: { color: "#B91C1C", fontWeight: "600", textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F97316",
  },
  retryBtnText: { color: "#fff", fontWeight: "800" },
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
  save: {
    marginTop: 12,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  hint: { marginBottom: 10, fontSize: 12, lineHeight: 17, color: "#64748B" },
});
