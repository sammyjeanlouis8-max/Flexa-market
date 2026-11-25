import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { uploadLocalFile } from "@/lib/mediaUpload";
import {
  fetchWarehouses,
  fetchWholesaleProduct,
  patchWholesaleProduct,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const { token } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<WholesaleWarehouse[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [minOrderQty, setMinOrderQty] = useState("1");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [category, setCategory] = useState("");
  const [sku, setSku] = useState("");
  const [status, setStatus] = useState("draft");
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [featured, setFeatured] = useState(false);
  const [offersLocalDelivery, setOffersLocalDelivery] = useState(false);
  const [offersWarehousePickup, setOffersWarehousePickup] = useState(true);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(productId)) return;
    setLoading(true);
    setError(null);
    try {
      const [product, wh] = await Promise.all([
        fetchWholesaleProduct(productId, { token }),
        fetchWarehouses({ mine: true, limit: 50 }, { token }),
      ]);
      setTitle(product.title);
      setDescription(product.description || "");
      setUnitPrice(String(product.unitPrice));
      setCurrency(product.currency || "USD");
      setMinOrderQty(String(product.minOrderQty));
      setStockQuantity(String(product.stockQuantity));
      setCategory(product.category || "");
      setSku(product.sku || "");
      setStatus(product.status);
      setWarehouseId(product.warehouseId);
      setImages(product.images || []);
      setVideos(product.videos || []);
      setFeatured(!!product.featured);
      setOffersLocalDelivery(!!product.offersLocalDelivery);
      setOffersWarehousePickup(product.offersWarehousePickup !== false);
      setWarehouses(wh);
    } catch (e: any) {
      setError(e?.message || "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [token, productId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const pickPhoto = async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to update product photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 8 - images.length),
      quality: 0.85,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      const up = await uploadLocalFile(asset.uri, {
        token,
        contentType: asset.mimeType || "image/jpeg",
        fileName: asset.fileName || `photo-${Date.now()}.jpg`,
      });
      setImages((prev) => [...prev, up.url].slice(0, 8));
    }
  };

  const pickVideo = async () => {
    if (!token) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const up = await uploadLocalFile(asset.uri, {
      token,
      contentType: asset.mimeType || "video/mp4",
      fileName: asset.fileName || `video-${Date.now()}.mp4`,
    });
    setVideos((prev) => [...prev, up.url].slice(0, 4));
  };

  const save = async (nextStatus?: string) => {
    if (!token) return;
    const publishStatus = nextStatus || status;
    if (publishStatus === "active" && images.length < 1) {
      setError("At least one valid product photo is required to publish (videos do not count).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchWholesaleProduct(
        productId,
        {
          title: title.trim(),
          description: description.trim(),
          unitPrice: Number(unitPrice),
          currency,
          minOrderQty: Math.max(1, Math.floor(Number(minOrderQty) || 1)),
          stockQuantity: Math.max(0, Math.floor(Number(stockQuantity) || 0)),
          category: category.trim() || null,
          sku: sku.trim() || null,
          warehouseId,
          images,
          videos,
          featured,
          offersLocalDelivery,
          offersWarehousePickup,
          status: publishStatus,
        },
        { token },
      );
      router.replace(`/wholesale/products/${productId}`);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const verified = warehouses.filter((w) => w.verificationStatus === "verified" && w.isActive);

  return (
    <WholesaleGate>
      <WholesaleShell title="Edit product" subtitle="Photos required to publish · videos optional">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          <View style={styles.form}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.label}>Photos</Text>
            <View style={styles.mediaRow}>
              {images.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.thumb} contentFit="cover" />
              ))}
              <Pressable style={styles.add} onPress={() => void pickPhoto()}>
                <Feather name="image" size={18} color={T.forest} />
              </Pressable>
            </View>
            <Text style={styles.label}>Videos</Text>
            <View style={styles.mediaRow}>
              {videos.map((url) => (
                <View key={url} style={[styles.thumb, styles.videoThumb]}>
                  <Feather name="video" size={18} color={T.white} />
                </View>
              ))}
              <Pressable style={styles.add} onPress={() => void pickVideo()}>
                <Feather name="video" size={18} color={T.forest} />
              </Pressable>
            </View>
            <Field label="Title" value={title} onChange={setTitle} />
            <Field label="Description" value={description} onChange={setDescription} multiline />
            <Field label="Unit price" value={unitPrice} onChange={setUnitPrice} keyboard="decimal-pad" />
            <Field label="Currency" value={currency} onChange={setCurrency} />
            <Field label="Min order qty" value={minOrderQty} onChange={setMinOrderQty} keyboard="number-pad" />
            <Field label="Stock" value={stockQuantity} onChange={setStockQuantity} keyboard="number-pad" />
            <Field label="Category" value={category} onChange={setCategory} />
            <Field label="SKU" value={sku} onChange={setSku} />
            <Text style={styles.label}>Warehouse</Text>
            {verified.map((w) => (
              <Pressable
                key={w.id}
                style={[styles.wh, warehouseId === w.id && styles.whOn]}
                onPress={() => setWarehouseId(w.id)}
              >
                <Text style={styles.whText}>{w.name} · {w.city}, {w.country}</Text>
              </Pressable>
            ))}
            <View style={styles.switchRow}>
              <Text style={styles.label}>Featured</Text>
              <Switch value={featured} onValueChange={setFeatured} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Local delivery</Text>
              <Switch value={offersLocalDelivery} onValueChange={setOffersLocalDelivery} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Warehouse pickup</Text>
              <Switch value={offersWarehousePickup} onValueChange={setOffersWarehousePickup} />
            </View>
            <Pressable style={styles.btn} onPress={() => void save("draft")} disabled={saving}>
              <Text style={styles.btnText}>{saving ? "Saving…" : "Save draft"}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => void save("active")} disabled={saving}>
              <Text style={styles.btnText}>Publish</Text>
            </Pressable>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  keyboard?: any;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={keyboard}
        placeholderTextColor={T.muted}
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  label: { fontSize: 12, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  input: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.ink,
  },
  mediaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: T.mint },
  videoThumb: { alignItems: "center", justifyContent: "center", backgroundColor: T.forest },
  add: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: T.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.white,
  },
  wh: {
    backgroundColor: T.white,
    borderRadius: 10,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  whOn: { borderColor: T.accent, backgroundColor: T.accentSoft },
  whText: { color: T.ink, fontWeight: "600" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  btn: {
    backgroundColor: T.forest,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: T.accent },
  btnText: { color: T.white, fontWeight: "800" },
  error: { color: T.danger, fontWeight: "700" },
});
