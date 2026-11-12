/**
 * Native Notification Center — real /api/notifications only (no fake rows).
 * FCM push delivery is prepared separately; this screen is the in-app inbox.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationNativeHref,
  notificationTitle,
  type AppNotification,
} from "@/lib/notificationsApi";
import { formatDate } from "@/lib/orderUi";
import {
  DEVICE_VALIDATION_ITEMS,
  loadDeviceValidationState,
  saveDeviceValidationState,
  type DeviceValidationState,
} from "@/lib/deviceValidationChecklist";
import { getPushPrepStatus, registerExpoPushToken } from "@/lib/pushPrep";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushTick, setPushTick] = useState(0);
  const [deviceChecklist, setDeviceChecklist] =
    useState<DeviceValidationState | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const pushStatus = getPushPrepStatus();
  void pushTick;

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const rows = await fetchNotifications({ token });
        setItems(rows);
        setError(null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not load notifications",
        );
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
      void loadDeviceValidationState().then(setDeviceChecklist);
    }, [authLoading, token, router, load]),
  );

  const toggleChecklistItem = async (
    id: (typeof DEVICE_VALIDATION_ITEMS)[number]["id"],
  ) => {
    const base =
      deviceChecklist ??
      ({
        checked: {},
        notes: "",
        updatedAt: null,
        physicalDeviceVerified: false as const,
      } satisfies DeviceValidationState);
    const nextChecked = {
      ...base.checked,
      [id]: !base.checked[id],
    };
    const saved = await saveDeviceValidationState({
      checked: nextChecked,
      notes: base.notes,
      updatedAt: base.updatedAt,
    });
    setDeviceChecklist(saved);
  };

  const onOpen = async (n: AppNotification) => {
    if (token && !n.isRead) {
      void markNotificationRead(n.id, { token });
      setItems((prev) =>
        (prev ?? []).map((x) =>
          x.id === n.id ? { ...x, isRead: true } : x,
        ),
      );
    }
    const href = notificationNativeHref(n);
    router.push(href as any);
  };

  const onMarkAll = async () => {
    if (!token) return;
    await markAllNotificationsRead({ token });
    setItems((prev) => (prev ?? []).map((x) => ({ ...x, isRead: true })));
  };

  const unread = (items ?? []).filter((n) => !n.isRead).length;

  const renderItem = ({ item }: { item: AppNotification }) => (
    <Pressable
      style={[styles.card, !item.isRead && styles.cardUnread]}
      onPress={() => onOpen(item)}
    >
      {item.listingImage ? (
        <Image
          source={{ uri: item.listingImage }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Feather
            name={item.type === "message" ? "message-circle" : "bell"}
            size={18}
            color="#94A3B8"
          />
        </View>
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {notificationTitle(item)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {item.actorName}
          {item.listingTitle ? ` · ${item.listingTitle}` : ""}
        </Text>
        <Text style={styles.time}>{formatDate(item.createdAt)}</Text>
      </View>
      {!item.isRead ? <View style={styles.dot} /> : null}
    </Pressable>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Notifications</Text>
        {unread > 0 ? (
          <Pressable onPress={onMarkAll} hitSlop={8}>
            <Text style={styles.markAll}>Read all</Text>
          </Pressable>
        ) : (
          <View style={{ width: 64 }} />
        )}
      </View>

      <View style={styles.pushCard}>
        <Text style={styles.pushNote}>
          In-app center uses your real account notifications. No simulated push events.
          Physical FCM delivery is not claimed verified without a device test.
        </Text>
        <Text style={styles.pushMeta}>
          token: {pushStatus.tokenRegistered ? "registered" : "not registered"}
          {" · "}perm: {pushStatus.permissionStatus || "—"}
          {" · "}pkg: {pushStatus.androidPackage}
          {" · "}EAS: {pushStatus.easProjectId.slice(0, 8)}…
        </Text>
        {pushStatus.lastError ? (
          <Text style={styles.pushErr}>{pushStatus.lastError}</Text>
        ) : null}
        {token ? (
          <Pressable
            style={styles.pushRetry}
            disabled={pushBusy}
            onPress={() => {
              setPushBusy(true);
              void registerExpoPushToken(token)
                .finally(() => {
                  setPushBusy(false);
                  setPushTick((n) => n + 1);
                });
            }}
            testID="btn-retry-push-register"
          >
            <Text style={styles.pushRetryText}>
              {pushBusy ? "Registering…" : "Retry push registration"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.checklistToggle}
          onPress={() => setShowChecklist((v) => !v)}
          testID="btn-toggle-device-checklist"
        >
          <Text style={styles.checklistToggleText}>
            {showChecklist
              ? "Hide device validation checklist"
              : "Show device validation checklist (local only)"}
          </Text>
        </Pressable>
        {showChecklist ? (
          <View style={styles.checklistBox} testID="device-validation-checklist">
            <Text style={styles.pushNote}>
              Toggles are local notes only. physicalDeviceVerified stays false
              until a human records evidence on a real Android device.
            </Text>
            {DEVICE_VALIDATION_ITEMS.map((item) => {
              const on = !!deviceChecklist?.checked[item.id];
              return (
                <Pressable
                  key={item.id}
                  style={styles.checkRow}
                  onPress={() => void toggleChecklistItem(item.id)}
                  testID={`check-${item.id}`}
                >
                  <Feather
                    name={on ? "check-square" : "square"}
                    size={18}
                    color={on ? "#F97316" : "#94A3B8"}
                  />
                  <Text style={styles.checkLabel}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {authLoading || (token && items === null && !error) ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => load("initial")}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor="#F97316"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="bell" size={40} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySub}>
                Order updates, Kominike messages, and account alerts appear here
                when the backend creates them.
              </Text>
            </View>
          }
        />
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
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  markAll: {
    color: "#F97316",
    fontWeight: "800",
    fontSize: 13,
    width: 64,
    textAlign: "right",
  },
  pushCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FDBA74",
    padding: 10,
    gap: 4,
  },
  pushNote: {
    fontSize: 11,
    color: "#9A3412",
    lineHeight: 15,
  },
  pushMeta: {
    fontSize: 10,
    color: "#64748B",
    lineHeight: 14,
  },
  pushErr: {
    fontSize: 10,
    color: "#B91C1C",
    fontWeight: "700",
  },
  pushRetry: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: "#FFEDD5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pushRetryText: { color: "#C2410C", fontWeight: "800", fontSize: 11 },
  checklistToggle: { marginTop: 8, paddingVertical: 6 },
  checklistToggleText: { color: "#0369A1", fontWeight: "700", fontSize: 12 },
  checklistBox: {
    marginTop: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#FED7AA",
    paddingTop: 8,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkLabel: { flex: 1, color: "#9A3412", fontSize: 12, fontWeight: "600" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardUnread: {
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
  },
  thumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B" },
  time: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F97316",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
    minHeight: 260,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  emptySub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  error: { color: "#B91C1C", fontWeight: "700", textAlign: "center" },
  retry: {
    marginTop: 8,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
});
