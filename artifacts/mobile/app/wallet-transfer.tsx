/**
 * Wallet Money Transfer — WebView WalletTransfer parity
 * Steps: search → amount → confirm → done
 * Market P2P + Flexa Wholesale cross-app search/preview/send
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, money } from "@/lib/request";
import { fetchWalletBalance } from "@/lib/walletApi";

const REGIONAL_COUNTRIES = ["Haiti", "Dominican Republic"];

type UserHit = {
  id: number | string;
  name: string;
  avatar?: string | null;
  country?: string | null;
};

type Preview = {
  amountUsd: number;
  feeUsd: number;
  netAmountUsd: number;
  isInternational?: boolean;
  internationalFeeRate?: number | null;
  dailyFee?: number;
  monthlyUsed?: number;
  monthlyLimit?: number;
  canTransfer: boolean;
  blockReason?: string | null;
  maxSendable?: number;
};

type Step = "search" | "amount" | "confirm" | "done";
type RecipientSource = "market" | "wholesale";

function newIdemKey() {
  return `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function WalletTransferScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();

  const [step, setStep] = useState<Step>("search");
  const [recipientSource, setRecipientSource] = useState<RecipientSource>("market");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<UserHit | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState<number | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [transferPending, setTransferPending] = useState(false);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  useEffect(() => {
    if (!token) return;
    fetchWalletBalance({ token })
      .then((b) => setWalletAvailable(b.availableUsd))
      .catch(() => setWalletAvailable(null));
  }, [token]);

  // New intent when recipient/amount/note/source change — avoids duplicate charges on retry.
  useEffect(() => {
    setIdempotencyKey("");
  }, [recipientSource, selected?.id, amount, note]);

  const searchUsers = async () => {
    if (!token || !q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      if (recipientSource === "market") {
        const res = await apiRequest<{ users: UserHit[] }>(
          `/wallet/p2p/search?q=${encodeURIComponent(q.trim())}`,
          { token },
        );
        setHits(res.users ?? []);
      } else {
        const res = await apiRequest<{ users: UserHit[] }>("/wallet/cross-app/search", {
          token,
          method: "POST",
          body: { query: q.trim() },
        });
        setHits(res.users ?? []);
      }
    } catch (e) {
      setHits([]);
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const loadPreview = async (amt: string) => {
    if (!token || !selected) return;
    const amountUsd = Number(amt);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;
    setLoadingPreview(true);
    setError(null);
    try {
      const p =
        recipientSource === "market"
          ? await apiRequest<Preview>("/wallet/p2p/preview", {
              token,
              method: "POST",
              body: { toUserId: selected.id, amountUsd },
            })
          : await apiRequest<Preview>("/wallet/cross-app/preview", {
              token,
              method: "POST",
              body: { destinationUserId: selected.id, amountUsd },
            });
      setPreview(p);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoadingPreview(false);
    }
  };

  const send = async () => {
    if (!token || !selected || !preview) return;
    if (!preview.canTransfer) {
      Alert.alert("Cannot transfer", preview.blockReason || "Check amount and recipient");
      return;
    }
    setBusy(true);
    try {
      const key = idempotencyKey || newIdemKey();
      if (!idempotencyKey) setIdempotencyKey(key);
      const amountUsd = Number(amount);
      const data =
        recipientSource === "market"
          ? await apiRequest<{ pending?: boolean }>("/wallet/p2p", {
              token,
              method: "POST",
              body: {
                toUserId: selected.id,
                amountUsd,
                note: note.trim() || undefined,
                idempotencyKey: key,
              },
              headers: { "Idempotency-Key": key },
            })
          : await apiRequest<{ pending?: boolean }>("/wallet/cross-app", {
              token,
              method: "POST",
              body: {
                destinationUserId: selected.id,
                amountUsd,
                note: note.trim() || undefined,
                idempotencyKey: key,
              },
              headers: { "Idempotency-Key": key },
            });
      setTransferPending(Boolean(data?.pending));
      setStep("done");
    } catch (e) {
      Alert.alert("Transfer failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const resetNew = () => {
    setStep("search");
    setSelected(null);
    setAmount("");
    setNote("");
    setPreview(null);
    setHits([]);
    setQ("");
    setIdempotencyKey("");
    setTransferPending(false);
    setError(null);
  };

  const amountNum = Number(amount);
  const overBalance =
    walletAvailable != null && Number.isFinite(amountNum) && amountNum > walletAvailable;

  const internationalHint = useMemo(() => {
    if (!selected?.country || !user?.country) return false;
    return (
      !REGIONAL_COUNTRIES.includes(selected.country) &&
      REGIONAL_COUNTRIES.includes(user.country)
    );
  }, [selected?.country, user?.country]);

  if (step === "done") {
    return (
      <View style={styles.root} testID="wallet-transfer-done">
        <AppHeader title="Money Transfer" showBack showCart={false} />
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Feather name="check-circle" size={40} color="#16A34A" />
          </View>
          <Text style={styles.doneTitle}>
            {transferPending ? "Transfer pending" : "Transfer sent"}
          </Text>
          <Text style={styles.doneBody}>
            {transferPending
              ? "Your wallet was debited safely. Delivery will retry automatically; you will not be charged twice."
              : `Sent ${money(amountNum)} to ${selected?.name || "recipient"}.`}
          </Text>
          {preview?.netAmountUsd != null ? (
            <Text style={styles.meta}>They receive {money(preview.netAmountUsd)}</Text>
          ) : null}
          <View style={styles.rowGap}>
            <Pressable style={styles.btnOutline} onPress={resetNew}>
              <Text style={styles.btnOutlineText}>New transfer</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => router.replace("/wallet")}>
              <Text style={styles.btnText}>View wallet</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="wallet-transfer-screen">
      <AppHeader title="Money Transfer" showBack showCart={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name="send" size={26} color={colors.flexaGreen} />
          </View>
          <Text style={styles.heroTitle}>Money Transfer</Text>
          {walletAvailable != null ? (
            <Text style={styles.heroBalance}>
              Available: <Text style={styles.heroBalanceStrong}>{money(walletAvailable)}</Text>
            </Text>
          ) : null}
        </View>

        <View style={styles.infoBox}>
          <Feather name="shield" size={16} color="#1D4ED8" />
          <Text style={styles.infoText}>
            Regional transfers are free within Haiti & DR daily limits. International transfers may
            include a fee shown before you confirm.
          </Text>
        </View>

        {step === "search" ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Find recipient</Text>
            <View style={styles.segment}>
              {(["market", "wholesale"] as RecipientSource[]).map((src) => (
                <Pressable
                  key={src}
                  style={[styles.segmentBtn, recipientSource === src && styles.segmentOn]}
                  onPress={() => {
                    setRecipientSource(src);
                    setHits([]);
                    setSelected(null);
                  }}
                  testID={`transfer-source-${src}`}
                >
                  <Text
                    style={[styles.segmentText, recipientSource === src && styles.segmentTextOn]}
                  >
                    {src === "market" ? "Flexa Market" : "Flexa Wholesale"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.searchRow}>
              <View style={styles.search}>
                <Feather name="search" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  value={q}
                  onChangeText={setQ}
                  placeholder="Name, email, or phone"
                  placeholderTextColor="#94A3B8"
                  onSubmitEditing={() => void searchUsers()}
                  returnKeyType="search"
                  testID="transfer-search-input"
                />
              </View>
              <Pressable
                style={styles.searchBtn}
                onPress={() => void searchUsers()}
                disabled={searching}
                testID="transfer-search-btn"
              >
                {searching ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.searchBtnText}>Search</Text>
                )}
              </Pressable>
            </View>
            {error ? <Text style={styles.err}>{error}</Text> : null}
            <FlatList
              data={hits}
              keyExtractor={(u) => String(u.id)}
              scrollEnabled={false}
              ListEmptyComponent={
                q.trim().length >= 2 && !searching ? (
                  <Text style={styles.empty}>No users found</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.hit}
                  onPress={() => {
                    setSelected(item);
                    setStep("amount");
                    setQ("");
                    setHits([]);
                  }}
                >
                  {item.avatar ? (
                    <Image source={{ uri: item.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>{item.name?.[0] || "?"}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hitName}>{item.name}</Text>
                    {recipientSource === "wholesale" ? (
                      <Text style={styles.wholesaleTag}>Flexa Wholesale</Text>
                    ) : null}
                    {item.country ? <Text style={styles.meta}>{item.country}</Text> : null}
                  </View>
                  {internationalHint ||
                  (item.country &&
                    !REGIONAL_COUNTRIES.includes(item.country) &&
                    user?.country &&
                    REGIONAL_COUNTRIES.includes(user.country)) ? (
                    <View style={styles.badge}>
                      <Feather name="globe" size={10} color="#64748B" />
                      <Text style={styles.badgeText}>Intl</Text>
                    </View>
                  ) : null}
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </Pressable>
              )}
            />
          </View>
        ) : null}

        {step === "amount" && selected ? (
          <View style={styles.section}>
            <View style={styles.selectedCard}>
              {selected.avatar ? (
                <Image source={{ uri: selected.avatar }} style={styles.avatarLg} />
              ) : (
                <View style={[styles.avatarLg, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{selected.name?.[0] || "?"}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName}>{selected.name}</Text>
                <Text style={styles.meta}>{selected.country || ""}</Text>
              </View>
              {selected.country && !REGIONAL_COUNTRIES.includes(selected.country) ? (
                <View style={[styles.badge, styles.badgeWarn]}>
                  <Feather name="globe" size={10} color="#92400E" />
                  <Text style={[styles.badgeText, { color: "#92400E" }]}>Intl</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.label}>Amount (USD)</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={(v) => {
                  setAmount(v);
                  setPreview(null);
                }}
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                testID="transfer-amount-input"
              />
            </View>
            {walletAvailable != null ? (
              <Pressable
                onPress={() => {
                  setAmount(walletAvailable.toFixed(2));
                  setPreview(null);
                }}
              >
                <Text style={styles.maxLink}>Use max {money(walletAvailable)}</Text>
              </Pressable>
            ) : null}
            {overBalance ? (
              <Text style={styles.err}>Amount exceeds available balance.</Text>
            ) : null}

            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="What's this for?"
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.rowGap}>
              <Pressable
                style={styles.btnOutline}
                onPress={() => {
                  setStep("search");
                  setSelected(null);
                }}
              >
                <Text style={styles.btnOutlineText}>Back</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  (!amount || amountNum <= 0 || overBalance) && { opacity: 0.5 },
                ]}
                disabled={!amount || amountNum <= 0 || overBalance}
                onPress={() => {
                  setStep("confirm");
                  void loadPreview(amount);
                }}
                testID="transfer-continue"
              >
                <Text style={styles.btnText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === "confirm" && selected ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirm transfer</Text>
            {loadingPreview ? (
              <ActivityIndicator color={colors.flexaGreen} style={{ marginVertical: 24 }} />
            ) : preview ? (
              <>
                {preview.blockReason ? (
                  <View style={styles.blockBox}>
                    <Feather name="alert-circle" size={16} color="#B91C1C" />
                    <Text style={styles.blockText}>{preview.blockReason}</Text>
                  </View>
                ) : null}
                <View style={styles.previewCard}>
                  <View style={styles.previewRow}>
                    <Text style={styles.meta}>Send to</Text>
                    <Text style={styles.previewVal}>{selected.name}</Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.meta}>Amount</Text>
                    <Text style={styles.previewVal}>{money(amountNum)}</Text>
                  </View>
                  {preview.feeUsd > 0 ? (
                    <View style={styles.previewRow}>
                      <Text style={styles.meta}>Fee</Text>
                      <Text style={[styles.previewVal, { color: "#D97706" }]}>
                        -{money(preview.feeUsd)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={[styles.previewRow, styles.previewTotal]}>
                    <Text style={styles.previewVal}>They receive</Text>
                    <Text style={[styles.previewVal, { color: colors.flexaGreen }]}>
                      {money(preview.netAmountUsd)}
                    </Text>
                  </View>
                  {preview.monthlyLimit != null ? (
                    <Text style={styles.meta}>
                      Monthly {money(preview.monthlyUsed)} / {money(preview.monthlyLimit)}
                    </Text>
                  ) : null}
                </View>
                {!preview.isInternational ? (
                  <View style={styles.regionalBox}>
                    <Feather name="shield" size={14} color="#16A34A" />
                    <Text style={styles.regionalText}>Regional transfer — no international fee</Text>
                  </View>
                ) : null}
                <View style={styles.rowGap}>
                  <Pressable style={styles.btnOutline} onPress={() => setStep("amount")}>
                    <Text style={styles.btnOutlineText}>Change</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, (!preview.canTransfer || busy) && { opacity: 0.5 }]}
                    disabled={!preview.canTransfer || busy}
                    onPress={() => void send()}
                    testID="transfer-send"
                  >
                    <Text style={styles.btnText}>
                      {busy ? "Sending…" : `Send ${money(amountNum)}`}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable style={styles.btn} onPress={() => void loadPreview(amount)}>
                <Text style={styles.btnText}>Calculate fee</Text>
              </Pressable>
            )}
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </View>
        ) : null}

        <Pressable onPress={() => router.push("/wallet-history")} style={{ marginTop: 8 }}>
          <Text style={styles.link}>View transfer history</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  body: { padding: 16, paddingBottom: 40 },
  hero: { alignItems: "center", marginBottom: 12 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: { fontSize: 22, fontWeight: "900", color: colors.light.text },
  heroBalance: { marginTop: 4, color: "#64748B", fontSize: 13 },
  heroBalanceStrong: { fontWeight: "800", color: colors.light.text },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: "#1E40AF", lineHeight: 17 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.light.text },
  segment: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOn: { backgroundColor: colors.flexaGreen },
  segmentText: { fontWeight: "700", color: "#475569", fontSize: 12 },
  segmentTextOn: { color: "#fff" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: { flex: 1, color: colors.light.text },
  searchBtn: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnText: { color: "#fff", fontWeight: "800" },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarLg: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontWeight: "800", color: colors.flexaGreen },
  hitName: { fontWeight: "700", color: colors.light.text },
  wholesaleTag: { fontSize: 10, fontWeight: "700", color: colors.flexaGreen, marginTop: 2 },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  empty: { color: "#94A3B8", padding: 12 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeWarn: { backgroundColor: "#FEF3C7" },
  badgeText: { fontSize: 10, color: "#64748B", fontWeight: "700" },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
  },
  selectedName: { fontWeight: "800", color: colors.light.text, fontSize: 16 },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginTop: 6 },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 56,
  },
  dollar: { fontSize: 22, fontWeight: "800", color: "#94A3B8", marginRight: 4 },
  amountInput: { flex: 1, fontSize: 24, fontWeight: "800", color: colors.light.text },
  maxLink: { color: colors.flexaGreen, fontWeight: "700", fontSize: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: colors.light.text,
  },
  rowGap: { flexDirection: "row", gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnOutline: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { color: colors.light.text, fontWeight: "700" },
  previewCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  previewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previewTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.border,
    paddingTop: 8,
  },
  previewVal: { fontWeight: "800", color: colors.light.text },
  blockBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  blockText: { flex: 1, color: "#B91C1C", fontSize: 13 },
  regionalBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 10,
  },
  regionalText: { color: "#166534", fontSize: 12, fontWeight: "600" },
  err: { color: colors.light.destructive, marginTop: 4 },
  link: { textAlign: "center", color: colors.flexaGreen, fontWeight: "700", marginTop: 16 },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  doneTitle: { fontSize: 22, fontWeight: "900", color: colors.light.text, marginBottom: 8 },
  doneBody: { textAlign: "center", color: "#64748B", marginBottom: 8, lineHeight: 20 },
});
