import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { NativePhotoField } from "@/components/media/NativePhotoField";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { isHttpsImageUrl } from "@/lib/nativePhotoPicker";
import {
  createDishModel,
  createDishOption,
  createDishOptionGroup,
  fetchDishModels,
  fetchDishOptions,
  formatMoney,
  updateDishModel,
  type DishModel,
  type DishOptionGroup,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function OwnerDishesScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const { rid } = useLocalSearchParams<{ rid?: string }>();
  const restaurantId = Number(rid) || 0;
  const [dishes, setDishes] = useState<DishModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState(false);
  const [allergens, setAllergens] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [editPhotoError, setEditPhotoError] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [groups, setGroups] = useState<DishOptionGroup[]>([]);
  const [groupName, setGroupName] = useState("Size");
  const [optionName, setOptionName] = useState("");
  const [optionPrice, setOptionPrice] = useState("0");

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    try {
      setDishes(await fetchDishModels(restaurantId, { token }));
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
    }
  }, [restaurantId, token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  async function create() {
    if (!token) return;
    const validPhotos = photos.filter(isHttpsImageUrl);
    if (validPhotos.length < 1) {
      setPhotoError(true);
      setError(t("restaurant_foodImageRequired") || "A food image is required before publishing.");
      return;
    }
    if (!name.trim()) {
      setError(t("restaurant_dishNameRequired") || "Dish name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setPhotoError(false);
    try {
      await createDishModel(
        restaurantId,
        {
          name: name.trim(),
          description: description.trim(),
          price: Number(price) || 0,
          photos: validPhotos.slice(0, 8),
          allergens: allergens.trim(),
          defaultAvailable: true,
        },
        { token },
      );
      setName("");
      setDescription("");
      setPrice("");
      setPhotos([]);
      setAllergens("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not create dish");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(dish: DishModel) {
    setEditingId(dish.id);
    setEditPhotos((dish.photos || []).filter(isHttpsImageUrl));
    setEditPhotoError(false);
    setError(null);
  }

  async function saveEdit() {
    if (!token || !editingId) return;
    const validPhotos = editPhotos.filter(isHttpsImageUrl);
    if (validPhotos.length < 1) {
      setEditPhotoError(true);
      setError(t("restaurant_foodImageRequired") || "A food image is required before publishing.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateDishModel(
        restaurantId,
        editingId,
        { photos: validPhotos.slice(0, 8), defaultAvailable: true },
        { token },
      );
      setEditingId(null);
      setEditPhotos([]);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not update dish photos");
    } finally {
      setSaving(false);
    }
  }

  async function openOptions(dishId: number) {
    setExpanded(dishId);
    try {
      setGroups(await fetchDishOptions(restaurantId, dishId, { token }));
    } catch {
      setGroups([]);
    }
  }

  async function addGroup() {
    if (!expanded || !token) return;
    try {
      await createDishOptionGroup(
        restaurantId,
        expanded,
        { name: groupName.trim() || "Options", kind: "variant", required: true, minSelect: 1, maxSelect: 1 },
        { token },
      );
      await openOptions(expanded);
    } catch (e: any) {
      setError(e?.message || "Could not create group");
    }
  }

  async function addOption(groupId: number) {
    if (!token || !optionName.trim()) return;
    try {
      await createDishOption(
        restaurantId,
        groupId,
        { name: optionName.trim(), priceDelta: Number(optionPrice) || 0 },
        { token },
      );
      setOptionName("");
      setOptionPrice("0");
      if (expanded) await openOptions(expanded);
    } catch (e: any) {
      setError(e?.message || "Could not create option");
    }
  }

  return (
    <RestaurantShell title={t("restaurant_dishModels") || "Dish models"} subtitle={t("restaurant_dishModelsSubtitle") || ""} scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.section}>{t("restaurant_addFood") || "Add food"}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={T.muted} style={styles.input} />
          <TextInput value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={T.muted} style={styles.input} multiline />
          <TextInput value={price} onChangeText={setPrice} placeholder="Price" placeholderTextColor={T.muted} style={styles.input} keyboardType="decimal-pad" />
          <NativePhotoField
            token={token}
            value={photos}
            onChange={(urls) => {
              setPhotos(urls);
              if (urls.length) setPhotoError(false);
            }}
            max={5}
            multiple
            required
            showError={photoError}
            label={t("restaurant_foodPhotos") || "Food photos"}
            helpText={t("restaurant_foodPhotosHelp") || "Gallery or camera. At least one photo required."}
            testID="restaurant-dish-photos"
          />
          <TextInput value={allergens} onChangeText={setAllergens} placeholder="Allergens" placeholderTextColor={T.muted} style={styles.input} />
          <Pressable style={[styles.btn, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void create()}>
            <Text style={styles.btnText}>{t("restaurant_saveDish") || "Save dish"}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : (
          dishes.map((d) => (
            <View key={d.id} style={styles.card}>
              <Pressable onPress={() => void openOptions(d.id)}>
                <View style={styles.dishHead}>
                  {d.photos?.[0] ? (
                    <Image source={{ uri: d.photos[0] }} style={styles.dishThumb} />
                  ) : (
                    <View style={[styles.dishThumb, styles.dishThumbEmpty]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{d.name}</Text>
                    <Text style={styles.muted}>
                      {formatMoney(d.price, d.currency)}
                      {!d.photos?.length
                        ? ` · ${t("restaurant_missingImage") || "missing image"}`
                        : ` · ${d.photos.length} photo(s)`}
                    </Text>
                  </View>
                </View>
              </Pressable>
              {editingId === d.id ? (
                <View style={{ marginTop: 10 }}>
                  <NativePhotoField
                    token={token}
                    value={editPhotos}
                    onChange={(urls) => {
                      setEditPhotos(urls);
                      if (urls.length) setEditPhotoError(false);
                    }}
                    max={5}
                    multiple
                    required
                    showError={editPhotoError}
                    label={t("restaurant_editFoodPhotos") || "Edit food photos"}
                    testID={`restaurant-dish-edit-${d.id}`}
                  />
                  <View style={styles.row}>
                    <Pressable style={[styles.btn, { flex: 1 }, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void saveEdit()}>
                      <Text style={styles.btnText}>{t("restaurant_savePhotos") || "Save photos"}</Text>
                    </Pressable>
                    <Pressable style={styles.secondary} onPress={() => setEditingId(null)}>
                      <Text style={styles.secondaryText}>{t("nativePhoto_cancel") || "Cancel"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={[styles.secondary, { marginTop: 8 }]} onPress={() => startEdit(d)}>
                  <Text style={styles.secondaryText}>{t("restaurant_editPhotos") || "Edit photos"}</Text>
                </Pressable>
              )}
              {expanded === d.id ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.section}>{t("restaurant_variants") || "Variants / toppings"}</Text>
                  {groups.map((g) => (
                    <View key={g.id} style={styles.group}>
                      <Text style={styles.title}>
                        {g.name} {g.required ? "(required)" : ""}
                      </Text>
                      {g.options.map((o) => (
                        <Text key={o.id} style={styles.muted}>
                          · {o.name} (+{formatMoney(o.priceDelta)})
                        </Text>
                      ))}
                      <View style={styles.row}>
                        <TextInput
                          value={optionName}
                          onChangeText={setOptionName}
                          placeholder="Option name"
                          placeholderTextColor={T.muted}
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        />
                        <TextInput
                          value={optionPrice}
                          onChangeText={setOptionPrice}
                          placeholder="+$"
                          placeholderTextColor={T.muted}
                          style={[styles.input, { width: 70, marginBottom: 0 }]}
                          keyboardType="decimal-pad"
                        />
                        <Pressable style={styles.mini} onPress={() => void addOption(g.id)}>
                          <Text style={styles.miniText}>Add</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  <TextInput value={groupName} onChangeText={setGroupName} placeholder="New group name" placeholderTextColor={T.muted} style={styles.input} />
                  <Pressable style={styles.secondary} onPress={() => void addGroup()}>
                    <Text style={styles.secondaryText}>{t("restaurant_addOptionGroup") || "Add option group"}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        )}
        {error ? <Text style={styles.err}>{error}</Text> : null}
      </ScrollView>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  section: { fontSize: 14, fontWeight: "800", color: T.ink, marginBottom: 8 },
  title: { fontWeight: "800", color: T.ink },
  muted: { marginTop: 4, fontSize: 12, color: T.muted },
  dishHead: { flexDirection: "row", gap: 10, alignItems: "center" },
  dishThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: T.mintSoft },
  dishThumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: T.line },
  input: {
    backgroundColor: T.mintSoft,
    borderRadius: 12,
    padding: 12,
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 8,
  },
  btn: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  secondary: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  secondaryText: { fontWeight: "800", color: T.ink },
  group: { marginBottom: 10 },
  row: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 6 },
  mini: {
    backgroundColor: T.accent,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  miniText: { color: T.white, fontWeight: "800", fontSize: 12 },
  err: { color: "#b91c1c", marginBottom: 12 },
});
