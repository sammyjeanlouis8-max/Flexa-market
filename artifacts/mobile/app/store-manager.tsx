/**
 * Seller: invite / remove store manager.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSellerManager,
  inviteStoreManager,
  removeStoreManager,
  type StoreManager,
} from "@/lib/storeManagerApi";

export default function StoreManagerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [manager, setManager] = useState<StoreManager>(null);
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setManager(await fetchSellerManager({ token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load manager");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const onInvite = async () => {
    if (!token || !identifier.trim()) return;
    setBusy(true);
    try {
      const m = await inviteStoreManager(identifier.trim(), { token });
      setManager(m);
      setIdentifier("");
      Alert.alert("Invited", "Store manager linked to your seller account.");
    } catch (e) {
      Alert.alert("Invite failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = () => {
    if (!token) return;
    Alert.alert("Remove manager?", "They will lose store order access.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await removeStoreManager({ token });
            setManager(null);
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Error");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingHorizontal: 16 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Store manager</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.note}>
            Invite a trusted helper by email or phone. They can mark orders ready —
            they do not receive admin privileges.
          </Text>
          {manager ? (
            <>
              <Text style={styles.label}>Current manager</Text>
              <Text style={styles.value}>{manager.name || "Manager"}</Text>
              <Text style={styles.meta}>
                {[manager.email, manager.phone].filter(Boolean).join(" · ")}
              </Text>
              <Pressable style={styles.danger} onPress={onRemove} disabled={busy}>
                <Text style={styles.dangerText}>Remove manager</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Email or phone</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="manager@example.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                testID="input-manager-identifier"
              />
              <Pressable
                style={[styles.btn, busy && { opacity: 0.7 }]}
                onPress={onInvite}
                disabled={busy}
                testID="btn-invite-manager"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Invite manager</Text>
                )}
              </Pressable>
            </>
          )}
          <Pressable style={styles.link} onPress={() => router.push("/manager")}>
            <Text style={styles.linkText}>Open manager dashboard</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  error: { color: "#B91C1C", fontWeight: "600" },
  note: { color: "#64748B", fontSize: 13, lineHeight: 18, marginBottom: 8 },
  label: { fontWeight: "700", color: "#0F172A" },
  value: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#0F172A",
  },
  btn: {
    marginTop: 4,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  danger: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  dangerText: { color: "#DC2626", fontWeight: "800" },
  link: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: "#EA580C", fontWeight: "700" },
});
