import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchCategories, getApiBase } from "@/lib/api";

type Category = { id: number | string; name: string; slug: string };

export default function SellScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { country } = useMarketplace();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(country === "Haiti" ? "USD" : "USD");
  const [city, setCity] = useState(user?.city || "");
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchCategories({ token })
      .then((cats) => {
        const list = Array.isArray(cats)
          ? cats
          : Array.isArray((cats as any)?.categories)
            ? (cats as any).categories
            : [];
        setCategories(list as Category[]);
      })
      .catch(() => setCategories([]));
  }, [token]);

  if (!token) {
    return (
      <View style={styles.root}>
        <AppHeader title="Add a product" showBrand={false} showBack showMenu={false} />
        <View style={styles.center}>
          <Text style={styles.msg}>Sign in to create a listing.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to add product images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 8,
    });
    if (result.canceled) return;
    setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 8));
  };

  const submit = async () => {
    if (!title.trim() || !price.trim()) {
      Alert.alert("Missing fields", "Title and price are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: Number(price),
          currency,
          country,
          city: city.trim() || undefined,
          category: category || undefined,
          images,
          status: "active",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status})`);
      const id = data.id || data.listing?.id;
      Alert.alert("Listed", "Your product was published.");
      if (id) router.replace(`/listing/${id}` as any);
      else router.replace("/my-listings");
    } catch (e) {
      Alert.alert("Could not publish", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Add a product" showBrand={false} showBack showMenu={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Product title" />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your item"
          multiline
        />
        <Text style={styles.label}>Price</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        <Text style={styles.label}>Currency</Text>
        <View style={styles.row}>
          {["USD", "HTG", "DOP"].map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, currency === c && styles.chipOn]}
              onPress={() => setCurrency(c)}
            >
              <Text style={[styles.chipText, currency === c && styles.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {categories.map((c) => (
            <Pressable
              key={String(c.id)}
              style={[styles.chip, category === c.slug && styles.chipOn]}
              onPress={() => setCategory(c.slug)}
            >
              <Text style={[styles.chipText, category === c.slug && styles.chipTextOn]}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.label}>City ({country})</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" />
        <Text style={styles.label}>Photos</Text>
        <Pressable style={styles.photoBtn} onPress={() => void pickImages()}>
          <Text style={styles.photoBtnText}>Add photos</Text>
        </Pressable>
        <View style={styles.photos}>
          {images.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.thumb} contentFit="cover" />
          ))}
        </View>
        <Pressable style={styles.btn} onPress={() => void submit()} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Publish listing</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  msg: { color: "#475569", fontSize: 15 },
  label: { marginTop: 8, fontWeight: "700", color: "#0F172A" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  area: { minHeight: 100, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontWeight: "700", color: "#334155", fontSize: 12 },
  chipTextOn: { color: "#FFFFFF" },
  photoBtn: {
    borderWidth: 1,
    borderColor: colors.flexaOrange,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  photoBtnText: { color: colors.flexaOrange, fontWeight: "800" },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 10 },
  btn: {
    marginTop: 16,
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});
