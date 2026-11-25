/**
 * Native Add Wholesale Product — high priority.
 * Android Photo Picker / iOS PHPicker via expo-image-picker (no broad READ_MEDIA).
 * Camera + media upload through existing Wasabi helpers. Drafts survive back/nav failures.
 * Requires ≥1 image + verified warehouse. Chat-only publish (contactOnly).
 */
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import {
  createWholesaleProduct,
  fetchWarehouses,
  formatMoney,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import {
  clearWholesaleDraft,
  loadWholesaleDraft,
  saveWholesaleDraft,
  type WholesaleProductDraft,
  type WholesaleTierDraft,
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

const CURRENCIES = ["USD", "HTG", "EUR", "DOP"];

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
    warehouseId: null,
    warehouseName: "",
    warehouseCity: "",
    sku: "",
    offersLocalDelivery: false,
    offersWarehousePickup: true,
    tiers: [],
    imageUrls: [],
    updatedAt: new Date().toISOString(),
  };
}

export default function WholesaleSellerNewScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const mounted = useRef(true);
  const [draft, setDraft] = useState<WholesaleProductDraft>(emptyDraft());
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [warehouses, setWarehouses] = useState<WholesaleWarehouse[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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
        if (alive && saved) {
          setDraft({
            ...emptyDraft(),
            ...saved,
            warehouseId: saved.warehouseId ?? null,
            tiers: saved.tiers ?? [],
          });
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
        }
        if (token) {
          try {
            const list = await fetchWarehouses({ mine: true, verified: false }, { token });
            if (alive) setWarehouses(list);
          } catch {
            /* ignore — form still usable */
          }
        }
      })();
      return () => {
        alive = false;
      };
    }, [token]),
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

  const donePhotoUrls = useMemo(
    () =>
      media
        .filter((m) => m.kind === "image" && m.status === "done" && m.remoteUrl)
        .map((m) => m.remoteUrl!),
    [media],
  );
  const doneVideoUrls = useMemo(
    () =>
      media
        .filter((m) => m.kind === "video" && m.status === "done" && m.remoteUrl)
        .map((m) => m.remoteUrl!),
    [media],
  );
  const doneUrls = donePhotoUrls;

  const verifiedWarehouses = useMemo(
    () => warehouses.filter((w) => w.verificationStatus === "verified" && w.isActive),
    [warehouses],
  );

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === draft.warehouseId) ?? null,
    [warehouses, draft.warehouseId],
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
      if (e?.name === "AbortError") {
        setMedia((prev) =>
          prev.map((m) =>
            m.key === item.key ? { ...m, status: "error", error: "Cancelled", abort: undefined } : m,
          ),
        );
        return;
      }
      setMedia((prev) =>
        prev.map((m) =>
          m.key === item.key
            ? { ...m, status: "error", error: e?.message || "Upload failed", abort: undefined }
            : m,
        ),
      );
      await persist(draft);
    }
  };

  const cancelUpload = (item: LocalMedia) => {
    item.abort?.abort();
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

  const addTier = () => {
    const tiers: WholesaleTierDraft[] = [
      ...draft.tiers,
      { minQuantity: "50", maxQuantity: "", unitPrice: draft.unitPrice || "" },
    ];
    updateDraft({ tiers });
  };

  const updateTier = (index: number, patch: Partial<WholesaleTierDraft>) => {
    const tiers = draft.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t));
    updateDraft({ tiers });
  };

  const removeTier = (index: number) => {
    updateDraft({ tiers: draft.tiers.filter((_, i) => i !== index) });
  };

  const validateForPublish = (): string | null => {
    if (draft.title.trim().length < 3) return "Enter a product title (at least 3 characters).";
    if (!draft.category.trim()) return "Category is required.";
    const price = Number(draft.unitPrice);
    if (!Number.isFinite(price) || price <= 0) return "Enter a valid wholesale unit price.";
    if (!CURRENCIES.includes((draft.currency || "").toUpperCase())) {
      return `Currency must be one of: ${CURRENCIES.join(", ")}`;
    }
    const moq = Math.floor(Number(draft.minOrderQty) || 0);
    if (moq < 1) return "Minimum order quantity must be at least 1.";
    const stock = Math.floor(Number(draft.stockQuantity) || -1);
    if (stock < 0) return "Stock quantity is required.";
    if (donePhotoUrls.length < 1) return "Add at least one valid product photo before publishing (videos do not count).";
    if (media.some((m) => m.status === "uploading")) return "Wait for uploads to finish.";
    if (!draft.warehouseId) {
      return "Select a verified warehouse. You can only sell in countries where you have a verified depot.";
    }
    if (!selectedWarehouse || selectedWarehouse.verificationStatus !== "verified") {
      return "Selected warehouse is not verified yet. Register a depot and wait for admin verification.";
    }
    for (const tier of draft.tiers) {
      const minQ = Number(tier.minQuantity);
      const tierPrice = Number(tier.unitPrice);
      if (!Number.isFinite(minQ) || minQ < 1 || !Number.isFinite(tierPrice) || tierPrice <= 0) {
        return "Volume pricing tiers need valid min quantity and unit price.";
      }
    }
    return null;
  };

  const buildPayload = (status: "active" | "draft") => {
    const price = Number(draft.unitPrice) || 0;
    return {
      title: draft.title.trim(),
      description: draft.description.trim(),
      unitPrice: price > 0 ? price : 0.01,
      currency: (draft.currency || "USD").toUpperCase(),
      minOrderQty: Math.max(1, Math.floor(Number(draft.minOrderQty) || 1)),
      stockQuantity: Math.max(0, Math.floor(Number(draft.stockQuantity) || 0)),
      wholesaleUnitType: draft.wholesaleUnitType || "unit",
      category: draft.category.trim() || null,
      warehouseId: draft.warehouseId,
      sku: draft.sku || null,
      images: donePhotoUrls,
      videos: doneVideoUrls,
      offersLocalDelivery: draft.offersLocalDelivery,
      offersWarehousePickup: draft.offersWarehousePickup,
      contactOnly: true,
      status,
      tiers: draft.tiers
        .map((t) => ({
          minQuantity: Math.max(1, Math.floor(Number(t.minQuantity) || 1)),
          maxQuantity: t.maxQuantity.trim() ? Math.floor(Number(t.maxQuantity)) : null,
          unitPrice: Number(t.unitPrice),
        }))
        .filter((t) => Number.isFinite(t.unitPrice) && t.unitPrice > 0),
    };
  };

  const onSaveDraft = async () => {
    if (!token) return;
    setValidation(null);
    setSavingDraft(true);
    try {
      await persist(draft, doneUrls);
      if (draft.title.trim().length >= 3) {
        await createWholesaleProduct(buildPayload("draft"), { token });
        await clearWholesaleDraft();
        Alert.alert("Draft saved", "Recoverable from Seller → Drafts.");
        router.replace("/wholesale/seller/drafts");
      } else {
        Alert.alert("Local draft saved", "Title needed to sync a server draft.");
      }
    } catch (e: any) {
      setValidation(e?.message || "Draft save failed — local draft kept.");
      await persist(draft, doneUrls);
    } finally {
      setSavingDraft(false);
    }
  };

  const onPublish = async () => {
    setValidation(null);
    if (!token) return;
    const err = validateForPublish();
    if (err) {
      setValidation(err);
      return;
    }
    setPublishing(true);
    try {
      const product = await createWholesaleProduct(buildPayload("active"), { token });
      await clearWholesaleDraft();
      router.replace(`/wholesale/products/${product.id}`);
    } catch (e: any) {
      setValidation(e?.message || "Publish failed — draft was kept.");
      await persist(draft, doneUrls);
    } finally {
      setPublishing(false);
    }
  };

  const openPreview = () => {
    const err = validateForPublish();
    if (err) {
      setValidation(err);
      return;
    }
    setValidation(null);
    setPreviewOpen(true);
  };

  return (
    <WholesaleGate>
      <WholesaleShell
        title="Add wholesale product"
        subtitle="Chat-only · verified depot · Wasabi media"
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
                <Pressable style={styles.overlay} onPress={() => cancelUpload(m)}>
                  <Text style={styles.overlayText}>{Math.round(m.progress)}%</Text>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
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
        {donePhotoUrls.length < 1 ? (
          <Text style={styles.warn}>At least one valid product photo is required to publish (videos do not count).</Text>
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
            <Field label="Wholesale unit price" value={draft.unitPrice} onChange={(v) => updateDraft({ unitPrice: v })} placeholder="28.50" keyboard="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Currency</Text>
            <View style={styles.currencyRow}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.currencyChip, draft.currency === c && styles.currencyChipOn]}
                  onPress={() => updateDraft({ currency: c })}
                >
                  <Text style={[styles.currencyText, draft.currency === c && styles.currencyTextOn]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="Min order qty" value={draft.minOrderQty} onChange={(v) => updateDraft({ minOrderQty: v })} keyboard="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Stock" value={draft.stockQuantity} onChange={(v) => updateDraft({ stockQuantity: v })} keyboard="number-pad" />
          </View>
        </View>
        <Field label="Unit type" value={draft.wholesaleUnitType} onChange={(v) => updateDraft({ wholesaleUnitType: v })} placeholder="bag / carton / pallet" />
        <Field label="Category" value={draft.category} onChange={(v) => updateDraft({ category: v })} placeholder="Food" />
        <Field label="SKU (optional)" value={draft.sku} onChange={(v) => updateDraft({ sku: v })} placeholder="WH-RICE-50" />

        <Text style={styles.section}>Volume pricing</Text>
        <Text style={styles.hint}>Optional tiers (e.g. 50+ units at a lower price).</Text>
        {draft.tiers.map((tier, i) => (
          <View key={i} style={styles.tierRow}>
            <View style={{ flex: 1 }}>
              <Field label="Min qty" value={tier.minQuantity} onChange={(v) => updateTier(i, { minQuantity: v })} keyboard="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Max qty" value={tier.maxQuantity} onChange={(v) => updateTier(i, { maxQuantity: v })} keyboard="number-pad" placeholder="∞" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Unit $" value={tier.unitPrice} onChange={(v) => updateTier(i, { unitPrice: v })} keyboard="decimal-pad" />
            </View>
            <Pressable style={styles.tierRemove} onPress={() => removeTier(i)}>
              <Feather name="x" size={16} color={T.danger} />
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.mediaBtn} onPress={addTier}>
          <Feather name="plus" size={16} color={T.forest} />
          <Text style={styles.mediaBtnText}>Add volume tier</Text>
        </Pressable>

        <Text style={styles.section}>Verified warehouse</Text>
        <Text style={styles.hint}>
          Publish requires a verified depot in the selling country — not your residential address.
        </Text>
        {verifiedWarehouses.length === 0 ? (
          <View style={styles.warnBox}>
            <Text style={styles.warn}>
              No verified warehouses. Register one under Seller → Warehouses and wait for admin verification.
            </Text>
            <Pressable style={styles.linkBtn} onPress={() => router.push("/wholesale/seller/warehouse")}>
              <Text style={styles.linkBtnText}>Manage warehouses</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.whList}>
            {verifiedWarehouses.map((w) => {
              const on = draft.warehouseId === w.id;
              return (
                <Pressable
                  key={w.id}
                  style={[styles.whCard, on && styles.whCardOn]}
                  onPress={() =>
                    updateDraft({
                      warehouseId: w.id,
                      warehouseName: w.name,
                      warehouseCity: w.city,
                      country: w.country,
                      city: w.city,
                    })
                  }
                  testID={`wholesale-select-warehouse-${w.id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.whTitle}>{w.name}</Text>
                    <Text style={styles.whMeta}>
                      {w.city}, {w.country}
                    </Text>
                  </View>
                  {on ? <Feather name="check-circle" size={18} color={T.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
        {warehouses.some((w) => w.verificationStatus === "pending") ? (
          <Text style={styles.hint}>
            Pending depots: {warehouses.filter((w) => w.verificationStatus === "pending").map((w) => w.name).join(", ")}
          </Text>
        ) : null}

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

        <Pressable style={styles.previewBtn} onPress={openPreview} testID="wholesale-preview">
          <Feather name="eye" size={16} color={T.forest} />
          <Text style={styles.previewBtnText}>Preview before publish</Text>
        </Pressable>

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
        <Pressable
          style={[styles.draftBtn, savingDraft && { opacity: 0.7 }]}
          onPress={() => void onSaveDraft()}
          disabled={savingDraft}
          testID="wholesale-save-draft"
        >
          {savingDraft ? (
            <ActivityIndicator color={T.forest} />
          ) : (
            <Text style={styles.draftBtnText}>Save draft</Text>
          )}
        </Pressable>
        <Text style={styles.footerNote}>No Buy Now / cart / checkout — buyers message you in chat.</Text>
      </WholesaleShell>

      <Modal visible={previewOpen} animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Product preview</Text>
            <Pressable onPress={() => setPreviewOpen(false)}>
              <Feather name="x" size={22} color={T.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {doneUrls[0] ? (
              <Image source={{ uri: doneUrls[0] }} style={styles.previewImage} contentFit="cover" />
            ) : null}
            <Text style={styles.previewProductTitle}>{draft.title}</Text>
            <Text style={styles.previewPrice}>
              {formatMoney(Number(draft.unitPrice) || 0, draft.currency)} · MOQ {draft.minOrderQty} {draft.wholesaleUnitType}
            </Text>
            <Text style={styles.previewMeta}>
              {draft.category} · Stock {draft.stockQuantity}
            </Text>
            <Text style={styles.previewMeta}>
              Depot: {selectedWarehouse?.name} · {selectedWarehouse?.city}, {selectedWarehouse?.country}
            </Text>
            {draft.tiers.length ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.section}>Volume tiers</Text>
                {draft.tiers.map((t, i) => (
                  <Text key={i} style={styles.previewMeta}>
                    {t.minQuantity}
                    {t.maxQuantity ? `–${t.maxQuantity}` : "+"} → {formatMoney(Number(t.unitPrice) || 0, draft.currency)}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text style={[styles.previewMeta, { marginTop: 12 }]}>{draft.description || "No description"}</Text>
            <Text style={styles.footerNote}>Chat-only — no checkout on Flexa Wholesale.</Text>
            <Pressable
              style={[styles.publish, { marginTop: 16 }]}
              onPress={() => {
                setPreviewOpen(false);
                void onPublish();
              }}
            >
              <Text style={styles.publishText}>Confirm & publish</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
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
    marginBottom: 8,
    alignSelf: "flex-start",
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
  cancelText: { color: T.white, fontSize: 10, marginTop: 2, fontWeight: "700" },
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
  warnBox: {
    backgroundColor: T.mint,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
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
  currencyRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  currencyChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  currencyChipOn: { backgroundColor: T.accentSoft, borderColor: T.accent },
  currencyText: { fontSize: 12, fontWeight: "800", color: T.muted },
  currencyTextOn: { color: T.forest },
  hint: { fontSize: 11, color: T.muted, marginBottom: 10 },
  tierRow: { flexDirection: "row", gap: 6, alignItems: "flex-end" },
  tierRemove: { paddingBottom: 18, paddingHorizontal: 4 },
  whList: { gap: 8, marginBottom: 10 },
  whCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  whCardOn: { borderColor: T.accent, backgroundColor: T.accentSoft },
  whTitle: { fontSize: 14, fontWeight: "800", color: T.ink },
  whMeta: { marginTop: 2, fontSize: 12, color: T.muted },
  linkBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: T.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  linkBtnText: { fontWeight: "800", color: T.forest, fontSize: 13 },
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
  previewBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: T.white,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  previewBtnText: { color: T.forest, fontWeight: "800", fontSize: 14 },
  publish: {
    marginTop: 12,
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  publishText: { color: T.white, fontWeight: "800", fontSize: 15 },
  draftBtn: {
    marginTop: 10,
    backgroundColor: T.mint,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  draftBtnText: { color: T.forest, fontWeight: "800", fontSize: 14 },
  footerNote: { marginTop: 10, textAlign: "center", fontSize: 12, color: T.muted },
  modalRoot: { flex: 1, backgroundColor: T.mintSoft, paddingTop: 54 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: T.ink },
  modalBody: { padding: 16, paddingBottom: 40 },
  previewImage: { width: "100%", height: 220, borderRadius: 16, backgroundColor: T.mint },
  previewProductTitle: { marginTop: 14, fontSize: 22, fontWeight: "800", color: T.ink },
  previewPrice: { marginTop: 6, fontSize: 16, fontWeight: "800", color: T.accent },
  previewMeta: { marginTop: 4, fontSize: 13, color: T.muted, lineHeight: 18 },
});
