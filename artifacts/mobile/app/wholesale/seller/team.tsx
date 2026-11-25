import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerTeam, inviteSellerTeamMember, removeSellerTeamMember } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type Row = Awaited<ReturnType<typeof fetchSellerTeam>>[number];

export default function SellerTeamScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSellerTeam({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const invite = async () => {
    if (!token || !email.trim()) return;
    try {
      await inviteSellerTeamMember({ email: email.trim() }, { token });
      setEmail("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Invite failed");
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Team" subtitle="Invite staff to help manage wholesale depots">
        <View style={styles.invite}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="colleague@email.com"
            placeholderTextColor={T.muted}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pressable style={styles.btn} onPress={() => void invite()}>
            <Text style={styles.btnText}>Invite</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No team members yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{r.email}</Text>
                  <Text style={styles.meta}>{r.role} · {r.status}</Text>
                </View>
                <Pressable onPress={() => token && void removeSellerTeamMember(r.id, { token }).then(load)}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  invite: { flexDirection: "row", gap: 8, marginBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: T.ink,
  },
  btn: { backgroundColor: T.accent, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  btnText: { color: T.white, fontWeight: "800" },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  remove: { color: T.danger, fontWeight: "700" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
