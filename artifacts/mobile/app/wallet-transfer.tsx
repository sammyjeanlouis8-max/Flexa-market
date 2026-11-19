/**
 * Wallet / Flexa Card P2P transfer — WebView parity with WalletTransfer.tsx
 * Steps: search → amount → confirm → done. No empty FlatList gap.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
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

type UserHit = { id: number | string; name: string; avatar?: string | null; country?: string | null };
type Preview = {
  amountUsd: number;
  feeUsd: number;
  netAmountUsd: number;
  canTransfer: boolean;
  blockReason?: string | null;
  monthlyUsed?: number;
  monthlyLimit?: number;
  isInternational?: boolean;
};

const REGIONAL = new Set(["Haiti", "Dominican Republic"]);

function newIdemKey() {
  return `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function WalletTransferScreen() {
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<"search" | "amount" | "confirm" | "done">("search");
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
  const [recipientSource, setRecipientSource] = useState<"market" | "wholesale">("market");
  const [idemKey, setIdemKey] = useState("");
  const [transferPending, setTransferPending] = useState(false);

  useEffect(() => {
    if (!authLoading && !token) router.replace("/auth/login");
  }, [authLoading, token, router]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const d = await apiRequest<{ availableUsd?: number; balanceUsd?: number }>("/wallet/balance", {
          token,
        });
        setWalletAvailable(Number(d.availableUsd ?? d.balanceUsd ?? 0));
      } catch {
        /* ignore */
      }
    })();
  }, [token]);

  // New intent fields → new idempotency key (WebView parity)
  useEffect(() => {
    setIdemKey("");
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
    const amountUsd = Number(amount);
    setBusy(true);
    try {
      const key = idemKey || newIdemKey();
      if (!idemKey) setIdemKey(key);
      const data = await apiRequest<{ pending?: boolean }>(
        recipientSource === "market" ? "/wallet/p2p" : "/wallet/cross-app",
        {
          token,
          method: "POST",
          body:
            recipientSource === "market"
              ? { toUserId: selected.id, amountUsd, note: note.trim() || undefined, idempotencyKey: key }
              : {
                  destinationUserId: selected.id,
                  amountUsd,
                  note: note.trim() || undefined,
                  idempotencyKey: key,
                },
          headers: { "Idempotency-Key": key },
        },
      );
      setTransferPending(Boolean(data?.pending));
      setStep("done");
      // refresh balance
      try {
        const d = await apiRequest<{ availableUsd?: number; balanceUsd?: number }>("/wallet/balance", {
          token,
        });
        setWalletAvailable(Number(d.availableUsd ?? d.balanceUsd ?? 0));
      } catch {
        /* ignore */
      }
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
    setIdemKey("");
    setTransferPending(false);
    setError(null);
  };

  const amountNum = Number(amount);
  const overBalance =
    walletAvailable != null && Number.isFinite(amountNum) && amountNum > walletAvailable;
  const intlBadge =
    selected &&
    !REGIONAL.has(selected.country ?? "") &&
    REGIONAL.has(user?.country ?? "");

  return (
    <View style={styles.root} testID="wallet-transfer-screen">
      <AppHeader title="Transfer" showBack showCart={false} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          testID="wallet-transfer-scroll"
        >
          {/* Hero — match WebView centered title + balance */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Feather name="send" size={28} color={colors.flexaGreen} />
            </View>
            <Text style={styles.heroTitle}>Send money</Text>
            {walletAvailable != null ? (
              <Text style={styles.heroBal}>
                Available: <Text style={styles.heroBalBold}>{money(walletAvailable)}</Text>
              </Text>
            ) : null}
          </View>

          <View style={styles.infoBox}>
            <Feather name="shield" size={16} color="#1D4ED8" />
            <Text style={styles.infoText}>
              Regional transfers are free within Haiti & DR. International transfers may include a
              fee. Monthly limits apply.
            </Text>
          </View>

          {step === "done" ? (
            <View style={styles.doneBox} testID="wallet-transfer-done">
              <View style={styles.doneIcon}>
                <Feather name="check-circle" size={40} color="#16A34A" />
              </View>
              <Text style={styles.doneTitle}>
                {transferPending ? "Transfer pending" : "Transfer sent"}
              </Text>
              <Text style={styles.doneDesc}>
                {transferPending
                  ? "Your wallet was debited safely. Delivery will retry automatically; you will not be charged twice."
                  : `Sent ${money(amountNum)} to ${selected?.name ?? "recipient"}.`}
              </Text>
              {preview?.netAmountUsd != null ? (
                <Text style={styles.meta}>They receive {money(preview.netAmountUsd)}</Text>
              ) : null}
              <View style={styles.row}>
                <Pressable style={styles.btnOutline} onPress={resetNew} testID="transfer-new">
                  <Text style={styles.btnOutlineText}>New transfer</Text>
                </Pressable>
                <Pressable
                  style={styles.btn}
                  onPress={() => router.replace("/wallet")}
                  testID="transfer-view-wallet"
                >
                  <Text style={styles.btnText}>View wallet</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => router.push("/wallet-history")} testID="transfer-history-link">
                <Text style={styles.link}>View transfer history</Text>
              </Pressable>
            </View>
          ) : null}

          {step === "search" ? (
            <View testID="wallet-transfer-search">
              <Text style={styles.sectionTitle}>Find recipient</Text>
              <View style={styles.segment}>
                <Pressable
                  style={[styles.segBtn, recipientSource === "market" && styles.segBtnOn]}
                  onPress={() => {
                    setRecipientSource("market");
                    setHits([]);
                    setSelected(null);
                  }}
                  testID="transfer-source-market"
                >
                  <Text
                    style={[styles.segText, recipientSource === "market" && styles.segTextOn]}
                  >
                    Flexa Market
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.segBtn, recipientSource === "wholesale" && styles.segBtnOn]}
                  onPress={() => {
                    setRecipientSource("wholesale");
                    setHits([]);
                    setSelected(null);
                  }}
                  testID="transfer-source-wholesale"
                >
                  <Text
                    style={[styles.segText, recipientSource === "wholesale" && styles.segTextOn]}
                  >
                    Flexa Wholesale
                  </Text>
                </Pressable>
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

              {/* Results only when present — no reserved blank FlatList gap */}
              {hits.length > 0 ? (
                <View style={styles.hits} testID="transfer-search-results">
                  {hits.map((item) => (
                    <Pressable
                      key={String(item.id)}
                      style={styles.hit}
                      onPress={() => {
                        setSelected(item);
                        setQ("");
                        setHits([]);
                        setStep("amount");
                      }}
                      testID={`transfer-hit-${item.id}`}
                    >
                      {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarLetter}>
                            {(item.name || "?").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hitName}>{item.name}</Text>
                        {recipientSource === "wholesale" ? (
                          <Text style={styles.wholesaleTag}>Flexa Wholesale</Text>
                        ) : null}
                        {item.country ? <Text style={styles.meta}>{item.country}</Text> : null}
                      </View>
                      <Feather name="chevron-right" size={18} color="#94A3B8" />
                    </Pressable>
                  ))}
                </View>
              ) : q.trim().length >= 2 && !searching ? (
                <Text style={styles.empty}>No users found</Text>
              ) : null}
            </View>
          ) : null}

          {step === "amount" && selected ? (
            <View testID="wallet-transfer-amount">
              <Pressable
                style={styles.selected}
                onPress={() => setStep("search")}
                testID="transfer-change-recipient"
              >
                {selected.avatar ? (
                  <Image source={{ uri: selected.avatar }} style={styles.avatarLg} />
                ) : (
                  <View style={[styles.avatarLg, styles.avatarFallback]}>
                    <Text style={styles.avatarLetterLg}>
                      {(selected.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{selected.name}</Text>
                  <Text style={styles.meta}>{selected.country || "Tap to change"}</Text>
                </View>
                {intlBadge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Intl</Text>
                  </View>
                ) : null}
              </Pressable>

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
                  testID="transfer-max-balance"
                >
                  <Text style={styles.maxLink}>Available {money(walletAvailable)} (max)</Text>
                </Pressable>
              ) : null}
              {overBalance ? (
                <Text style={styles.err}>Amount exceeds available balance</Text>
              ) : null}

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="What's this for?"
                placeholderTextColor="#94A3B8"
                testID="transfer-note-input"
              />

              <View style={styles.row}>
                <Pressable
                  style={styles.btnOutline}
                  onPress={() => setStep("search")}
                  testID="transfer-back-search"
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
            <View testID="wallet-transfer-confirm">
              <Text style={styles.sectionTitle}>Confirm transfer</Text>
              {loadingPreview ? (
                <ActivityIndicator color={colors.flexaGreen} style={{ marginVertical: 24 }} />
              ) : preview ? (
                <>
                  {preview.blockReason ? (
                    <Text style={styles.err}>{preview.blockReason}</Text>
                  ) : null}
                  <View style={styles.preview}>
                    <View style={styles.previewRow}>
                      <Text style={styles.meta}>Send to</Text>
                      <Text style={styles.previewLine}>{selected.name}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.meta}>Amount</Text>
                      <Text style={styles.previewLine}>{money(amountNum)}</Text>
                    </View>
                    {preview.feeUsd > 0 ? (
                      <View style={styles.previewRow}>
                        <Text style={styles.meta}>Fee</Text>
                        <Text style={[styles.previewLine, { color: "#D97706" }]}>
                          −{money(preview.feeUsd)}
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.previewRow, styles.previewTotal]}>
                      <Text style={styles.previewLine}>They receive</Text>
                      <Text style={[styles.previewLine, { color: colors.flexaGreen }]}>
                        {money(preview.netAmountUsd)}
                      </Text>
                    </View>
                    {preview.monthlyLimit != null ? (
                      <Text style={[styles.meta, { marginTop: 8 }]}>
                        Monthly used {money(preview.monthlyUsed)} / {money(preview.monthlyLimit)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.row}>
                    <Pressable
                      style={styles.btnOutline}
                      onPress={() => setStep("amount")}
                      testID="transfer-change-amount"
                    >
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
                <Pressable
                  style={styles.btn}
                  onPress={() => void loadPreview(amount)}
                  testID="transfer-recalc"
                >
                  <Text style={styles.btnText}>Calculate fee</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {error ? <Text style={styles.err}>{error}</Text> : null}

          {step !== "done" ? (
            <Pressable onPress={() => router.push("/wallet-history")} testID="transfer-history-footer">
              <Text style={styles.link}>View transfer history</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  heroBal: { marginTop: 4, color: "#64748B", fontSize: 13 },
  heroBalBold: { fontWeight: "800", color: colors.light.text },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  infoText: { flex: 1, color: "#1D4ED8", fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.light.text, marginBottom: 10 },
  segment: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  segBtn: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segBtnOn: { backgroundColor: colors.flexaGreen },
  segText: { fontWeight: "700", color: "#64748B", fontSize: 13 },
  segTextOn: { color: "#fff" },
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
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 84,
  },
  searchBtnText: { color: "#fff", fontWeight: "800" },
  hits: { marginTop: 10, gap: 8 },
  hit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 16,
    padding: 12,
  },
  hitName: { fontWeight: "700", color: colors.light.text },
  wholesaleTag: { color: colors.flexaGreen, fontSize: 10, fontWeight: "700", marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarLg: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontWeight: "800", color: colors.flexaGreen },
  avatarLetterLg: { fontWeight: "900", fontSize: 18, color: colors.flexaGreen },
  selected: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  selectedName: { fontWeight: "800", color: colors.light.text, fontSize: 16 },
  badge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: "#92400E", fontSize: 11, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "700", color: "#94A3B8", marginBottom: 6, marginTop: 12 },
  amountWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 56,
  },
  dollar: { fontSize: 22, fontWeight: "800", color: "#94A3B8", marginRight: 4 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: "800", color: colors.light.text },
  maxLink: { marginTop: 6, color: colors.flexaGreen, fontWeight: "700", fontSize: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: colors.light.text,
  },
  preview: {
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
  },
  previewRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  previewTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.light.border,
    paddingTop: 10,
    marginBottom: 0,
  },
  previewLine: { fontWeight: "700", color: colors.light.text },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  empty: { color: "#94A3B8", paddingVertical: 12 },
  err: { color: colors.light.destructive, marginTop: 8 },
  row: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnOutline: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { color: colors.light.text, fontWeight: "700" },
  link: { marginTop: 16, textAlign: "center", color: colors.flexaGreen, fontWeight: "700" },
  doneBox: { alignItems: "center", paddingVertical: 24 },
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
  doneDesc: { textAlign: "center", color: "#64748B", marginBottom: 8, paddingHorizontal: 12 },
});
