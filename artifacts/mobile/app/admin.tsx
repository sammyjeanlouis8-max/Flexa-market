/**
 * Admin dashboard — role-gated tabs with real /api/admin/* read + write actions.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, formatWhen, money } from "@/lib/request";

type Tab =
  | "overview"
  | "users"
  | "moderation"
  | "listings"
  | "finance"
  | "boosts"
  | "promo"
  | "support";

const TAB_IDS: Tab[] = [
  "overview",
  "users",
  "moderation",
  "listings",
  "finance",
  "boosts",
  "promo",
  "support",
];

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
  const bg =
    tone === "danger" ? "#FEE2E2" : tone === "ok" ? "#DCFCE7" : "#F1F5F9";
  const fg =
    tone === "danger" ? "#B91C1C" : tone === "ok" ? "#166534" : "#334155";
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

export default function AdminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { token, user, isLoading: authLoading } = useAuth();
  const initial = (params.tab as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(TAB_IDS.includes(initial) ? initial : "overview");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [moderation, setModeration] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [boosts, setBoosts] = useState<any[]>([]);
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [promoForm, setPromoForm] = useState({
    code: "",
    discountType: "percent" as "percent" | "fixed",
    discountValue: "10",
    description: "",
  });

  const allowed = !!(
    user?.isAdmin ||
    user?.isSuperAdmin ||
    user?.role === "moderator" ||
    user?.role === "support" ||
    user?.role === "admin" ||
    user?.role === "superadmin"
  );
  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin || user?.role === "admin" || user?.role === "superadmin");
  const isSuper = !!(user?.isSuperAdmin || user?.role === "superadmin");

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !allowed) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const adminMe = await apiRequest("/admin/me", { token }).catch(() => null);
        setMe(adminMe);
        if (tab === "overview") {
          setStats(await apiRequest("/admin/stats", { token }));
        } else if (tab === "users") {
          const res = await apiRequest<any>("/admin/users?limit=50", { token });
          setUsers(Array.isArray(res) ? res : res.users ?? res.items ?? []);
        } else if (tab === "moderation") {
          const res = await apiRequest<any>("/admin/moderation?limit=50", { token });
          setModeration(Array.isArray(res) ? res : res.items ?? res.reports ?? []);
        } else if (tab === "listings") {
          const res = await apiRequest<any>("/admin/listings?limit=50", { token });
          setListings(Array.isArray(res) ? res : res.listings ?? res.items ?? []);
        } else if (tab === "finance") {
          const res = await apiRequest<any>("/admin/payments?limit=50", { token });
          setPayments(Array.isArray(res) ? res : res.payments ?? res.items ?? []);
        } else if (tab === "boosts") {
          const res = await apiRequest<any>("/admin/boosts?limit=50", { token });
          setBoosts(Array.isArray(res) ? res : res.boosts ?? res.items ?? []);
        } else if (tab === "promo") {
          const [codes, camp] = await Promise.all([
            apiRequest<any>("/admin/promo/codes", { token }),
            apiRequest<any>("/admin/promo/campaign", { token }).catch(() => null),
          ]);
          setPromoCodes(Array.isArray(codes) ? codes : codes?.codes ?? []);
          setCampaign(camp);
        } else if (tab === "support") {
          const res = await apiRequest<any[]>("/support/threads?all=1", { token });
          setThreads(Array.isArray(res) ? res : []);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Admin API error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, allowed, tab],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (!authLoading && token && !allowed) return;
      if (token && allowed) void load();
    }, [authLoading, token, allowed, router, load]),
  );

  const runAction = useCallback(
    async (key: string, path: string, opts: { method?: string; body?: unknown; confirm?: string } = {}) => {
      if (!token) return;
      const go = async () => {
        setBusyId(key);
        try {
          await apiRequest(path, { token, method: opts.method || "POST", body: opts.body });
          await load("refresh");
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

  const createPromo = useCallback(async () => {
    if (!token) return;
    setBusyId("promo-create");
    try {
      await apiRequest("/admin/promo/codes", {
        token,
        method: "POST",
        body: {
          code: promoForm.code.trim().toUpperCase(),
          discountType: promoForm.discountType,
          discountValue: Number(promoForm.discountValue),
          description: promoForm.description.trim() || undefined,
        },
      });
      setPromoForm({ code: "", discountType: "percent", discountValue: "10", description: "" });
      await load("refresh");
    } catch (e) {
      Alert.alert("Could not create code", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }, [token, promoForm, load]);

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: "Overview", icon: "grid" as const },
        { id: "users" as const, label: "Users", icon: "users" as const },
        { id: "moderation" as const, label: "Moderation", icon: "flag" as const },
        { id: "listings" as const, label: "Listings", icon: "package" as const },
        { id: "finance" as const, label: "Finance", icon: "dollar-sign" as const },
        { id: "boosts" as const, label: "Boosts", icon: "zap" as const },
        { id: "promo" as const, label: "Promo", icon: "tag" as const },
        { id: "support" as const, label: "Support", icon: "life-buoy" as const },
      ] as const,
    [],
  );

  if (!authLoading && token && !allowed) {
    return (
      <View style={styles.root}>
        <AppHeader title="Admin" showBack />
        <View style={styles.center}>
          <Feather name="shield-off" size={36} color="#94A3B8" />
          <Text style={styles.denyTitle}>Access denied</Text>
          <Text style={styles.denySub}>Admin or support role required.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Admin" showBack showCart={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            style={[styles.tab, tab === t.id && styles.tabOn]}
            onPress={() => setTab(t.id)}
          >
            <Feather name={t.icon} size={14} color={tab === t.id ? "#fff" : "#64748B"} />
            <Text style={[styles.tabText, tab === t.id && { color: "#fff" }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
        >
          {me ? (
            <Text style={styles.role}>
              Signed in as {me.name || me.email} · {me.role}
              {isSuper ? " · superadmin" : isAdmin ? " · admin" : ""}
            </Text>
          ) : null}
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {tab === "overview" && stats ? (
            <View style={styles.grid}>
              {[
                ["Users", stats.totalUsers ?? stats.users ?? "—"],
                ["Listings", stats.totalListings ?? stats.listings ?? "—"],
                ["Active", stats.activeListings ?? "—"],
                ["Reports", stats.pendingReports ?? "—"],
                ["Banned", stats.bannedUsers ?? "—"],
                ["Visits today", stats.visitsToday ?? "—"],
              ].map(([label, value]) => (
                <View key={String(label)} style={styles.stat}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{String(value)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {tab === "users"
            ? users.map((u) => (
                <View key={u.id} style={styles.card}>
                  <Text style={styles.rowTitle}>{u.name || u.email}</Text>
                  <Text style={styles.meta}>
                    {u.email} · {u.country || "—"} · {u.role || "user"}
                    {u.isBanned ? " · banned" : ""}
                    {u.isRestricted ? " · restricted" : ""}
                    {u.isVerified ? " · verified" : ""}
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
                            body: { reason: "Banned from native admin" },
                            confirm: `Ban ${u.email || u.name}?`,
                          })
                        }
                      />
                    )}
                    {u.isRestricted ? (
                      <ActionChip
                        label="Unrestrict"
                        disabled={busyId === `u-${u.id}`}
                        onPress={() => void runAction(`u-${u.id}`, `/admin/users/${u.id}/unrestrict`)}
                      />
                    ) : (
                      <ActionChip
                        label="Restrict"
                        disabled={busyId === `u-${u.id}`}
                        onPress={() =>
                          void runAction(`u-${u.id}`, `/admin/users/${u.id}/restrict`, {
                            body: { reason: "Restricted from native admin" },
                          })
                        }
                      />
                    )}
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
                    <ActionChip
                      label="Trust"
                      tone="ok"
                      disabled={busyId === `u-${u.id}` || !isAdmin}
                      onPress={() => void runAction(`u-${u.id}`, `/admin/users/${u.id}/trust`)}
                    />
                    <ActionChip
                      label="Untrust"
                      disabled={busyId === `u-${u.id}` || !isAdmin}
                      onPress={() => void runAction(`u-${u.id}`, `/admin/users/${u.id}/untrust`)}
                    />
                  </View>
                </View>
              ))
            : null}

          {tab === "moderation"
            ? moderation.map((m, i) => {
                const id = m.listingId ?? m.id;
                return (
                  <View key={m.id ?? i} style={styles.card}>
                    <Text style={styles.rowTitle}>
                      {m.title || m.reason || m.type || m.status || `Listing #${id}`}
                    </Text>
                    <Text style={styles.meta}>
                      #{id} · {m.moderationStatus || m.status || "pending"} · {formatWhen(m.createdAt)}
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
                            body: { reason: "Rejected from native admin" },
                            confirm: "Reject this listing?",
                          })
                        }
                      />
                      <ActionChip
                        label="Suspend"
                        disabled={!id || busyId === `m-${id}`}
                        onPress={() =>
                          void runAction(`m-${id}`, `/admin/moderation/${id}/suspend`, {
                            body: { reason: "Suspended from native admin" },
                          })
                        }
                      />
                    </View>
                  </View>
                );
              })
            : null}

          {tab === "listings"
            ? listings.map((l) => (
                <View key={l.id} style={styles.card}>
                  <Text style={styles.rowTitle}>{l.title || `Listing #${l.id}`}</Text>
                  <Text style={styles.meta}>
                    #{l.id} · {l.status || "—"} · {l.moderationStatus || "—"} · {money(l.price)}
                  </Text>
                  <View style={styles.actions}>
                    <ActionChip
                      label="Feature"
                      tone="ok"
                      disabled={!isAdmin || busyId === `l-${l.id}`}
                      onPress={() => void runAction(`l-${l.id}`, `/admin/listings/${l.id}/feature`)}
                    />
                    <ActionChip
                      label="Boost"
                      disabled={!isAdmin || busyId === `l-${l.id}`}
                      onPress={() => void runAction(`l-${l.id}`, `/admin/listings/${l.id}/boost`)}
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
                    <ActionChip
                      label="Open"
                      onPress={() => router.push(`/listing/${l.id}`)}
                    />
                  </View>
                </View>
              ))
            : null}

          {tab === "finance"
            ? payments.map((p, i) => (
                <View key={p.id ?? i} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{p.type || p.provider || "Payment"}</Text>
                      <Text style={styles.meta}>
                        #{p.id} · {p.status || "—"} · {formatWhen(p.createdAt)}
                      </Text>
                    </View>
                    <Text style={styles.amt}>{money(p.amountUsd ?? p.amount ?? 0)}</Text>
                  </View>
                  <View style={styles.actions}>
                    <ActionChip
                      label="Mark verified"
                      tone="ok"
                      disabled={!isAdmin || !p.id || busyId === `p-${p.id}`}
                      onPress={() => void runAction(`p-${p.id}`, `/admin/payments/${p.id}/mark-verified`)}
                    />
                    <ActionChip
                      label="Refund"
                      tone="danger"
                      disabled={!isSuper || !p.id || busyId === `p-${p.id}`}
                      onPress={() =>
                        void runAction(`p-${p.id}`, `/admin/payments/${p.id}/refund`, {
                          confirm: `Refund payment #${p.id}?`,
                        })
                      }
                    />
                  </View>
                </View>
              ))
            : null}

          {tab === "boosts"
            ? boosts.map((b) => (
                <View key={b.id} style={styles.card}>
                  <Text style={styles.rowTitle}>
                    Boost #{b.id} · listing {b.listingId ?? "—"}
                  </Text>
                  <Text style={styles.meta}>
                    {b.status || "—"} · {b.tier || b.plan || "—"} · {formatWhen(b.createdAt)}
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
                          body: { reason: "Rejected from native admin" },
                          confirm: `Reject boost #${b.id}?`,
                        })
                      }
                    />
                  </View>
                </View>
              ))
            : null}

          {tab === "promo" ? (
            <View style={{ gap: 12 }}>
              {campaign ? (
                <View style={styles.card}>
                  <Text style={styles.rowTitle}>Campaign</Text>
                  <Text style={styles.meta}>
                    {campaign.campaignLabel || campaign.label || "Bonus campaign"} ·{" "}
                    {campaign.campaignActive || campaign.enabled ? "active" : "off"}
                  </Text>
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.rowTitle}>Create promo code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="CODE"
                  autoCapitalize="characters"
                  value={promoForm.code}
                  onChangeText={(code) => setPromoForm((p) => ({ ...p, code }))}
                />
                <View style={styles.actions}>
                  <ActionChip
                    label={promoForm.discountType === "percent" ? "% selected" : "Use %"}
                    tone={promoForm.discountType === "percent" ? "ok" : "neutral"}
                    onPress={() => setPromoForm((p) => ({ ...p, discountType: "percent" }))}
                  />
                  <ActionChip
                    label={promoForm.discountType === "fixed" ? "$ selected" : "Use $"}
                    tone={promoForm.discountType === "fixed" ? "ok" : "neutral"}
                    onPress={() => setPromoForm((p) => ({ ...p, discountType: "fixed" }))}
                  />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Discount value"
                  keyboardType="decimal-pad"
                  value={promoForm.discountValue}
                  onChangeText={(discountValue) => setPromoForm((p) => ({ ...p, discountValue }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Description (optional)"
                  value={promoForm.description}
                  onChangeText={(description) => setPromoForm((p) => ({ ...p, description }))}
                />
                <ActionChip
                  label={busyId === "promo-create" ? "Creating…" : "Create code"}
                  tone="ok"
                  disabled={!isAdmin || busyId === "promo-create" || promoForm.code.trim().length < 3}
                  onPress={() => void createPromo()}
                />
              </View>

              {promoCodes.map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.rowTitle}>{c.code}</Text>
                  <Text style={styles.meta}>
                    {c.discountType} {c.discountValue}
                    {c.discountType === "percent" ? "%" : ""} · uses {c.usedCount ?? 0}
                    {c.maxUses != null ? `/${c.maxUses}` : ""} · {c.active ? "active" : "off"}
                  </Text>
                  <View style={styles.actions}>
                    <ActionChip
                      label={c.active ? "Deactivate" : "Activate"}
                      tone={c.active ? "danger" : "ok"}
                      disabled={!isAdmin || busyId === `pc-${c.id}`}
                      onPress={() =>
                        void runAction(`pc-${c.id}`, `/admin/promo/codes/${c.id}`, {
                          method: "PATCH",
                          body: { active: !c.active },
                        })
                      }
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {tab === "support"
            ? threads.map((t) => (
                <Pressable key={t.id} style={styles.row} onPress={() => router.push(`/support/${t.id}`)}>
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

          {!error &&
          tab !== "overview" &&
          ((tab === "users" && !users.length) ||
            (tab === "moderation" && !moderation.length) ||
            (tab === "listings" && !listings.length) ||
            (tab === "finance" && !payments.length) ||
            (tab === "boosts" && !boosts.length) ||
            (tab === "promo" && !promoCodes.length) ||
            (tab === "support" && !threads.length)) ? (
            <Text style={styles.empty}>No records for this tab.</Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  denyTitle: { fontWeight: "800", fontSize: 16, color: colors.light.text },
  denySub: { color: "#94A3B8", textAlign: "center" },
  tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    marginRight: 8,
  },
  tabOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#64748B", fontSize: 12 },
  role: { color: "#64748B", marginBottom: 10, fontSize: 12 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
  },
  statLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  statValue: { marginTop: 4, fontSize: 20, fontWeight: "900", color: colors.light.text },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
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
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { fontWeight: "700", color: colors.light.text },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  amt: { fontWeight: "800", color: colors.flexaGreen },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: colors.light.text,
    marginTop: 6,
  },
  empty: { color: "#94A3B8", marginTop: 12 },
});
