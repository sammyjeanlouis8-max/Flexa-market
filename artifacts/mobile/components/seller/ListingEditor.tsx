/**
 * Shared create/edit listing form wired to Flexa Market APIs.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import colors from "@/constants/colors";
import { fetchCategories } from "@/lib/api";
import { citiesForCountry } from "@/lib/countries";
import {
  type CategoryNode,
  type CreateListingInput,
} from "@/lib/sellerListingsApi";
import { uploadListingImage } from "@/lib/uploadMedia";

const CONDITIONS: CreateListingInput["condition"][] = [
  "new",
  "like_new",
  "good",
  "fair",
  "poor",
];
const CURRENCIES: NonNullable<CreateListingInput["currency"]>[] = ["USD", "HTG", "DOP"];

export type ListingEditorValues = {
  title: string;
  description: string;
  price: string;
  currency: NonNullable<CreateListingInput["currency"]>;
  categoryId: number | null;
  condition: CreateListingInput["condition"];
  city: string;
  country: string;
  images: string[];
};

type Props = {
  token: string;
  initial: ListingEditorValues;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (payload: CreateListingInput) => Promise<void>;
};

export function ListingEditor({ token, initial, submitLabel, busy, onSubmit }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [price, setPrice] = useState(initial.price);
  const [currency, setCurrency] = useState(initial.currency);
  const [categoryId, setCategoryId] = useState<number | null>(initial.categoryId);
  const [condition, setCondition] = useState(initial.condition);
  const [city, setCity] = useState(initial.city);
  const [country] = useState(initial.country);
  const [images, setImages] = useState<string[]>(initial.images);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [catOpen, setCatOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchCategories({ token });
        if (!cancelled) setCategories(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    setTitle(initial.title);
    setDescription(initial.description);
    setPrice(initial.price);
    setCurrency(initial.currency);
    setCategoryId(initial.categoryId);
    setCondition(initial.condition);
    setCity(initial.city);
    setImages(initial.images);
  }, [initial]);

  const cities = useMemo(() => citiesForCountry(country), [country]);
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || null,
    [categories, categoryId],
  );

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to add product photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 8,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const asset of result.assets) {
        const url = await uploadListingImage(asset.uri, {
          token,
          contentType: asset.mimeType || "image/jpeg",
          fileName: asset.fileName || `listing-${Date.now()}.jpg`,
        });
        uploaded.push(url);
      }
      setImages((prev) => [...prev, ...uploaded].slice(0, 8));
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload photos");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url: string) => {
    setImages((prev) => prev.filter((x) => x !== url));
  };

  const handleSubmit = async () => {
    if (!title.trim() || title.trim().length < 3) {
      Alert.alert("Title required", "Enter a product title (at least 3 characters).");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      Alert.alert("Description required", "Add a description (at least 10 characters).");
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      Alert.alert("Price required", "Enter a valid price greater than 0.");
      return;
    }
    if (!categoryId) {
      Alert.alert("Category required", "Choose a category.");
      return;
    }
    if (!city.trim()) {
      Alert.alert("City required", "Choose a city.");
      return;
    }
    if (images.length < 1) {
      Alert.alert("Photo required", "Add at least one product photo.");
      return;
    }
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      price: priceNum,
      currency,
      categoryId,
      condition,
      location: city.trim(),
      city: city.trim(),
      country,
      images,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imgRow}>
        {images.map((uri) => (
          <View key={uri} style={styles.imgWrap}>
            <Image source={{ uri }} style={styles.img} contentFit="cover" />
            <Pressable style={styles.imgRemove} onPress={() => removeImage(uri)}>
              <Feather name="x" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.addImg} onPress={() => void pickImages()} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color={colors.flexaGreen} />
          ) : (
            <>
              <Feather name="camera" size={22} color={colors.flexaGreen} />
              <Text style={styles.addImgText}>Add</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Field label="Title" value={title} onChangeText={setTitle} placeholder="What are you selling?" />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Condition, size, details…"
        multiline
      />

      <Text style={styles.label}>Price</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#94A3B8"
        />
        <View style={styles.chipRow}>
          {CURRENCIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, currency === c && styles.chipOn]}
              onPress={() => setCurrency(c)}
            >
              <Text style={[styles.chipText, currency === c && styles.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.label}>Category</Text>
      <Pressable style={styles.select} onPress={() => setCatOpen(true)}>
        <Text style={styles.selectText}>
          {loadingCats
            ? "Loading…"
            : selectedCategory?.name || "Select category"}
        </Text>
        <Feather name="chevron-down" size={18} color="#64748B" />
      </Pressable>

      <Text style={styles.label}>Condition</Text>
      <View style={styles.chipRowWrap}>
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

      <Text style={styles.label}>Country</Text>
      <View style={styles.select}>
        <Text style={styles.selectText}>{country || "—"}</Text>
      </View>

      <Text style={styles.label}>City</Text>
      <Pressable style={styles.select} onPress={() => setCityOpen(true)}>
        <Text style={styles.selectText}>{city || "Select city"}</Text>
        <Feather name="chevron-down" size={18} color="#64748B" />
      </Pressable>

      <Pressable
        style={[styles.submit, (busy || uploading) && styles.submitDisabled]}
        disabled={!!busy || uploading}
        onPress={() => void handleSubmit()}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{submitLabel}</Text>
        )}
      </Pressable>

      <PickerModal
        visible={catOpen}
        title="Category"
        options={categories.map((c) => ({ id: String(c.id), label: c.name }))}
        onClose={() => setCatOpen(false)}
        onSelect={(id) => {
          setCategoryId(Number(id));
          setCatOpen(false);
        }}
      />
      <PickerModal
        visible={cityOpen}
        title="City"
        options={cities.map((c) => ({ id: c, label: c }))}
        onClose={() => setCityOpen(false)}
        onSelect={(id) => {
          setCity(id);
          setCityOpen(false);
        }}
      />
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </>
  );
}

function PickerModal({
  visible,
  title,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: { id: string; label: string }[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>{title}</Text>
        <ScrollView>
          {options.map((o) => (
            <Pressable key={o.id} style={styles.modalRow} onPress={() => onSelect(o.id)}>
              <Text style={styles.modalRowText}>{o.label}</Text>
            </Pressable>
          ))}
          {options.length === 0 ? (
            <Text style={styles.empty}>No options available</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48, gap: 4 },
  label: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  textarea: { minHeight: 110 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  chipRow: { flexDirection: "row", gap: 6 },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontSize: 12, fontWeight: "700", color: "#475569", textTransform: "capitalize" },
  chipTextOn: { color: "#fff" },
  select: {
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { fontSize: 15, color: "#0F172A", flex: 1 },
  imgRow: { marginBottom: 4 },
  imgWrap: { marginRight: 10, position: "relative" },
  img: { width: 88, height: 88, borderRadius: 12, backgroundColor: "#E2E8F0" },
  imgRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(15,23,42,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  addImg: {
    width: 88,
    height: 88,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.flexaGreen,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
  },
  addImgText: { fontSize: 12, fontWeight: "700", color: colors.flexaGreen },
  submit: {
    marginTop: 24,
    backgroundColor: colors.flexaGreen,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  modalSheet: {
    maxHeight: "55%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  modalRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E2E8F0" },
  modalRowText: { fontSize: 15, color: "#0F172A" },
  empty: { paddingVertical: 20, textAlign: "center", color: "#64748B" },
});
