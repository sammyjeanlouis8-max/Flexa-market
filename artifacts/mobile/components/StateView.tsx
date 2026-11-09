import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
  offline?: boolean;
  onRetry?: () => void;
  children?: React.ReactNode;
};

export function StateView({
  loading,
  error,
  empty,
  emptyTitle = "Nothing here yet",
  emptyDetail,
  offline,
  onRetry,
  children,
}: Props) {
  if (loading) {
    return (
      <View style={styles.centered} accessibilityLabel="Loading">
        <ActivityIndicator color="#F97316" size="large" />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (error || offline) {
    return (
      <View style={styles.centered}>
        <Feather name={offline ? "wifi-off" : "alert-circle"} size={28} color="#FCA5A5" />
        <Text style={styles.error}>{error || "You appear to be offline."}</Text>
        {onRetry ? (
          <Pressable style={styles.retry} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.centered}>
        <Feather name="inbox" size={28} color="#64748B" />
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        {emptyDetail ? <Text style={styles.muted}>{emptyDetail}</Text> : null}
        {onRetry ? (
          <Pressable style={styles.retry} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.retryText}>Refresh</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  muted: { color: "#94A3B8", fontSize: 14, textAlign: "center" },
  error: { color: "#FCA5A5", fontSize: 14, textAlign: "center" },
  emptyTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "700", textAlign: "center" },
  retry: {
    marginTop: 6,
    backgroundColor: "#F97316",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "700" },
});
