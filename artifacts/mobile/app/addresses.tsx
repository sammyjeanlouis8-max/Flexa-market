/**
 * Native Address Book — list / add / edit / delete / default via /api/me/addresses
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
  validateAddressInput,
  type AddressInput,
  type UserAddress,
} from "@/lib/addressesApi";

const COUNTRIES = [
  { code: "Haiti", label: "Haiti 🇭🇹" },
  { code: "Dominican Republic", label: "Dominican Republic 🇩🇴" },
];

const emptyForm = (countryHint?: string): AddressInput => ({
  kind: "delivery",
  label: "Home",
  fullName: "",
  phone: "",
  street: "",
  apartment: "",
  city: "",
  region: "",
  postalCode: "",
  country: countryHint?.includes("Dominican") ? "Dominican Republic" : "Haiti",
  isDefault: false,
});

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<UserAddress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AddressInput>(emptyForm(user?.country));
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const data = await listAddresses({ token }, "delivery");
        setRows(data.addresses);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load addresses");
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(user?.country));
    setEditorOpen(true);
  };

  const openEdit = (a: UserAddress) => {
    setEditingId(a.id);
    setForm({
      kind: "delivery",
      label: a.label ?? "Home",
      fullName: a.fullName,
      phone: a.phone,
      email: a.email ?? null,
      street: a.street,
      apartment: a.apartment ?? "",
      city: a.city,
      region: a.region,
      postalCode: a.postalCode ?? "",
      country: a.country,
      isDefault: a.isDefault,
    });
    setEditorOpen(true);
  };

  const onSave = async () => {
    if (!token) return;
    const err = validateAddressInput(form);
    if (err) {
      Alert.alert("Check address", err);
      return;
    }
    setSaving(true);
    try {
      if (editingId != null) {
        await updateAddress(editingId, form, { token });
      } else {
        await createAddress(form, { token });
      }
      setEditorOpen(false);
      await load("refresh");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (a: UserAddress) => {
    Alert.alert("Delete address", `Remove “${a.label || a.fullName}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await deleteAddress(a.id, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert("Delete failed", e instanceof Error ? e.message : "Error");
          }
        },
      },
    ]);
  };

  const onSetDefault = async (a: UserAddress) => {
    if (!token || a.isDefault) return;
    try {
      await setDefaultAddress(a.id, { token });
      await load("refresh");
    } catch (e) {
      Alert.alert("Default failed", e instanceof Error ? e.message : "Error");
    }
  };

  const setField = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Addresses</Text>
        <Pressable style={styles.addBtn} onPress={openCreate}>
          <Feather name="plus" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No saved delivery addresses yet. Add one for faster checkout.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardLabel}>{item.label || "Address"}</Text>
                {item.isDefault ? (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardName}>{item.fullName}</Text>
              <Text style={styles.cardLine}>{item.street}</Text>
              {item.apartment ? <Text style={styles.cardLine}>{item.apartment}</Text> : null}
              <Text style={styles.cardLine}>
                {item.city}, {item.region}
                {item.postalCode ? ` ${item.postalCode}` : ""}
              </Text>
              <Text style={styles.cardLine}>{item.country}</Text>
              <Text style={styles.cardPhone}>{item.phone}</Text>
              <View style={styles.cardActions}>
                {!item.isDefault ? (
                  <Pressable onPress={() => void onSetDefault(item)}>
                    <Text style={styles.link}>Set default</Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                <View style={styles.cardActionsRight}>
                  <Pressable onPress={() => openEdit(item)}>
                    <Text style={styles.link}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => onDelete(item)}>
                    <Text style={[styles.link, { color: "#B91C1C" }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={editorOpen} animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.topBar}>
            <Pressable style={styles.back} onPress={() => setEditorOpen(false)}>
              <Feather name="x" size={22} color="#0F172A" />
            </Pressable>
            <Text style={styles.title}>{editingId ? "Edit address" : "Add address"}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {(
              [
                ["label", "Label", "Home"],
                ["fullName", "Full name", "Jean Pierre"],
                ["phone", "Phone", "+509..."],
                ["street", "Street", "Street address"],
                ["apartment", "Apartment (optional)", "Apt / floor"],
                ["city", "City", "Port-au-Prince"],
                ["region", "State / region", "Ouest"],
                ["postalCode", "Postal code", "HT6110"],
              ] as const
            ).map(([key, label, placeholder]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={String(form[key] ?? "")}
                  placeholder={placeholder}
                  placeholderTextColor="#94A3B8"
                  onChangeText={(v) => setField(key, v)}
                  autoCapitalize={key === "phone" ? "none" : "words"}
                  keyboardType={key === "phone" ? "phone-pad" : "default"}
                />
              </View>
            ))}
            <Text style={styles.fieldLabel}>Country</Text>
            <View style={styles.countryRow}>
              {COUNTRIES.map((c) => (
                <Pressable
                  key={c.code}
                  style={[styles.countryChip, form.country === c.code && styles.countryChipOn]}
                  onPress={() => setField("country", c.code)}
                >
                  <Text
                    style={[
                      styles.countryChipText,
                      form.country === c.code && styles.countryChipTextOn,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.checkRow}
              onPress={() => setField("isDefault", !form.isDefault)}
            >
              <Feather
                name={form.isDefault ? "check-square" : "square"}
                size={20}
                color={form.isDefault ? "#F97316" : "#94A3B8"}
              />
              <Text style={styles.checkText}>Set as default delivery address</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={() => void onSave()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save address</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  modalRoot: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40, lineHeight: 20 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  defaultBadge: {
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  defaultBadgeText: { color: "#C2410C", fontSize: 11, fontWeight: "800" },
  cardName: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginTop: 4 },
  cardLine: { color: "#475569", marginTop: 2, fontSize: 14 },
  cardPhone: { color: "#0F172A", marginTop: 6, fontWeight: "600" },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    alignItems: "center",
  },
  cardActionsRight: { flexDirection: "row", gap: 16 },
  link: { color: "#F97316", fontWeight: "700", fontSize: 14 },
  field: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    color: "#0F172A",
    fontSize: 15,
  },
  countryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  countryChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  countryChipOn: { borderColor: "#F97316", backgroundColor: "#FFF7ED" },
  countryChipText: { fontWeight: "700", color: "#64748B", fontSize: 13 },
  countryChipTextOn: { color: "#C2410C" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  checkText: { color: "#0F172A", fontWeight: "600" },
  saveBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
