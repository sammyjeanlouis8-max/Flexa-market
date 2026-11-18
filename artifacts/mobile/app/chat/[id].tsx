/**
 * Conversation thread — matches Flexa Market chat reference (IMG_6349).
 * Dark-green header, pinned product card, bubbles, Translate, checks,
 * composer: mint + (Camera/Gallery), light-gray field + emoji, orange mic→Send.
 */
import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  fetchConversations,
  fetchMessages,
  formatBubbleClock,
  formatDateSeparator,
  formatMessageTime,
  sameCalendarDay,
  sendMessage,
  translateMessage,
  uploadChatMedia,
  type ChatMessage,
  type Conversation,
} from "@/lib/chatApi";
import {
  emitStopTyping,
  emitTyping,
  getChatSocket,
  joinConversation,
  leaveConversation,
  onNewMessage,
  onStopTyping,
  onTyping,
  presenceJoin,
} from "@/lib/chatSocket";

const EMOJIS = ["😀", "😂", "😍", "👍", "🙏", "🔥", "❤️", "😊", "😮", "😢", "👏", "✅"];

function mediaUri(msg: ChatMessage): string | null {
  const raw = msg.imageUrl || msg.mediaUrl;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/")) return `https://flexamarket.com${raw}`;
  return raw;
}

function resolveAvatar(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/")) return `https://flexamarket.com${raw}`;
  return raw;
}

function isSupportConversation(meta: Conversation | null): boolean {
  const t = meta?.conversationType || "";
  return t === "system_notifications" || t === "support";
}

type ListRow =
  | { kind: "date"; id: string; label: string }
  | { kind: "msg"; id: string; message: ChatMessage };

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const { lang, t } = useLanguage();

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [meta, setMeta] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const listRef = useRef<FlatList<ListRow>>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const supportChat = isSupportConversation(meta);
  const hasText = draft.trim().length > 0;

  const loadMeta = useCallback(async () => {
    if (!token || !Number.isFinite(convId)) return;
    try {
      const list = await fetchConversations({ token });
      setMeta(list.find((c) => c.id === convId) ?? null);
    } catch {
      /* thread still usable without header meta */
    }
  }, [token, convId]);

  const loadMessages = useCallback(
    async (mode: "initial" | "silent" = "initial") => {
      if (!token || !Number.isFinite(convId)) return;
      if (mode === "initial") setError(null);
      try {
        const rows = await fetchMessages(convId, { token });
        setMessages(rows);
        setError(null);
      } catch (e) {
        if (mode === "initial") {
          setError(e instanceof Error ? e.message : "Could not load chat");
          setMessages((prev) => prev ?? []);
        }
      }
    },
    [token, convId],
  );

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/auth/login");
      return;
    }
    if (!token || !Number.isFinite(convId)) return;

    void loadMeta();
    void loadMessages("initial");
    if (user?.id) presenceJoin(user.id);
    getChatSocket().connect();
    joinConversation(convId);

    const offNew = onNewMessage((msg) => {
      if (Number(msg?.conversationId) !== convId) return;
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === msg.id)) return list;
        if (
          msg.clientMessageId &&
          list.some((m) => m.clientMessageId === msg.clientMessageId)
        ) {
          return list.map((m) =>
            m.clientMessageId === msg.clientMessageId ? { ...m, ...msg } : m,
          );
        }
        return [...list, msg as ChatMessage];
      });
    });

    const offTyping = onTyping((data) => {
      if (data.convId !== convId) return;
      if (user?.id && data.userId === user.id) return;
      setPeerTyping(true);
    });
    const offStop = onStopTyping((data) => {
      if (data.convId !== convId) return;
      setPeerTyping(false);
    });

    const poll = setInterval(() => {
      void loadMessages("silent");
    }, 12000);

    return () => {
      leaveConversation(convId);
      offNew();
      offTyping();
      offStop();
      clearInterval(poll);
      if (user?.id) emitStopTyping(convId, user.id);
      if (recordTick.current) clearInterval(recordTick.current);
    };
  }, [authLoading, token, user?.id, convId, router, loadMeta, loadMessages]);

  const listData: ListRow[] = useMemo(() => {
    const rows = messages ?? [];
    const out: ListRow[] = [];
    let prevIso: string | null = null;
    for (const m of rows) {
      if (!sameCalendarDay(prevIso, m.createdAt)) {
        out.push({
          kind: "date",
          id: `d-${m.createdAt}`,
          label: formatDateSeparator(m.createdAt),
        });
      }
      out.push({ kind: "msg", id: `m-${m.id}`, message: m });
      prevIso = m.createdAt;
    }
    return out;
  }, [messages]);

  useEffect(() => {
    if (!listData.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [listData.length, peerTyping, draft]);

  const onChangeDraft = (text: string) => {
    setDraft(text);
    if (!user?.id || !Number.isFinite(convId)) return;
    emitTyping(convId, user.id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      emitStopTyping(convId, user.id);
    }, 1200);
  };

  const insertEmojiAtCursor = (emoji: string) => {
    const start = selection.start ?? draft.length;
    const end = selection.end ?? start;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    const caret = start + emoji.length;
    setDraft(next);
    setSelection({ start: caret, end: caret });
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps?.({
        selection: { start: caret, end: caret },
      });
    });
    if (user?.id && Number.isFinite(convId)) {
      emitTyping(convId, user.id);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        emitStopTyping(convId, user.id);
      }, 1200);
    }
  };

  const onSend = async () => {
    if (!token || !user || !Number.isFinite(convId)) return;
    const content = draft.trim();
    if (!content || sending) return;
    const clientMessageId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessage = {
      id: -Date.now(),
      conversationId: convId,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatarUrl ?? null,
      content,
      messageType: "text",
      mediaUrl: null,
      imageUrl: null,
      isRead: false,
      clientMessageId,
      createdAt: new Date().toISOString(),
    };
    setDraft("");
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setSending(true);
    emitStopTyping(convId, user.id);
    try {
      const saved = await sendMessage(
        convId,
        { content, messageType: "text", clientMessageId },
        { token },
      );
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          m.clientMessageId === clientMessageId ? saved : m,
        ),
      );
    } catch (e) {
      setMessages((prev) =>
        (prev ?? []).filter((m) => m.clientMessageId !== clientMessageId),
      );
      setDraft(content);
      Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  };

  const sendMediaAsset = async (
    asset: ImagePicker.ImagePickerAsset,
    messageType: "image" | "video",
  ) => {
    if (!token || !user || !Number.isFinite(convId)) return;
    setSending(true);
    try {
      const mime =
        asset.mimeType ||
        (messageType === "video" ? "video/mp4" : "image/jpeg");
      const name =
        asset.fileName ||
        (messageType === "video" ? "chat.mp4" : "chat.jpg");
      const url = await uploadChatMedia(asset.uri, {
        token,
        contentType: mime,
        fileName: name,
      });
      const clientMessageId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const saved = await sendMessage(
        convId,
        {
          content: "",
          messageType,
          imageUrl: messageType === "image" ? url : undefined,
          mediaUrl: url,
          clientMessageId,
        },
        { token },
      );
      setMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => m.id === saved.id)) return list;
        return [...list, saved];
      });
    } catch (e) {
      Alert.alert(
        "Attach failed",
        e instanceof Error ? e.message : "Could not send media",
      );
    } finally {
      setSending(false);
    }
  };

  /** Android Photo Picker — do not request broad media permission first. */
  const onPickGallery = async () => {
    if (!token || !user || sending) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.85,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const isVideo =
        (asset.type === "video") ||
        (asset.mimeType || "").startsWith("video/");
      await sendMediaAsset(asset, isVideo ? "video" : "image");
    } catch (e) {
      Alert.alert(
        "Gallery",
        e instanceof Error ? e.message : "Could not open gallery",
      );
    }
  };

  const onPickCamera = async () => {
    if (!token || !user || sending) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera", "Camera access is needed to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await sendMediaAsset(result.assets[0], "image");
  };

  const onPlus = () => {
    // Camera + Gallery live on the + menu (not inside the text field).
    Alert.alert("Attach", undefined, [
      { text: "Camera", onPress: () => void onPickCamera() },
      { text: "Gallery", onPress: () => void onPickGallery() },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const stopRecordingTicker = () => {
    if (recordTick.current) {
      clearInterval(recordTick.current);
      recordTick.current = null;
    }
  };

  const cancelRecording = async () => {
    stopRecordingTicker();
    try {
      await recording?.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
    setRecording(null);
    setRecordingMs(0);
  };

  const startOrStopVoice = async () => {
    if (supportChat) {
      Alert.alert("Voice messages", "Voice messages are not available in support chat.");
      return;
    }
    if (sending) return;

    if (recording) {
      stopRecordingTicker();
      setSending(true);
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        setRecordingMs(0);
        if (!uri || !token || !user) return;
        const url = await uploadChatMedia(uri, {
          token,
          contentType: "audio/m4a",
          fileName: "voice.m4a",
        });
        const clientMessageId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const saved = await sendMessage(
          convId,
          {
            content: "",
            messageType: "audio",
            mediaUrl: url,
            clientMessageId,
          },
          { token },
        );
        setMessages((prev) => {
          const list = prev ?? [];
          if (list.some((m) => m.id === saved.id)) return list;
          return [...list, saved];
        });
      } catch (e) {
        Alert.alert(
          "Voice failed",
          e instanceof Error ? e.message : "Could not send voice message",
        );
      } finally {
        setSending(false);
      }
      return;
    }

    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Microphone", "Microphone access is needed to record a voice message.");
      return;
    }
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setRecordingMs(0);
      const started = Date.now();
      recordTick.current = setInterval(() => {
        setRecordingMs(Date.now() - started);
      }, 200);
    } catch (e) {
      Alert.alert(
        "Recording",
        e instanceof Error ? e.message : "Could not start recording",
      );
    }
  };

  const onTranslate = async (msg: ChatMessage) => {
    if (!token || !msg.content?.trim()) return;
    if (translations[msg.id]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
      return;
    }
    const result = await translateMessage(msg.id, lang, { token });
    if (!result) {
      Alert.alert("Translate", "Translation is unavailable right now.");
      return;
    }
    setTranslations((prev) => ({ ...prev, [msg.id]: result.translatedText }));
  };

  const onOverflow = () => {
    const buttons: {
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }[] = [];
    if (meta?.listingId) {
      buttons.push({
        text: "View product",
        onPress: () => router.push(`/listing/${meta.listingId}`),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(meta?.otherUserName || "Chat", undefined, buttons);
  };

  const myId = user?.id;
  const title = meta?.otherUserName || "Chat";
  const lastActive = meta?.lastMessageAt
    ? formatMessageTime(meta.lastMessageAt).replace("Just now", "Active now")
    : "";
  const avatarUri = resolveAvatar(meta?.otherUserAvatar);
  const listingThumb = resolveAvatar(meta?.listingImage);
  const price =
    meta && meta.listingPrice != null
      ? `$${Number(meta.listingPrice).toFixed(2)}`
      : null;

  // Keep Android status inset in dp (StatusBar.currentHeight is physical px).
  const headerPadTop = Platform.OS === "android"
    ? Math.min(insets.top || 24, 28)
    : insets.top;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.flexaGreen} translucent />

      <View style={[styles.header, { paddingTop: headerPadTop }]}>
        <View style={styles.headerBar}>
          <Pressable
            style={styles.headerIcon}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/(tabs)/inbox")
            }
            accessibilityLabel="Back"
            testID="chat-back"
          >
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarEmpty]}>
              <Feather name="user" size={18} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.headerMeta}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>
                {title}
              </Text>
              {meta?.otherUserIsVerified ? (
                <View style={styles.verified}>
                  <Feather name="check" size={10} color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            {lastActive ? (
              <Text style={styles.headerSub} numberOfLines={1}>
                {lastActive}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={styles.headerIcon}
            onPress={onOverflow}
            accessibilityLabel="More options"
          >
            <Feather name="more-vertical" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {meta?.listingId && meta.listingTitle && !supportChat ? (
        <View style={styles.productCard} testID="chat-product-card">
          {listingThumb ? (
            <Image source={{ uri: listingThumb }} style={styles.productThumb} contentFit="cover" />
          ) : (
            <View style={[styles.productThumb, styles.productThumbEmpty]}>
              <Feather name="package" size={18} color="#94A3B8" />
            </View>
          )}
          <View style={styles.productMeta}>
            <Text style={styles.productTitle} numberOfLines={1}>
              {meta.listingTitle}
            </Text>
            {price ? <Text style={styles.productPrice}>{price}</Text> : null}
          </View>
          <Pressable
            style={styles.viewProduct}
            onPress={() => router.push(`/listing/${meta.listingId}`)}
            testID="chat-view-product"
          >
            <Text style={styles.viewProductText}>View product</Text>
            <Feather name="chevron-right" size={14} color={colors.flexaOrange} />
          </Pressable>
        </View>
      ) : null}

      {messages === null && !error ? (
        <ActivityIndicator color={colors.flexaGreen} style={{ marginTop: 40 }} />
      ) : error && !messages?.length ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void loadMessages("initial")}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={listData}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 12,
            paddingBottom: 12,
            flexGrow: 1,
            justifyContent: "flex-end",
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Say hello — this chat is empty.</Text>
          }
          ListFooterComponent={
            peerTyping ? (
              <Text style={styles.typing}>typing…</Text>
            ) : (
              <View style={{ height: 4 }} />
            )
          }
          renderItem={({ item }) => {
            if (item.kind === "date") {
              return (
                <View style={styles.datePillWrap}>
                  <View style={styles.datePill}>
                    <Text style={styles.datePillText}>{item.label}</Text>
                  </View>
                </View>
              );
            }
            const msg = item.message;
            const mine = msg.senderId === myId;
            const img =
              msg.messageType === "image" || msg.messageType === "video"
                ? mediaUri(msg)
                : null;
            const deleted = msg.isDeleted;
            return (
              <View style={[styles.bubbleWrap, mine ? styles.mine : styles.theirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine ? (
                    <Text style={styles.senderName} numberOfLines={1}>
                      {msg.senderName || title}
                    </Text>
                  ) : null}
                  {deleted ? (
                    <Text style={styles.deleted}>Message deleted</Text>
                  ) : msg.messageType === "audio" ? (
                    <View style={styles.audioRow}>
                      <Feather
                        name="mic"
                        size={16}
                        color={mine ? "#FFFFFF" : colors.flexaGreen}
                      />
                      <Text style={[styles.msgText, mine && styles.msgTextMine]}>
                        Voice message
                      </Text>
                    </View>
                  ) : img ? (
                    <View>
                      <Image source={{ uri: img }} style={styles.msgImage} contentFit="cover" />
                      {msg.messageType === "video" ? (
                        <View style={styles.videoBadge}>
                          <Feather name="play" size={14} color="#fff" />
                          <Text style={styles.videoBadgeText}>Video</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={[styles.msgText, mine && styles.msgTextMine]}>
                      {msg.content || ""}
                    </Text>
                  )}
                  {translations[msg.id] ? (
                    <Text style={[styles.translated, mine && styles.translatedMine]}>
                      {translations[msg.id]}
                    </Text>
                  ) : null}
                  <View style={[styles.bubbleFooter, mine && styles.bubbleFooterMine]}>
                    {!mine && msg.messageType === "text" && msg.content ? (
                      <Pressable
                        style={styles.translateBtn}
                        onPress={() => void onTranslate(msg)}
                        hitSlop={6}
                      >
                        <Feather name="globe" size={12} color="#94A3B8" />
                        <Text style={styles.translateText}>
                          {translations[msg.id] ? "Original" : "Translate"}
                        </Text>
                      </Pressable>
                    ) : (
                      <View />
                    )}
                    <View style={styles.timeChecks}>
                      <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>
                        {formatBubbleClock(msg.createdAt)}
                      </Text>
                      {mine ? (
                        <Feather
                          name="check-circle"
                          size={12}
                          color={msg.isRead ? "#60A5FA" : "rgba(255,255,255,0.7)"}
                          style={{ marginLeft: 4 }}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {recording ? (
        <View style={styles.recordingBar}>
          <Pressable onPress={() => void cancelRecording()}>
            <Feather name="trash-2" size={18} color="#EF4444" />
          </Pressable>
          <View style={styles.recDot} />
          <Text style={styles.recText}>
            Recording {Math.floor(recordingMs / 1000)}s — tap mic to send
          </Text>
        </View>
      ) : null}

      <View
        style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}
        testID="chat-composer"
      >
        <Pressable
          style={styles.plusBtn}
          onPress={onPlus}
          disabled={sending}
          accessibilityLabel="Attach"
          testID="chat-attach"
        >
          <Feather name="plus" size={22} color={colors.flexaGreen} />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={draft}
            onChangeText={onChangeDraft}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            placeholder={t("typeMessage") || "Type a message..."}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={4000}
            textAlignVertical="center"
            testID="chat-input"
          />
          <Pressable
            style={styles.emojiBtn}
            onPress={() => setEmojiOpen(true)}
            hitSlop={8}
            accessibilityLabel="Emoji"
            testID="chat-emoji"
          >
            <Feather name="smile" size={22} color={colors.flexaOrange} />
          </Pressable>
        </View>
        {hasText ? (
          <Pressable
            style={[styles.micBtn, sending && styles.sendDisabled]}
            onPress={() => void onSend()}
            disabled={sending}
            accessibilityLabel="Send"
            testID="chat-send"
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.micBtn,
              (supportChat || sending) && styles.sendDisabled,
              recording && styles.micRecording,
            ]}
            onPress={() => void startOrStopVoice()}
            disabled={supportChat || sending}
            accessibilityLabel="Voice message"
            testID="chat-mic"
          >
            <Feather name="mic" size={20} color="#fff" />
          </Pressable>
        )}
      </View>

      <Modal visible={emojiOpen} transparent animationType="fade" onRequestClose={() => setEmojiOpen(false)}>
        <Pressable style={styles.emojiBackdrop} onPress={() => setEmojiOpen(false)}>
          <View style={[styles.emojiSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                style={styles.emojiCell}
                onPress={() => insertEmojiAtCursor(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },
  header: { backgroundColor: colors.flexaGreen },
  headerBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 4,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  headerAvatarEmpty: { alignItems: "center", justifyContent: "center" },
  headerMeta: { flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerName: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", flexShrink: 1 },
  verified: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 1 },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  productThumb: { width: 44, height: 44, borderRadius: 8 },
  productThumbEmpty: {
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  productMeta: { flex: 1, minWidth: 0 },
  productTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  productPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.flexaOrange,
    marginTop: 2,
  },
  viewProduct: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1.5,
    borderColor: colors.flexaOrange,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  viewProductText: {
    color: colors.flexaOrange,
    fontWeight: "700",
    fontSize: 12,
  },
  list: { flex: 1 },
  centered: { alignItems: "center", paddingTop: 48, gap: 12 },
  error: { color: "#B91C1C", fontWeight: "600" },
  retry: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
  empty: { textAlign: "center", color: "#94A3B8", marginVertical: 24 },
  typing: {
    alignSelf: "flex-start",
    color: "#64748B",
    fontSize: 12,
    fontStyle: "italic",
    marginLeft: 8,
    marginBottom: 4,
  },
  datePillWrap: { alignItems: "center", marginVertical: 12 },
  datePill: {
    backgroundColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  datePillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  bubbleWrap: { marginVertical: 4, maxWidth: "82%" },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bubbleMine: { backgroundColor: colors.flexaGreen },
  bubbleTheirs: {
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  senderName: {
    color: colors.flexaGreen,
    fontWeight: "700",
    fontSize: 12,
    marginBottom: 4,
  },
  msgText: { color: "#0F172A", fontSize: 15, lineHeight: 21 },
  msgTextMine: { color: "#FFFFFF" },
  deleted: { color: "#94A3B8", fontStyle: "italic", fontSize: 13 },
  translated: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.5)",
    fontSize: 13,
    color: "#334155",
    fontStyle: "italic",
  },
  translatedMine: {
    borderTopColor: "rgba(255,255,255,0.35)",
    color: "rgba(255,255,255,0.9)",
  },
  msgImage: { width: 220, height: 220, borderRadius: 10 },
  videoBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  videoBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  audioRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bubbleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 8,
  },
  bubbleFooterMine: { justifyContent: "flex-end" },
  translateBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  translateText: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  timeChecks: { flexDirection: "row", alignItems: "center" },
  msgTime: { fontSize: 10, color: "#94A3B8" },
  msgTimeMine: { color: "rgba(255,255,255,0.85)" },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FEF2F2",
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  recText: { color: "#991B1B", fontWeight: "600", fontSize: 13, flex: 1 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  plusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D1FAE5",
    marginBottom: 2,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 4,
    minHeight: 44,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    color: "#0F172A",
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    marginRight: 2,
  },
  emojiBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  micRecording: { backgroundColor: "#EF4444" },
  sendDisabled: { opacity: 0.55 },
  emojiBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  emojiSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiCell: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: { fontSize: 26 },
});
