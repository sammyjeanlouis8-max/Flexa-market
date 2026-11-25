/**
 * Native Add Wholesale Product — high priority.
 * Android Photo Picker / iOS PHPicker via expo-image-picker (no broad READ_MEDIA).
 * Camera + media upload through existing Wasabi helpers. Drafts survive back/nav failures.
 * Requires ≥1 image. Chat-only publish (contactOnly).
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { uploadLocalFile } from "@/lib/mediaUpload";
import { createWholesaleProduct } from "@/lib/wholesaleApi";
import {
  clearWholesaleDraft,
  loadWholesaleDraft,
  saveWholesaleDraft,
  type WholesaleProductDraft,
} from "@/lib/wholesaleDraft";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type LocalMedia = {
  key: string;
  uri: string;
  kind: "image" | "video";
  remoteUrl?: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  abort?: AbortController;
};

function emptyDraft(): WholesaleProductDraft {
  return {
    title: "",
    description: "",
    unitPrice: "",
    currency: "USD",
    minOrderQty: "10",
    stockQuantity: "100",
    wholesaleUnitType: "unit",
    category: "",
    country: "",
    city: "",
    warehouseName: "",
    warehouseCity: "",
    sku: "",
    offersLocalDelivery: false,
    offersWarehousePickup: true,
    imageUrls: [],
    updatedAt: new Date().toISOString(),
  };
}

export default function WholesaleSellerNewScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const mounted = useRef(true);
  const [draft, setDraft] = useState<WholesaleProductDraft>(emptyDraft());
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const saved = await loadWholesaleDraft();
        if (!alive || !saved) return;
        setDraft(saved);
        if (saved.imageUrls?.length) {
          setMedia(
            saved.imageUrls.map((url, i) => ({
              key: `remote-${i}`,
              uri: url,
              kind: "image" as const,
              remoteUrl: url,
              progress: 100,
              status: "done" as const,
            })),
          );
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const persist = useCallback(
    async (next: WholesaleProductDraft, urls?: string[]) => {
      const imageUrls =
        urls ??
        media.filter((m) => m.status === "done" && m.remoteUrl).map((m) => m.remoteUrl!);
      await saveWholesaleDraft({ ...next, imageUrls });
    },
    [media],
  );

  const updateDraft = (patch: Partial<WholesaleProductDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      void persist(next);
      return next;
    });
  };

  const doneUrls = useMemo(
    () => media.filter((m) => m.status === "done" && m.remoteUrl).map((m) => m.remoteUrl!),
    [media],
  );

  const uploadOne = async (item: LocalMedia) => {
    if (!token) return;
    const abort = new AbortController();
    setMedia((prev) =>
      prev.map((m) =>
        m.key === item.key ? { ...m, status: "uploading", progress: 0, abort, error: undefined } : m,
      ),
    );
    try {
      const contentType = item.kind === "video" ? "video/mp4" : "image/jpeg";
      const result = await uploadLocalFile(item.uri, {
        token,
        contentType,
        fileName: item.kind === "video" ? "wholesale.mp4" : "wholesale.jpg",
        signal: abort.signal,
        onProgress: (p) => {
          if (!mounted.current) return;
          setMedia((prev) =>
            prev.map((m) => (m.key === item.key ? { ...m, progress: p.percent } : m)),
          );
        },
      });
      if (!mounted.current) return;
      setMedia((prev) => {
        const next = prev.map((m) =>
          m.key === item.key
            ? { ...m, status: "done" as const, progress: 100, remoteUrl: result.url, abort: undefined }
            : m,
        );
        void saveWholesaleDraft({
          ...draft,
          imageUrls: next.filter((m) => m.status === "done" && m.remoteUrl).map((m) => m.remoteUrl!),
        });
        return next;
      });
    } catch (e: any) {
      if (!mounted.current) return;
      setMedia((prev) =>
        prev.map((m) =>
          m.key === item.key
            ? {
                ...m,
                status: "error",
                error: e?.message || "Upload failed",
                abort: undefined,
              }
            : m,
        ),
      );
      // Keep draft so user can retry after failure / back navigation.
      await persist(draft);
    }
  };

  const enqueueAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
    kind: "image" | "video",
  ) => {
    const next: LocalMedia[] = assets.slice(0, Math.max(0, 8 - media.length)).map((a, idx) => ({
      key: `${Date.now()}-${idx}`,
      uri: a.uri,
      kind: a.type === "video" || kind === "video" ? "video" : "image",
      progress: 0,
      status: "pending" as const,
    }));
    if (!next.length) return;
    setMedia((prev) => [...prev, ...next].slice(0, 8));
    for (const item of next) {
      await uploadOne(item);
    }
  };

  /** Prefer system Photo Picker — avoid broad library permission prompts when possible. */
  const pickFromLibrary = async (videos = false) => {
    if (Platform.OS === "ios") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Photos access",
          "Allow photo access so you can attach wholesale product images. You can also use the camera.",
        );
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: videos ? ["videos"] : ["images"],
      allowsMultipleSelection: !videos,
      selectionLimit: videos ? 1 : Math.max(1, 8 - media.length),
      quality: 0.75,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.length) return;
    await enqueueAssets(result.assets, videos ? "video" : "image");
  };

  const captureCamera = async (videos = false) => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert(
        "Camera access",
        "Flexa Wholesale needs the camera only when you take a product photo or short depot video.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: videos ? ["videos"] : ["images"],
      quality: 0.75,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.length) return;
    await enqueueAssets(result.assets, videos ? "video" : "image");
  };

  const useGps = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location",
          "Permission denied. Enter country, city, and warehouse manually — wholesale still works.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const place = places[0];
      if (place) {
        updateDraft({
          country: place.country || draft.country,
          city: place.city || place.subregion || draft.city,
          warehouseCity: place.city || place.subregion || draft.warehouseCity,
        });
      }
    } catch (e: any) {
      Alert.alert("Location", e?.message || "Could not read GPS — enter location manually.");
    } finally {
      setLocBusy(false);
    }
  };

  const onPublish = async () => {
    setValidation(null);
    if (!token) return;
    if (draft.title.trim().length < 3) {
      setValidation("Enter a product title (at least 3 characters).");
      return;
    }
    const price = Number(draft.unitPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setValidation("Enter a valid unit price.");
      return;
    }
    if (doneUrls.length < 1) {
      setValidation("Add at least one product image before publishing.");
      return;
    }
    if (media.some((m) => m.status === "uploading")) {
      setValidation("Wait for uploads to finish.");
      return;
    }
    setPublishing(true);
    try {
      const product = await createWholesaleProduct(
        {
          title: draft.title.trim(),
          description: draft.description.trim(),
          unitPrice: price,
          currency: draft.currency || "USD",
          minOrderQty: Math.max(1, Math.floor(Number(draft.minOrderQty) || 1)),
          stockQuantity: Math.max(0, Math.floor(Number(draft.stockQuantity) || 0)),
          wholesaleUnitType: draft.wholesaleUnitType || "unit",
          category: draft.category || null,
          country: draft.country || user?.country || null,
          city: draft.city || null,
          warehouseName: draft.warehouseName || null,
          warehouseCity: draft.warehouseCity || draft.city || null,
          sku: draft.sku || null,
          images: doneUrls,
          offersLocalDelivery: draft.offersLocalDelivery,
          offersWarehousePickup: draft.offersWarehousePickup,
          contactOnly: true,
        },
        { token },
      );
      await clearWholesaleDraft();
      router.replace(`/wholesale/products/${product.id}`);
    } catch (e: any) {
      setValidation(e?.message || "Publish failed — draft was kept.");
      await persist(draft, doneUrls);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title="Add wholesale product"
        subtitle="Chat-only · depot stock · Wasabi media"
      >
        <Text style={styles.section}>Photos & video</Text>
        <View style={styles.mediaActions}>
          <Pressable style={styles.mediaBtn} onPress={() => void pickFromLibrary(false)} testID="wholesale-pick-photos">
            <Feather name="image" size={16} color={T.forest} />
            <Text style={styles.mediaBtnText}>Photo Picker</Text>
          </Pressable>
          <Pressable style={styles.mediaBtn} onPress={() => void captureCamera(false)} testID="wholesale-camera">
            <Feather name="camera" size={16} color={T.forest} />
            <Text style={styles.mediaBtnText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.mediaBtn} onPress={() => void pickFromLibrary(true)}>
            <Feather name="video" size={16} color={T.forest} />
            <Text style={styles.mediaBtnText}>Video</Text>
          </Pressable>
        </View>
        <View style={styles.mediaRow}>
          {media.map((m) => (
            <View key={m.key} style={styles.mediaCard}>
              <Image source={{ uri: m.uri }} style={styles.thumb} contentFit="cover" />
              {m.status === "uploading" ? (
                <View style={styles.overlay}>
                  <Text style={styles.overlayText}>{Math.round(m.progress)}%</Text>
                </View>
              ) : null}
              {m.status === "error" ? (
                <Pressable style={styles.overlay} onPress={() => void uploadOne(m)}>
                  <Text style={styles.overlayText}>Retry</Text>
                </Pressable>
              ) : null}
              {m.status === "done" ? (
                <View style={styles.doneDot}>
                  <Feather name="check" size={12} color={T.white} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
        {doneUrls.length < 1 ? (
          <Text style={styles.warn}>At least one product image is required to publish.</Text>
        ) : null}

        <Field label="Title" value={draft.title} onChange={(v) => updateDraft({ title: v })} placeholder="Rice 50lb bags" />
        <Field
          label="Description"
          value={draft.description}
          onChange={(v) => updateDraft({ description: v })}
          placeholder="Bulk depot stock…"
          multiline
        />
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Unit price" value={draft.unitPrice} onChange={(v) => updateDraft({ unitPrice: v })} placeholder="28.50" keyboard="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Currency" value={draft.currency} onChange={(v) => updateDraft({ currency: v })} placeholder="USD" />
          </View>
        </View>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Min qty" value={draft.minOrderQty} onChange={(v) => updateDraft({ minOrderQty: v })} keyboard="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Stock" value={draft.stockQuantity} onChange={(v) => updateDraft({ stockQuantity: v })} keyboard="number-pad" />
          </View>
        </View>
        <Field label="Unit type" value={draft.wholesaleUnitType} onChange={(v) => updateDraft({ wholesaleUnitType: v })} placeholder="bag / carton / pallet" />
        <Field label="Category" value={draft.category} onChange={(v) => updateDraft({ category: v })} placeholder="Food" />

        <Text style={styles.section}>Location & warehouse</Text>
        <Pressable style={styles.gpsBtn} onPress={() => void useGps()} disabled={locBusy} testID="wholesale-use-gps">
          {locBusy ? <ActivityIndicator color={T.forest} /> : <Feather name="map-pin" size={16} color={T.forest} />}
          <Text style={styles.gpsText}>Use GPS (optional)</Text>
        </Pressable>
        <Text style={styles.hint}>Permission only when you tap GPS. Manual entry always works.</Text>
        <Field label="Country" value={draft.country} onChange={(v) => updateDraft({ country: v })} placeholder="Haiti" />
        <Field label="City" value={draft.city} onChange={(v) => updateDraft({ city: v })} placeholder="Port-au-Prince" />
        <Field label="Warehouse name" value={draft.warehouseName} onChange={(v) => updateDraft({ warehouseName: v })} placeholder="Delmas Depot" />
        <Field label="Warehouse city" value={draft.warehouseCity} onChange={(v) => updateDraft({ warehouseCity: v })} placeholder="Delmas" />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Warehouse pickup</Text>
          <Switch
            value={draft.offersWarehousePickup}
            onValueChange={(v) => updateDraft({ offersWarehousePickup: v })}
            trackColor={{ true: T.accent }}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Local delivery (optional)</Text>
          <Switch
            value={draft.offersLocalDelivery}
            onValueChange={(v) => updateDraft({ offersLocalDelivery: v })}
            trackColor={{ true: T.accent }}
          />
        </View>

        {validation ? <Text style={styles.error}>{validation}</Text> : null}

        <Pressable
          style={[styles.publish, publishing && { opacity: 0.7 }]}
          onPress={() => void onPublish()}
          disabled={publishing}
          testID="wholesale-publish"
        >
          {publishing ? (
            <ActivityIndicator color={T.white} />
          ) : (
            <Text style={styles.publishText}>Publish wholesale (chat only)</Text>
          )}
        </Pressable>
        <Text style={styles.footerNote}>No Buy Now / cart / checkout — buyers message you in chat.</Text>
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboard?: "default" | "number-pad" | "decimal-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={T.muted}
        style={[styles.input, multiline && { minHeight: 88, textAlignVertical: "top" }]}
        multiline={multiline}
        keyboardType={keyboard || "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "800",
    color: T.ink,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  mediaActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  mediaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  mediaBtnText: { fontSize: 12, fontWeight: "800", color: T.forest },
  mediaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  mediaCard: { width: 72, height: 72, borderRadius: 10, overflow: "hidden", backgroundColor: T.mint },
  thumb: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayText: { color: T.white, fontWeight: "800", fontSize: 12 },
  doneDot: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  warn: { color: T.warn, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: T.muted, marginBottom: 4 },
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: T.ink,
  },
  row2: { flexDirection: "row", gap: 10 },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: T.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  gpsText: { color: T.forest, fontWeight: "800", fontSize: 13 },
  hint: { fontSize: 11, color: T.muted, marginBottom: 10 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  switchLabel: { fontSize: 14, fontWeight: "600", color: T.ink },
  error: { color: T.danger, fontWeight: "700", marginVertical: 8 },
  publish: {
    marginTop: 12,
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  publishText: { color: T.white, fontWeight: "800", fontSize: 15 },
  footerNote: { marginTop: 10, textAlign: "center", fontSize: 12, color: T.muted },
});
