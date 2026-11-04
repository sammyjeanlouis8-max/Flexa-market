/**
 * Native chat thread — REST messages via existing conversations API.
 * Socket.IO live updates can layer on later without changing the API contract.
 */
import {
  getGetMessagesQueryKey,
  useGetMessages,
  useSendMessage,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const colors = useColors();
  const router = useRouter();
  const { token, user } = useAuth();
  const [draft, setDraft] = useState("");
  const enabled = Boolean(token) && Number.isFinite(conversationId) && conversationId > 0;

  const { data, isLoading, isError, refetch } = useGetMessages(conversationId, {
    query: {
      queryKey: getGetMessagesQueryKey(conversationId),
      enabled,
      refetchInterval: enabled ? 8000 : false,
    },
  });
  const send = useSendMessage();

  const messages = [...(data ?? [])].reverse();

  const onSend = async () => {
    const content = draft.trim();
    if (!content || !enabled) return;
    setDraft("");
    try {
      await send.mutateAsync({ id: conversationId, data: { content } });
      await refetch();
    } catch {
      setDraft(content);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: colors.mutedForeground }}>Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Chat #{Number.isFinite(conversationId) ? conversationId : "—"}
          </Text>
        </View>

        {!token ? (
          <View style={styles.pad}>
            <SignInGate message="Sign in to open this conversation." />
          </View>
        ) : isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : isError ? (
          <View style={styles.pad}>
            <Text style={{ color: colors.foreground }}>Could not load messages.</Text>
            <Pressable onPress={() => void refetch()} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <FlatList
              data={messages}
              inverted
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
                  No messages yet. Say hello.
                </Text>
              }
              renderItem={({ item }) => {
                const mine = user?.id != null && item.senderId === user.id;
                return (
                  <View
                    style={[
                      styles.bubble,
                      {
                        alignSelf: mine ? "flex-end" : "flex-start",
                        backgroundColor: mine ? colors.primary : "#1E293B",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: mine ? "#0F172A" : colors.foreground }}>
                      {item.content}
                    </Text>
                  </View>
                );
              }}
            />
            <View style={[styles.composer, { borderColor: colors.border }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground }]}
                multiline
              />
              <Pressable
                onPress={() => void onSend()}
                disabled={send.isPending || !draft.trim()}
                style={[
                  styles.send,
                  {
                    backgroundColor: colors.primary,
                    opacity: send.isPending || !draft.trim() ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={styles.sendText}>Send</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
  title: { fontSize: 22, fontWeight: "700" },
  pad: { padding: 20 },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  bubble: {
    maxWidth: "80%",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 4,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: { flex: 1, maxHeight: 120, fontSize: 15, paddingVertical: 8 },
  send: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: "#0F172A", fontWeight: "700" },
});
