/**
 * Wallet P2P transfer — search/preview/send via /api/wallet/p2p*
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, money } from "@/lib/request";

type UserHit = { id: number; name: string; avatar?: string | null; country?: string | null };
type Preview = {
  amountUsd: number;
  feeUsd: number;
  netAmountUsd: number;
  canTransfer: boolean;
  blockReason?: string | null;
  monthlyUsed?: number;
  monthlyLimit?: number;
  maxSendable?: number;
};

function idemKey() {
  return `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function WalletTransferScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<UserHit | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  useEffect(() => {
    if (!token || q.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiRequest<{ users: UserHit[] }>(
          `/wallet/p2p/search?q=${encodeURIComponent(q.trim())}`,
          { token },
        );
        if (!cancelled) setHits(res.users ?? []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, token]);

  useEffect(() => {
    if (!token || !selected || !amount) {
      setPreview(null);
      return;
    }
    const amountUsd = Number(amount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const p = await apiRequest<Preview>("/wallet/p2p/preview", {
          token,
          method: "POST",
          body: { toUserId: selected.id, amountUsd },
        });
        if (!cancelled) {
          setPreview(p);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token, selected, amount]);

  const send = async () => {
    if (!token || !selected) return;
    const amountUsd = Number(amount);
    if (!preview?.canTransfer) {
      Alert.alert("Cannot transfer", preview?.blockReason || "Check amount and recipient");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/wallet/p2p", {
        token,
        method: "POST",
        body: { toUserId: selected.id, amountUsd, note: note.trim() || undefined },
        headers: { "Idempotency-Key": idemKey() },
      });
      Alert.alert("Sent", `Transferred ${money(amountUsd)} to ${selected.name}`, [
        { text: "History", onPress: () => router.replace("/wallet-history") },
        { text: "OK", onPress: () => router.replace("/wallet") },
      ]);
    } catch (e) {
      Alert.alert("Transfer failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Transfer" showBack showCart={false} />
      <View style={styles.body}>
        <Text style={styles.label}>Recipient</Text>
        {selected ? (
          <Pressable style={styles.selected} onPress={() => setSelected(null)}>
            <Text style={styles.selectedName}>{selected.name}</Text>
            <Text style={styles.meta}>{selected.country || "Tap to change"}</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.search}>
              <Feather name="search" size={18} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="Name, email, or phone"
                placeholderTextColor="#94A3B8"
              />
              {searching ? <ActivityIndicator size="small" color={colors.flexaGreen} /> : null}
            </View>
            <FlatList
              data={hits}
              keyExtractor={(u) => String(u.id)}
              style={{ maxHeight: 180 }}
              renderItem={({ item }) => (
                <Pressable style={styles.hit} onPress={() => { setSelected(item); setQ(""); setHits([]); }}>
                  <Text style={styles.hitName}>{item.name}</Text>
                  <Text style={styles.meta}>{item.country || ""}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                q.trim().length >= 2 && !searching ? (
                  <Text style={styles.empty}>No users found</Text>
                ) : null
              }
            />
          </>
        )}

        <Text style={styles.label}>Amount (USD)</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor="#94A3B8"
        />
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="What's this for?"
          placeholderTextColor="#94A3B8"
        />

        {preview ? (
          <View style={styles.preview}>
            <Text style={styles.previewLine}>Fee {money(preview.feeUsd)}</Text>
            <Text style={styles.previewLine}>Recipient gets {money(preview.netAmountUsd)}</Text>
            {preview.monthlyLimit != null ? (
              <Text style={styles.meta}>
                Monthly used {money(preview.monthlyUsed)} / {money(preview.monthlyLimit)}
              </Text>
            ) : null}
            {!preview.canTransfer && preview.blockReason ? (
              <Text style={styles.err}>{preview.blockReason}</Text>
            ) : null}
          </View>
        ) : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}

        <Pressable
          style={[styles.btn, (!preview?.canTransfer || busy) && { opacity: 0.5 }]}
          disabled={!preview?.canTransfer || busy}
          onPress={() => void send()}
        >
          <Text style={styles.btnText}>{busy ? "Sending…" : "Send transfer"}</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/wallet-history")}>
          <Text style={styles.link}>View transfer history</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  body: { padding: 16, flex: 1 },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginBottom: 6, marginTop: 10 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: { flex: 1, color: colors.light.text },
  hit: {
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.border,
    padding: 12,
  },
  hitName: { fontWeight: "700", color: colors.light.text },
  selected: {
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  selectedName: { fontWeight: "800", color: colors.flexaGreen },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  empty: { color: "#94A3B8", padding: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: colors.light.text,
  },
  preview: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    gap: 4,
  },
  previewLine: { fontWeight: "700", color: colors.light.text },
  err: { color: colors.light.destructive, marginTop: 8 },
  btn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { marginTop: 14, textAlign: "center", color: colors.flexaGreen, fontWeight: "700" },
});
