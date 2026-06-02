import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const insets = useSafeAreaInsets();

  const handleRestart = async () => {
    try { await reloadAppAsync(); } catch { resetError(); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <Feather name="alert-triangle" size={48} color="#F97316" />
      <Text style={styles.title}>Yon erè te rive</Text>
      <Text style={styles.message}>{error.message}</Text>
      <Pressable style={styles.btn} onPress={handleRestart}>
        <Feather name="refresh-cw" size={16} color="#fff" />
        <Text style={styles.btnText}>Reyamase App la</Text>
      </Pressable>
      <Pressable style={[styles.btn, { backgroundColor: "#1e293b" }]} onPress={resetError}>
        <Text style={styles.btnText}>Eseye Ankò</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#F8FAFC" },
  message: { fontSize: 13, color: "#94a3b8", textAlign: "center" },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F97316", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, width: "100%", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
