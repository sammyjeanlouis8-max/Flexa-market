/**
 * Shared Flexa Control module list with real /api/admin/* reads & writes.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useAdminControl } from "@/context/AdminControlContext";
import { apiRequest, formatWhen, money } from "@/lib/request";
import colors from "@/constants/colors";

function ActionChip({
  label,
  tone = "neutral",
  onPress,
  disabled,
}: {
  label: string;
  tone?: "neutral" | "danger" | "ok";
  onPress: () => void;
  disabled?: boolean;
}) {
  const bg = tone === "danger" ? "#FEE2E2" : tone === "ok" ? "#DCFCE7" : "#F1F5F9";
  const fg = tone === "danger" ? "#B91C1C" : tone === "ok" ? "#166534" : "#334155";
  return (
    <Pressable
      style={[styles.chip, { backgroundColor: bg }, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export type ModuleKind =
  | "users"
  | "listings"
  | "moderation"
  | "payments"
  | "refunds"
  | "boosts"
  | "support"
  | "promo-videos"
  | "operations"
  | "team"
  | "security"
  | "orders"
  | "analytics"
  | "deliveries"
  | "push-notifications"
  | "generic";

export function AdminActionList({
  kind,
  title,
  emptyHint,
}: {
  kind: ModuleKind;
  title: string;
  emptyHint?: string;
}) {
  const router = useRouter();
  const { token } = useAuth();
  const { isAdmin, isSuperAdmin, can, effectiveCountry, me } = useAdminControl();
  const [items, setItems] = useState<any[]>([]);
  const [extra, setExtra] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const countryQs = effectiveCountry
    ? `country=${encodeURIComponent(effectiveCountry)}`
    : "";

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setNote(null);
      try {
        let next: any[] = [];
        let extraData: any = null;
        const join = (path: string) => {
          if (!countryQs) return path;
          return path.includes("?") ? `${path}&${countryQs}` : `${path}?${countryQs}`;
        };

        switch (kind) {
          case "users": {
            const res = await apiRequest<any>(join("/admin/users?limit=50"), { token });
            next = Array.isArray(res) ? res : res.users ?? res.items ?? [];
            break;
          }
          case "listings": {
            const res = await apiRequest<any>(join("/admin/listings?limit=50"), { token });
            next = Array.isArray(res) ? res : res.listings ?? res.items ?? [];
            break;
          }
          case "moderation": {
            const res = await apiRequest<any>(join("/admin/moderation?limit=50"), { token });
            next = Array.isArray(res) ? res : res.items ?? res.reports ?? [];
            break;
          }
          case "payments":
          case "refunds": {
            const res = await apiRequest<any>(join("/admin/payments?limit=50"), { token });
            next = Array.isArray(res) ? res : res.payments ?? res.items ?? [];
            break;
          }
          case "boosts": {
            const res = await apiRequest<any>(join("/admin/boosts?limit=50"), { token });
            next = Array.isArray(res) ? res : res.boosts ?? res.items ?? [];
            break;
          }
          case "support": {
            const res = await apiRequest<any>("/support/threads?all=1", { token });
            next = Array.isArray(res) ? res : [];
            break;
          }
          case "promo-videos": {
            // Admin promo video moderation uses /admin/boosts (same as web AdminModerationCenter).
            const res = await apiRequest<any>(join("/admin/boosts?limit=50"), { token });
            next = Array.isArray(res) ? res : res.boosts ?? res.items ?? [];
            break;
          }
          case "operations": {
            const res = await apiRequest<any>("/admin/stats", { token });
            extraData = res;
            next = [
              { id: "boosted", label: "BOOSTED", value: res?.boostedListings ?? 0, icon: "zap" },
              { id: "featured", label: "FEATURED", value: res?.featuredListings ?? 0, icon: "star" },
              { id: "reports", label: "PENDING REPORTS", value: res?.pendingReports ?? 0, icon: "flag" },
              { id: "flagged", label: "FLAGGED USERS", value: res?.flaggedUsers ?? 0, icon: "alert-circle" },
            ];
            break;
          }
          case "team": {
            const res = await apiRequest<any>("/admin/users?limit=100&admins=1", { token }).catch(
              () => apiRequest<any>("/admin/users?limit=100", { token }),
            );
            const all = Array.isArray(res) ? res : res.users ?? res.items ?? [];
            next = all.filter(
              (u: any) => u.isAdmin || u.isSuperAdmin || ["admin", "superadmin", "moderator", "support"].includes(String(u.role || "").toLowerCase()),
            );
            break;
          }
          case "security": {
            const res = await apiRequest<any>("/admin/logs?limit=50", { token });
            next = Array.isArray(res) ? res : res.logs ?? res.items ?? [];
            break;
          }
          case "orders": {
            const res = await apiRequest<any>(join("/admin/orders?limit=50"), { token }).catch(
              () => apiRequest<any>(join("/admin/payments?limit=50"), { token }),
            );
            next = Array.isArray(res) ? res : res.orders ?? res.payments ?? res.items ?? [];
            if (!Array.isArray(res?.orders) && !res?.orders) {
              setNote("Showing payment records (dedicated orders list unavailable).");
            }
            break;
          }
          case "analytics": {
            const res = await apiRequest<any>(
              `/admin/analytics/traffic?period=7d&days=7`,
              { token },
            );
            extraData = res;
            next = res?.series ?? [];
            break;
          }
          case "deliveries": {
            const res = await apiRequest<any>(join("/admin/deliveries?limit=50"), { token }).catch(
              () => null,
            );
            if (!res) {
              setNote("Deliveries endpoint returned no data for this role/scope.");
              next = [];
            } else {
              next = Array.isArray(res) ? res : res.deliveries ?? res.items ?? [];
            }
            break;
          }
          case "push-notifications": {
            const res = await apiRequest<any>("/admin/push-notifications?limit=30", { token }).catch(
              () => apiRequest<any>("/admin/push/stats", { token }).catch(() => null),
            );
            if (!res) {
              setNote("Push stats unavailable — open Send Push when campaigns API is reachable.");
              next = [];
              extraData = { canCompose: true };
            } else if (Array.isArray(res)) {
              next = res;
            } else {
              extraData = res;
              next = res.campaigns ?? res.items ?? [];
            }
            break;
          }
          default:
            next = [];
            setNote("This module is registered. Backend wiring uses existing admin APIs when available.");
        }
        setItems(next);
        setExtra(extraData);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, kind, countryQs, effectiveCountry, isSuperAdmin],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (
      key: string,
      path: string,
      opts: { method?: string; body?: unknown; confirm?: string } = {},
    ) => {
      if (!token) return;
      const go = async () => {
        setBusyId(key);
        try {
          await apiRequest(path, {
            token,
            method: opts.method || "POST",
            body: opts.body,
          });
          await load("refresh");
          Alert.alert("Saved", "Action completed. Backend state refreshed.");
        } catch (e) {
          Alert.alert("Action failed", e instanceof Error ? e.message : "Try again");
        } finally {
          setBusyId(null);
        }
      };
      if (opts.confirm) {
        Alert.alert("Confirm", opts.confirm, [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", style: "destructive", onPress: () => void go() },
        ]);
      } else {
        await go();
      }
    },
    [token, load],
  );

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {effectiveCountry ? (
          <Text style={styles.scope}>Scope: {effectiveCountry}</Text>
        ) : me ? (
          <Text style={styles.scope}>
            Scope: {me.scopeLevel || "global"} · {me.role}
          </Text>
        ) : null}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
        >
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}

          {kind === "analytics" && extra?.summary ? (
            <View style={styles.grid}>
              {Object.entries(extra.summary)
                .slice(0, 8)
                .map(([k, v]) => (
                  <View key={k} style={styles.stat}>
                    <Text style={styles.statLabel}>{k}</Text>
                    <Text style={styles.statValue}>{String(v)}</Text>
                  </View>
                ))}
            </View>
          ) : null}

          {kind === "operations"
            ? items.map((it) => (
                <View key={it.id} style={styles.card}>
                  <Text style={styles.statLabel}>{it.label}</Text>
                  <Text style={styles.statValue}>{String(it.value)}</Text>
                </View>
              ))
            : null}

          {kind === "users"
            ? items.map((u) => (
                <View key={u.id} style={styles.card}>
                  <Text style={styles.rowTitle}>{u.name || u.email}</Text>
                  <Text style={styles.meta}>
                    {u.email} · {u.country || "—"} · {u.role || "user"}
                    {u.isBanned ? " · banned" : ""}
                  </Text>
                  <View style={styles.actions}>
                    {u.isBanned ? (
                      <ActionChip
                        label="Unban"
                        tone="ok"
                        disabled={busyId === `u-${u.id}` || !isAdmin}
                        onPress={() =>
                          void runAction(`u-${u.id}`, `/admin/users/${u.id}/unban`, {
                            confirm: `Unban ${u.email || u.name}?`,
                          })
                        }
                      />
                    ) : (
                      <ActionChip
                        label="Ban"
                        tone="danger"
                        disabled={busyId === `u-${u.id}` || !isAdmin}
                        onPress={() =>
                          void runAction(`u-${u.id}`, `/admin/users/${u.id}/ban`, {
                            body: { reason: "Banned from native Flexa Control" },
                            confirm: `Ban ${u.email || u.name}?`,
                          })
                        }
                      />
                    )}
                    <ActionChip
                      label={u.isRestricted ? "Unrestrict" : "Restrict"}
                      disabled={busyId === `u-${u.id}`}
                      onPress={() =>
                        void runAction(
                          `u-${u.id}`,
                          `/admin/users/${u.id}/${u.isRestricted ? "unrestrict" : "restrict"}`,
                          u.isRestricted
                            ? {}
                            : { body: { reason: "Restricted from native Flexa Control" } },
                        )
                      }
                    />
                    <ActionChip
                      label={u.isVerified ? "Unverify" : "Verify"}
                      disabled={busyId === `u-${u.id}`}
                      onPress={() =>
                        void runAction(
                          `u-${u.id}`,
                          `/admin/users/${u.id}/${u.isVerified ? "unverify" : "verify"}`,
                        )
                      }
                    />
                  </View>
                </View>
              ))
            : null}

          {kind === "listings"
            ? items.map((l) => (
                <View key={l.id} style={styles.card}>
                  <Text style={styles.rowTitle}>{l.title || `Listing #${l.id}`}</Text>
                  <Text style={styles.meta}>
                    #{l.id} · {l.country || "—"} · {l.status || "—"} · {money(l.price)}
                  </Text>
                  <View style={styles.actions}>
                    <ActionChip
                      label="Feature"
                      tone="ok"
                      disabled={!isAdmin || busyId === `l-${l.id}`}
                      onPress={() => void runAction(`l-${l.id}`, `/admin/listings/${l.id}/feature`)}
                    />
                    <ActionChip
                      label="Remove"
                      tone="danger"
                      disabled={busyId === `l-${l.id}`}
                      onPress={() =>
                        void runAction(`l-${l.id}`, `/admin/listings/${l.id}/remove`, {
                          confirm: `Remove listing #${l.id}?`,
                        })
                      }
                    />
                    <ActionChip label="Open" onPress={() => router.push(`/listing/${l.id}`)} />
                  </View>
                </View>
              ))
            : null}

          {kind === "moderation"
            ? items.map((m, i) => {
                const id = m.listingId ?? m.id;
                return (
                  <View key={m.id ?? i} style={styles.card}>
                    <Text style={styles.rowTitle}>
                      {m.title || m.reason || `Listing #${id}`}
                    </Text>
                    <Text style={styles.meta}>
                      #{id} · {m.moderationStatus || m.status || "pending"} ·{" "}
                      {formatWhen(m.createdAt)}
                    </Text>
                    <View style={styles.actions}>
                      <ActionChip
                        label="Approve"
                        tone="ok"
                        disabled={!id || busyId === `m-${id}`}
                        onPress={() => void runAction(`m-${id}`, `/admin/moderation/${id}/approve`)}
                      />
                      <ActionChip
                        label="Reject"
                        tone="danger"
                        disabled={!id || busyId === `m-${id}`}
                        onPress={() =>
                          void runAction(`m-${id}`, `/admin/moderation/${id}/reject`, {
                            body: { reason: "Rejected from native Flexa Control" },
                            confirm: "Reject this listing?",
                          })
                        }
                      />
                    </View>
                  </View>
                );
              })
            : null}

          {(kind === "payments" || kind === "refunds" || kind === "orders")
            ? items.map((p, i) => (
                <View key={p.id ?? i} style={styles.card}>
                  <Text style={styles.rowTitle}>{p.type || p.provider || p.status || "Record"}</Text>
                  <Text style={styles.meta}>
                    #{p.id} · {p.country || "—"} · {formatWhen(p.createdAt)} ·{" "}
                    {money(p.amountUsd ?? p.amount ?? 0)}
                  </Text>
                  <View style={styles.actions}>
                    {kind !== "orders" ? (
                      <ActionChip
                        label="Mark verified"
                        tone="ok"
                        disabled={!isAdmin || !p.id || busyId === `p-${p.id}`}
                        onPress={() =>
                          void runAction(`p-${p.id}`, `/admin/payments/${p.id}/mark-verified`)
                        }
                      />
                    ) : null}
                    {(kind === "refunds" || isSuperAdmin) && p.id ? (
                      <ActionChip
                        label="Refund"
                        tone="danger"
                        disabled={!isSuperAdmin || busyId === `p-${p.id}`}
                        onPress={() =>
                          void runAction(`p-${p.id}`, `/admin/payments/${p.id}/refund`, {
                            confirm: `Refund payment #${p.id}?`,
                          })
                        }
                      />
                    ) : null}
                  </View>
                </View>
              ))
            : null}

          {kind === "boosts"
            ? items.map((b) => (
                <View key={b.id} style={styles.card}>
                  <Text style={styles.rowTitle}>
                    Boost #{b.id} · listing {b.listingId ?? "—"}
                  </Text>
                  <Text style={styles.meta}>
                    {b.status || "—"} · {formatWhen(b.createdAt)}
                  </Text>
                  <View style={styles.actions}>
                    <ActionChip
                      label="Approve"
                      tone="ok"
                      disabled={!isAdmin || busyId === `b-${b.id}`}
                      onPress={() => void runAction(`b-${b.id}`, `/admin/boosts/${b.id}/approve`)}
                    />
                    <ActionChip
                      label="Reject"
                      tone="danger"
                      disabled={!isAdmin || busyId === `b-${b.id}`}
                      onPress={() =>
                        void runAction(`b-${b.id}`, `/admin/boosts/${b.id}/reject`, {
                          body: { reason: "Rejected from native Flexa Control" },
                        })
                      }
                    />
                  </View>
                </View>
              ))
            : null}

          {kind === "support"
            ? items.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.row}
                  onPress={() => router.push(`/support/${t.id}`)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      #{t.ticketRef || t.id} · {t.subject}
                    </Text>
                    <Text style={styles.meta}>
                      {t.status} · {t.userName || ""}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </Pressable>
              ))
            : null}

          {kind === "promo-videos"
            ? items.map((v, i) => {
                const id = v.id ?? v.boostId;
                return (
                  <View key={id ?? i} style={styles.card}>
                    <Text style={styles.rowTitle}>
                      {v.title || v.listingTitle || `Boost campaign #${id}`}
                    </Text>
                    <Text style={styles.meta}>
                      {v.country || "—"} · {v.status || v.paymentStatus || "—"} · listing{" "}
                      {v.listingId ?? "—"} · #{id}
                    </Text>
                    <View style={styles.actions}>
                      <ActionChip
                        label="Approve"
                        tone="ok"
                        disabled={!id || busyId === `v-${id}` || !isAdmin}
                        onPress={() =>
                          void runAction(`v-${id}`, `/admin/boosts/${id}/approve`, {
                            confirm: "Approve this promotional campaign?",
                          })
                        }
                      />
                      <ActionChip
                        label="Reject"
                        tone="danger"
                        disabled={!id || busyId === `v-${id}` || !isAdmin}
                        onPress={() =>
                          void runAction(`v-${id}`, `/admin/boosts/${id}/reject`, {
                            body: { reason: "Rejected from native Flexa Control" },
                            confirm: "Reject this promotional campaign?",
                          })
                        }
                      />
                      {v.listingId ? (
                        <ActionChip
                          label="Open listing"
                          onPress={() => router.push(`/listing/${v.listingId}`)}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })
            : null}

          {kind === "team"
            ? items.map((u) => (
                <View key={u.id} style={styles.card}>
                  <Text style={styles.rowTitle}>{u.name || u.email}</Text>
                  <Text style={styles.meta}>
                    {u.role || (u.isSuperAdmin ? "superadmin" : "admin")} ·{" "}
                    {u.adminScopeCountry || u.country || "global"}
                  </Text>
                </View>
              ))
            : null}

          {kind === "security"
            ? items.map((log, i) => (
                <View key={log.id ?? i} style={styles.card}>
                  <Text style={styles.rowTitle}>{log.action || log.type || "Action"}</Text>
                  <Text style={styles.meta}>
                    {log.actorEmail || log.userId || "—"} · {formatWhen(log.createdAt)}
                  </Text>
                </View>
              ))
            : null}

          {kind === "push-notifications" ? (
            <View style={styles.card}>
              <Text style={styles.rowTitle}>Compose push</Text>
              <PushCompose
                disabled={!isAdmin && !isSuperAdmin}
                onSend={async (body) => {
                  setBusyId("push");
                  try {
                    await apiRequest("/admin/push-notifications/send", {
                      token,
                      method: "POST",
                      body,
                    }).catch(() =>
                      apiRequest("/admin/push/send", { token, method: "POST", body }),
                    );
                    Alert.alert("Sent", "Push request accepted by API.");
                    await load("refresh");
                  } catch (e) {
                    Alert.alert("Send failed", e instanceof Error ? e.message : "Try again");
                  } finally {
                    setBusyId(null);
                  }
                }}
                busy={busyId === "push"}
              />
            </View>
          ) : null}

          {!error &&
          items.length === 0 &&
          kind !== "push-notifications" &&
          kind !== "analytics" ? (
            <Text style={styles.empty}>{emptyHint || "No records for this module."}</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function PushCompose({
  onSend,
  busy,
  disabled,
}: {
  onSend: (body: Record<string, unknown>) => Promise<void>;
  busy: boolean;
  disabled?: boolean;
}) {
  const [title, setTitle] = useState("Flexa Control test");
  const [message, setMessage] = useState("Native admin test push");
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        editable={!disabled}
      />
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder="Message"
        editable={!disabled}
      />
      <ActionChip
        label={busy ? "Sending…" : "Send test push"}
        tone="ok"
        disabled={disabled || busy || !title.trim() || !message.trim()}
        onPress={() =>
          void onSend({
            title: title.trim(),
            body: message.trim(),
            target: "test",
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: "900", color: "#0F172A" },
  scope: { color: "#64748B", fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  note: { color: "#64748B", marginBottom: 10, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  stat: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  statLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "800" },
  statValue: { marginTop: 4, fontSize: 20, fontWeight: "900", color: "#0F172A" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: "#0F172A",
  },
  empty: { color: "#94A3B8", marginTop: 12 },
});
