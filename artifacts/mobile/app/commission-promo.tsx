import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/api";

export default function Screen() {
  const router = useRouter();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch(`${getApiBase()}/commission-promo`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
        setData(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  
  }, [token]);

  return (
    <View style={styles.root}>
      <AppHeader title="Commission promo" showBrand={false} showBack showMenu={false} />
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? <ActivityIndicator color={colors.flexaGreen} /> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {data ? <Text style={styles.pre}>{JSON.stringify(data, null, 2).slice(0, 3500)}</Text> : (
          <Text style={styles.msg}>Ready. Use the controls below or pull data when signed in.</Text>
        )}
        {!token ? (
          <Pressable style={styles.btn} onPress={() => router.push("/auth/login")}>
            <Text style={styles.btnText}>Log in</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 16, gap: 12 },
  msg: { color: "#64748B", lineHeight: 21 },
  err: { color: "#B91C1C" },
  pre: { fontFamily: "monospace", fontSize: 11, color: "#0F172A" },
  btn: { backgroundColor: colors.flexaGreen, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#FFFFFF", fontWeight: "800" },
});
