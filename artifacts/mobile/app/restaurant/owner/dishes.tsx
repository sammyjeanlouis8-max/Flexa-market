import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  createDishModel,
  createDishOption,
  createDishOptionGroup,
  fetchDishModels,
  fetchDishOptions,
  formatMoney,
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
  const [photoUrl, setPhotoUrl] = useState("");
  const [allergens, setAllergens] = useState("");
  const [saving, setSaving] = useState(false);
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
    if (!photoUrl.trim()) {
      setError(t("restaurant_foodImageRequired") || "A food image URL is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDishModel(
        restaurantId,
        {
          name: name.trim(),
          description: description.trim(),
          price: Number(price) || 0,
          photos: [photoUrl.trim()],
          allergens: allergens.trim(),
          defaultAvailable: true,
        },
        { token },
      );
      setName("");
      setDescription("");
      setPrice("");
      setPhotoUrl("");
      setAllergens("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not create dish");
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
          <TextInput value={photoUrl} onChangeText={setPhotoUrl} placeholder="Food image URL (required)" placeholderTextColor={T.muted} style={styles.input} autoCapitalize="none" />
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
                <Text style={styles.title}>{d.name}</Text>
                <Text style={styles.muted}>
                  {formatMoney(d.price, d.currency)}
                  {!d.photos?.length ? " · missing image" : ` · ${d.photos.length} photo(s)`}
                </Text>
              </Pressable>
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
