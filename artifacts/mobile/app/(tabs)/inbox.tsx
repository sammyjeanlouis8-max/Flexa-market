import {
  getGetConversationsQueryKey,
  useGetConversations,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function InboxTab() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const enabled = Boolean(token);
  const { data, isLoading, isError, refetch } = useGetConversations({
    query: {
      queryKey: getGetConversationsQueryKey(),
      enabled,
    },
  });

  const conversations = data ?? [];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mesaj</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
          Lis konvèsasyon natif natal. Chat tan-reyèl (Socket.IO) = Faz 3.
        </Text>
      </View>

      {!token ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>
            Konekte pou wè mesaj ou yo.
          </Text>
          <Pressable
            onPress={() => router.push("/auth/login")}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaText}>Konekte</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Pa ka chaje mesaj</Text>
          <Pressable onPress={() => void refetch()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Eseye ankò
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text
              style={{ color: colors.mutedForeground, textAlign: "center" }}
            >
              Pa gen konvèsasyon pou kounye a.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/chat/${item.id}`)}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Text
                style={{ color: colors.foreground, fontWeight: "600" }}
                numberOfLines={1}
              >
                {item.otherUserName || `Konvèsasyon #${item.id}`}
              </Text>
              <Text
                style={{ color: colors.mutedForeground, fontSize: 12 }}
                numberOfLines={1}
              >
                {item.listingTitle}
              </Text>
              <Text
                style={{ color: colors.mutedForeground, fontSize: 13 }}
                numberOfLines={2}
              >
                {item.lastMessage || "Pa gen mesaj"}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 6 },
  title: { fontSize: 28, fontWeight: "700" },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    marginBottom: 10,
    backgroundColor: "#1E293B",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  cta: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  ctaText: { color: "#0F172A", fontWeight: "700" },
});
