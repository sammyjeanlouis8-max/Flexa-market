import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = [
  "Electronics", "Vehicles", "Fashion & Clothing", "Home & Garden",
  "Sports & Fitness", "Real Estate", "Jobs & Services", "Food & Drinks",
  "Books & Education", "Health & Beauty", "Toys & Kids", "Others",
];

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];
const MAX_IMAGES = 10;

export default function SellScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { request } = useApi();

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [location, setLocation] = useState(user?.city ?? user?.location ?? "");
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [showCats, setShowCats] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const remaining = MAX_IMAGES - imageUris.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map((a) => a.uri);
      setImageUris((prev) => [...prev, ...newUris].slice(0, MAX_IMAGES));
    }
  }

  function removeImage(index: number) {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadImage(uri: string): Promise<string> {
    const filename = uri.split("/").pop() ?? "image.jpg";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";

    const formData = new FormData();
    formData.append("file", { uri, name: filename, type: mime } as any);

    const result = await request("/upload", {
      method: "POST",
      body: formData,
      headers: {},
    });
    return (result as any).url as string;
  }

  async function handlePost() {
    if (!title.trim() || !price || !category || !condition) {
      setError("Tanpri ranpli: tit, pri, kategori, ak kondisyon.");
      return;
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      setError("Pri dwe yon nimewo pozitif.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < imageUris.length; i++) {
        setUploadProgress(`Telechaje foto ${i + 1} / ${imageUris.length}...`);
        const url = await uploadImage(imageUris[i]);
        uploadedUrls.push(url);
      }
      setUploadProgress("");

      await request("/listings", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          price: parseFloat(price).toFixed(2),
          description: description.trim(),
          category,
          condition: condition.toLowerCase(),
          location: location.trim() || (user?.location ?? ""),
          country: user?.country ?? "Haiti",
          images: uploadedUrls,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erè piblikasyon");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
      setUploadProgress("");
    }
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.successWrap, { paddingTop: topPad }]}>
          <View style={[styles.successIcon, { backgroundColor: "#22C55E22" }]}>
            <Feather name="check-circle" size={52} color="#22C55E" />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Annons Pibliye!</Text>
          <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
            Annons ou a pibliye avèk siksè. Lòt moun ka wè li kounye a.
          </Text>
          <Pressable
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={() => {
              setSuccess(false); setTitle(""); setPrice(""); setDescription("");
              setCategory(""); setCondition(""); setImageUris([]);
            }}
          >
            <Text style={styles.btnText}>Pibliye Yon Lòt</Text>
          </Pressable>
          <Pressable
            style={[styles.outlineBtn, { borderColor: colors.border }]}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>Retounen Lakay</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Vann yon Bagay</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={[styles.errorBox, { borderColor: colors.destructive }]}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
            Foto ({imageUris.length}/{MAX_IMAGES})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
            {imageUris.map((uri, idx) => (
              <View key={uri + idx} style={styles.photoThumbWrap}>
                <Image source={{ uri }} style={styles.photoThumb} contentFit="cover" />
                {idx === 0 && (
                  <View style={styles.mainBadge}>
                    <Text style={styles.mainBadgeText}>Prensipal</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(idx)}>
                  <Feather name="x" size={12} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
            {imageUris.length < MAX_IMAGES && (
              <TouchableOpacity
                style={[styles.addPhotoBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={pickImages}
              >
                <Feather name="camera" size={24} color={colors.mutedForeground} />
                <Text style={[styles.addPhotoText, { color: colors.mutedForeground }]}>
                  {imageUris.length === 0 ? "Ajoute Foto" : "Plis Foto"}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          {imageUris.length === 0 && (
            <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>
              Ou ka ajoute jiska {MAX_IMAGES} foto — premye foto a se foto prensipal
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Tit Annons *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={title}
            onChangeText={setTitle}
            placeholder="ex: iPhone 13 Pro Max 256GB"
            placeholderTextColor={colors.mutedForeground}
            maxLength={100}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Pri (USD) *</Text>
          <View style={[styles.priceRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.priceDollar, { color: colors.mutedForeground }]}>$</Text>
            <TextInput
              style={[styles.priceInput, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Kategori *</Text>
          <TouchableOpacity
            style={[styles.input, styles.selectRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowCats((v) => !v)}
          >
            <Text style={[styles.selectText, { color: category ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {category || "Chwazi kategori"}
            </Text>
            <Feather name={showCats ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {showCats && (
            <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.dropItem, category === c && { backgroundColor: colors.primary + "15" }]}
                    onPress={() => { setCategory(c); setShowCats(false); }}
                  >
                    <Text style={[styles.dropText, { color: colors.foreground }, category === c && { color: colors.primary }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Kondisyon *</Text>
          <View style={styles.condRow}>
            {CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.condPill, { borderColor: condition === c ? colors.primary : colors.border, backgroundColor: condition === c ? colors.primary : colors.card }]}
                onPress={() => setCondition(c)}
              >
                <Text style={[styles.condText, { color: condition === c ? "#FFF" : colors.mutedForeground }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Lokalizasyon</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={location}
            onChangeText={setLocation}
            placeholder="Vil oswa zòn ou"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Deskripsyon</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Dekri pwodwi ou a (opsyonèl)..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={1000}
          />
        </View>

        {uploadProgress ? (
          <View style={[styles.progressBox, { backgroundColor: colors.muted }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.progressText, { color: colors.foreground }]}>{uploadProgress}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.submitBtn, { backgroundColor: colors.accent, opacity: pressed || loading ? 0.85 : 1 }]}
          onPress={handlePost}
          disabled={loading}
          testID="sell-submit"
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Feather name="upload" size={18} color="#FFF" />
              <Text style={styles.submitText}>Pibliye Annons</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  scroll: { padding: 16, gap: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: "rgba(239,68,68,0.06)" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  photoRow: { flexDirection: "row" },
  photoThumbWrap: { width: 100, height: 100, borderRadius: 12, marginRight: 10, overflow: "hidden", position: "relative" },
  photoThumb: { width: "100%", height: "100%" },
  mainBadge: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", paddingVertical: 3, alignItems: "center" },
  mainBadgeText: { color: "#FFF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  removeBtn: { position: "absolute", top: 5, right: 5, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  addPhotoBtn: { width: 100, height: 100, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6, marginRight: 10 },
  addPhotoText: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  photoHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { fontSize: 15 },
  priceRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50 },
  priceDollar: { fontSize: 20, fontFamily: "Inter_700Bold", marginRight: 4 },
  priceInput: { flex: 1, fontSize: 20, height: "100%" },
  dropdown: { borderWidth: 1, borderRadius: 12, overflow: "hidden", marginTop: 4 },
  dropItem: { paddingHorizontal: 14, paddingVertical: 12 },
  dropText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  condRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  condPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  condText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  textArea: { height: 100, paddingTop: 12 },
  progressBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, marginBottom: 8 },
  progressText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 14, marginTop: 8 },
  submitText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  successIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  successSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  btn: { width: "100%", height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#FFF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  outlineBtn: { width: "100%", height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  outlineBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
