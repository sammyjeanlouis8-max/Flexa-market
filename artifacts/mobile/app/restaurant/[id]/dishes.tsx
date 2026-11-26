/**
 * Modèl Manje — reusable dish templates for a restaurant.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import {
  createDishModel,
  deleteDishModel,
  duplicateDishModel,
  fetchDishModels,
  updateDishModel,
} from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { DishCategory, DishModel } from "@/lib/restaurantTypes";

const CATEGORIES: DishCategory[] = ["main", "appetizer", "drink", "dessert", "side", "other"];

export default function DishModelsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = Number(id);
  const { token } = useAuth();
  const [list, setList] = useState<DishModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DishModel | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<DishCategory>("main");
  const [tags, setTags] = useState("");
  const [availableByDefault, setAvailableByDefault] = useState(true);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(restaurantId)) return;
    setLoading(true);
    setError(null);
    try {
      setList(await fetchDishModels(restaurantId, { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [token, restaurantId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setPrice("");
    setCategory("main");
    setTags("");
    setAvailableByDefault(true);
    setModalOpen(true);
  };

  const openEdit = (d: DishModel) => {
    setEditing(d);
    setName(d.name);
    setDescription(d.description || "");
    setPrice(String(d.price));
    setCategory(d.category);
    setTags(d.tags.join(", "));
    setAvailableByDefault(d.isAvailableByDefault);
    setModalOpen(true);
  };

  const save = async () => {
    if (!token) return;
    if (!name.trim() || !price.trim() || Number.isNaN(Number(price))) {
      setError("Name and valid price are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        currency: "USD",
        category,
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        isAvailableByDefault: availableByDefault,
      };
      if (editing) {
        await updateDishModel(restaurantId, editing.id, payload, { token });
      } else {
        await createDishModel(restaurantId, payload, { token });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (d: DishModel) => {
    Alert.alert("Delete dish model?", d.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (!token) return;
            try {
              await deleteDishModel(restaurantId, d.id, { token });
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Delete failed");
            }
          })();
        },
      },
    ]);
  };

  const onDuplicate = async (d: DishModel) => {
    if (!token) return;
    try {
      await duplicateDishModel(restaurantId, d.id, { token });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate failed");
    }
  };

  return (
    <RestaurantGate>
      <RestaurantShell title="Modèl Manje" subtitle="Saved dish models for your kitchen">
        <Pressable style={styles.add} onPress={openCreate} testID="restaurant-dish-add">
          <Feather name="plus" size={16} color={T.white} />
          <Text style={styles.addText}>New dish model</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No dish models yet</Text>
            <Text style={styles.emptyBody}>
              Save standard dishes here, then import them into Meni Chak Jou in one tap.
            </Text>
          </View>
        ) : (
          list.map((d) => (
            <View key={d.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{d.name}</Text>
                <Text style={styles.meta}>
                  {d.category} · {d.currency} {d.price.toFixed(2)}
                </Text>
                {d.description ? (
                  <Text style={styles.desc} numberOfLines={2}>
                    {d.description}
                  </Text>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => openEdit(d)} hitSlop={8}>
                  <Feather name="edit-3" size={16} color={T.forest} />
                </Pressable>
                <Pressable onPress={() => void onDuplicate(d)} hitSlop={8}>
                  <Feather name="copy" size={16} color={T.forest} />
                </Pressable>
                <Pressable onPress={() => onDelete(d)} hitSlop={8}>
                  <Feather name="trash-2" size={16} color={T.danger} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        {error && !modalOpen ? <Text style={styles.error}>{error}</Text> : null}

        <Modal visible={modalOpen} animationType="slide" transparent>
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing ? "Edit dish model" : "New dish model"}</Text>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} />
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <Text style={styles.label}>Price (USD)</Text>
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
              <Text style={styles.label}>Category</Text>
              <View style={styles.cats}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.cat, category === c && styles.catOn]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={[styles.catText, category === c && styles.catTextOn]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Tags (comma-separated)</Text>
              <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="spicy, vegan" placeholderTextColor="#94A3B8" />
              <View style={styles.toggleRow}>
                <Text style={styles.toggleTitle}>Available by default</Text>
                <Switch
                  value={availableByDefault}
                  onValueChange={setAvailableByDefault}
                  trackColor={{ false: "#CBD5E1", true: T.accentSoft }}
                  thumbColor={availableByDefault ? T.forest : "#F8FAFC"}
                />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable style={styles.cancel} onPress={() => setModalOpen(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.save, saving && { opacity: 0.7 }]}
                  disabled={saving}
                  onPress={() => void save()}
                >
                  {saving ? <ActivityIndicator color={T.white} /> : <Text style={styles.saveText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </RestaurantShell>
    </RestaurantGate>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.forest,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  addText: { color: T.white, fontWeight: "800", fontSize: 13 },
  card: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  name: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { fontSize: 12, color: T.muted, fontWeight: "600", marginTop: 2 },
  desc: { fontSize: 12, color: T.muted, marginTop: 4 },
  actions: { flexDirection: "row", gap: 14, alignItems: "center" },
  empty: { paddingVertical: 28, alignItems: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: T.ink },
  emptyBody: { marginTop: 6, fontSize: 12, color: T.muted, textAlign: "center" },
  error: { color: T.danger, fontWeight: "600", marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: T.mintSoft,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: T.ink, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "800", color: T.forest, marginBottom: 6, marginTop: 6 },
  input: {
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    color: T.ink,
  },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cat: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  catOn: { backgroundColor: T.mint, borderColor: T.accent },
  catText: { fontSize: 12, fontWeight: "700", color: T.muted },
  catTextOn: { color: T.forest },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  toggleTitle: { fontSize: 13, fontWeight: "700", color: T.ink },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancel: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  cancelText: { fontWeight: "800", color: T.ink },
  save: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: T.forest,
  },
  saveText: { fontWeight: "800", color: T.white },
});
