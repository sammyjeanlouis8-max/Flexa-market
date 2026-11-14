/**
 * My Wallet — native parity with web Wallet Overview / Promo / Transactions.
 * Deposit/top-up remain blocked on Android (Play digital goods + server guard).
 * Haiti cart checkout with FM Wallet balance stays available.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import {
  convertPromo,
  fetchPlatformMonthly,
  fetchPlatformRevenue,
  fetchWalletBalance,
  fetchWalletHistory,
  fetchWalletReferral,
  formatLocalCurrency,
  moneyUsd,
  redeemWalletCard,
  unlockPromo,
  walletTxLabel,
  type PlatformMonthStatement,
  type PlatformRevenueSummary,
  type WalletBalance,
  type WalletReferral,
  type WalletTx,
} from "@/lib/walletApi";

type TabKey = "overview" | "promo" | "transactions";
type FilterKey = "all" | "in" | "out";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();

  const [tab, setTab] = useState<TabKey>("overview");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [txs, setTxs] = useState<WalletTx[] | null>(null);
  const [totalIn, setTotalIn] = useState(0);
  const [totalOut, setTotalOut] = useState(0);
  const [referral, setReferral] = useState<WalletReferral | null>(null);
  const [platformRev, setPlatformRev] = useState<PlatformRevenueSummary | null>(null);
  const [platformDenied, setPlatformDenied] = useState(false);
  const [statements, setStatements] = useState<PlatformMonthStatement[] | null>(null);
  const [showStatements, setShowStatements] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<WalletTx | null>(null);

  const isSuperAdmin = !!(
    user?.isSuperAdmin ||
    String(user?.role ?? "")
      .toLowerCase()
      .replace(/[\s_-]+/g, "") === "superadmin"
  );
  const isDominican = user?.country === "Dominican Republic";
  const isHaiti = user?.country === "Haiti";
  const isAgent =
    String(user?.role ?? "").toLowerCase() === "agent" ||
    !!(user?.isAdmin || user?.isSuperAdmin);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const [b, h, ref] = await Promise.all([
          fetchWalletBalance({ token }),
          fetchWalletHistory({ token }, filter, tab === "transactions" ? 200 : 5),
          fetchWalletReferral({ token }).catch(() => null),
        ]);
        setBalance(b);
        setTxs(h.transactions);
        setTotalIn(h.totalIn);
        setTotalOut(h.totalOut);
        setReferral(ref);
        if (isSuperAdmin) {
          const rev = await fetchPlatformRevenue({ token });
          setPlatformRev(rev);
          setPlatformDenied(rev == null);
        } else {
          setPlatformRev(null);
          setPlatformDenied(false);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load wallet");
        setTxs((prev) => prev ?? []);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, filter, tab, isSuperAdmin],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const localAmount = useMemo(() => {
    if (!balance) return null;
    if (isDominican) {
      return (
        balance.balanceDop ??
        Math.round(balance.balanceUsd * (balance.rateDopToUsd ?? 60))
      );
    }
    return (
      balance.balanceHtg ?? Math.round(balance.balanceUsd * (balance.rateHtgToUsd ?? 130))
    );
  }, [balance, isDominican]);

  const shareAccount = async () => {
    const id = balance?.accountNumber;
    if (!id) return;
    await Share.share({
      message: `Flexa Market Wallet ID: ${id}\nhttps://flexamarket.com/wallet`,
    });
  };

  const onDeposit = () => {
    Alert.alert(
      "Deposit unavailable",
      "Wallet top-ups and card recharges are not available in the Android app (Google Play digital goods policy). Your balance, history, P2P send, and Haiti cart checkout with FM Wallet remain available.",
    );
  };

  const onCashout = () => {
    if (!isHaiti && !isDominican) {
      Alert.alert(
        "Cash out",
        "Cash-out options depend on your country. Haiti supports MonCash/NatCash; other regions use authorized agents where available.",
      );
    }
    router.push("/wallet-cashout" as any);
  };

  const runUnlock = async () => {
    if (!token) return;
    setBusy("unlock");
    try {
      await unlockPromo({ token });
      await load("refresh");
      Alert.alert("Unlocked", "Promo balance unlocked where eligible.");
    } catch (e) {
      Alert.alert("Unlock failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(null);
    }
  };

  const runConvert = async () => {
    if (!token) return;
    setBusy("convert");
    try {
      await convertPromo({ token });
      await load("refresh");
      Alert.alert("Converted", "Unlocked promo converted to spendable balance.");
    } catch (e) {
      Alert.alert("Convert failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(null);
    }
  };

  const runRedeem = async () => {
    if (!token || !redeemCode.trim()) return;
    setBusy("redeem");
    try {
      await redeemWalletCard({ token }, redeemCode);
      setRedeemOpen(false);
      setRedeemCode("");
      await load("refresh");
      Alert.alert("Redeemed", "Card credited to your wallet.");
    } catch (e) {
      Alert.alert("Redeem failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(null);
    }
  };

  const loadStatements = async () => {
    if (!token || !isSuperAdmin) return;
    if (statements) {
      setShowStatements(true);
      return;
    }
    setBusy("stmt");
    try {
      const months = await fetchPlatformMonthly({ token });
      setStatements(months);
      setShowStatements(true);
    } catch (e) {
      Alert.alert("Statement failed", e instanceof Error ? e.message : "Unauthorized or error");
    } finally {
      setBusy(null);
    }
  };

  const previewTxs = (txs ?? []).slice(0, tab === "transactions" ? 200 : 5);
  const qrUri = balance?.accountNumber
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(balance.accountNumber)}`
    : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.light.text} />
        </Pressable>
        <Text style={styles.topTitle}>My Wallet</Text>
        <Pressable onPress={() => void load("refresh")} hitSlop={12} style={styles.iconBtn}>
          <Feather name="refresh-cw" size={18} color={colors.flexaGreen} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(
          [
            ["overview", "Overview", "grid"],
            ["promo", "Promo Account", "gift"],
            ["transactions", "Transactions", "clock"],
          ] as const
        ).map(([id, label, icon]) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => setTab(id)}
            >
              <Feather name={icon} size={14} color={on ? "#fff" : "#64748B"} />
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !refreshing && !balance ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
          <Text style={styles.muted}>Loading wallet…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ══ OVERVIEW ═══════════════════════════════════════════════════ */}
          {tab === "overview" ? (
            <>
              {/* Flexa Wallet hero */}
              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <View style={styles.heroLeft}>
                    <View style={styles.heroLogo}>
                      <Text style={styles.heroF}>F</Text>
                    </View>
                    <View>
                      <Text style={styles.heroBrand}>FLEXA WALLET</Text>
                      <Text style={styles.heroId}>
                        {balance?.accountNumber ?? "FM-······"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.heroIcons}>
                    <Pressable
                      style={styles.heroIconBtn}
                      onPress={() => setBalanceVisible((v) => !v)}
                    >
                      <Feather
                        name={balanceVisible ? "eye" : "eye-off"}
                        size={14}
                        color="#fff"
                      />
                    </Pressable>
                    <Pressable
                      style={styles.heroIconBtn}
                      onPress={() => setShowQR(true)}
                      disabled={!balance?.accountNumber}
                    >
                      <Feather name="grid" size={14} color="#fff" />
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.heroLabel}>Total Balance</Text>
                <Text style={styles.heroBal}>
                  {balanceVisible ? moneyUsd(balance?.balanceUsd) : "$  ••••••"}
                </Text>
                <Text style={styles.heroLocal}>
                  {balanceVisible
                    ? formatLocalCurrency(localAmount, isDominican ? "DOP" : "HTG")
                    : isDominican
                      ? "RD$ ••• ••• DOP"
                      : "G ••• ••• HTG"}
                </Text>

                <View style={styles.heroActions}>
                  {(balance?.bonusPct ?? 0) > 0 ? (
                    <View style={styles.bonusPill}>
                      <Text style={styles.bonusText}>+{balance?.bonusPct}% bonus</Text>
                    </View>
                  ) : (
                    <View />
                  )}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable style={styles.heroBtn} onPress={() => void shareAccount()}>
                      <Feather name="copy" size={11} color="#fff" />
                      <Text style={styles.heroBtnText}>Copy ID</Text>
                    </Pressable>
                    <Pressable style={styles.heroBtn} onPress={() => void shareAccount()}>
                      <Feather name="share-2" size={11} color="#fff" />
                      <Text style={styles.heroBtnText}>Share</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Platform account — Super Admin only */}
              {isSuperAdmin ? (
                <View style={styles.platformCard}>
                  <View style={styles.platformTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.platformTitle}>FM FLEXAMARKET CARD</Text>
                      <Text style={styles.platformId}>FM-FLEXA-MARKET</Text>
                      <Text style={styles.platformSub}>Official platform account</Text>
                    </View>
                    <Pressable onPress={() => void load("refresh")}>
                      <Feather name="refresh-cw" size={16} color={colors.flexaGreen} />
                    </Pressable>
                  </View>
                  {platformDenied ? (
                    <Text style={styles.errorText}>
                      Unauthorized — backend rejected platform revenue for this session.
                    </Text>
                  ) : platformRev ? (
                    <>
                      <Text style={styles.platformBal}>
                        {moneyUsd(platformRev.totalRevenue)}
                      </Text>
                      <View style={styles.platformGrid}>
                        {[
                          ["Commission", platformRev.merchantCommission],
                          ["Transfer Fee", platformRev.p2pTransferFees],
                          ["Recharge", platformRev.rechargeFees],
                          ["Boost", platformRev.boostRevenue],
                          ["Subscription", platformRev.subscriptionRevenue],
                        ].map(([label, val]) => (
                          <Text key={String(label)} style={styles.platformMeta}>
                            {label}{" "}
                            <Text style={{ color: "#064E3B", fontWeight: "800" }}>
                              {moneyUsd(val as number)}
                            </Text>
                          </Text>
                        ))}
                      </View>
                      <View style={styles.platformActions}>
                        <Pressable
                          style={styles.outlineBtn}
                          onPress={() =>
                            void Share.share({ message: "FM-FLEXA-MARKET" })
                          }
                        >
                          <Text style={styles.outlineBtnText}>Copy ID</Text>
                        </Pressable>
                        <Pressable
                          style={styles.solidBtn}
                          onPress={() => void loadStatements()}
                        >
                          <Feather name="bar-chart-2" size={12} color="#FBBF24" />
                          <Text style={styles.solidBtnText}>
                            {busy === "stmt" ? "…" : "Monthly Statement"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.outlineBtn}
                          onPress={() =>
                            void Share.share({
                              message: `Platform: FM-FLEXA-MARKET\nRevenue: ${moneyUsd(platformRev.totalRevenue)}`,
                            })
                          }
                        >
                          <Text style={styles.outlineBtnText}>Share</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <ActivityIndicator color={colors.flexaGreen} />
                  )}
                </View>
              ) : null}

              {/* Quick actions */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.actionsRow}
              >
                {(
                  [
                    { label: "Deposit", icon: "plus" as const, solid: true as boolean, onPress: onDeposit },
                    {
                      label: "Send",
                      icon: "send" as const,
                      solid: false as boolean,
                      onPress: () => router.push("/wallet-transfer"),
                    },
                    {
                      label: "Contacts",
                      icon: "users" as const,
                      solid: false as boolean,
                      onPress: () =>
                        Alert.alert(
                          "Contacts",
                          "Agent directory is limited on Android. Use Send to transfer by account search, or open agents from the web wallet when available.",
                        ),
                    },
                    {
                      label: "Bonus",
                      icon: "gift" as const,
                      solid: false as boolean,
                      onPress: () => setRedeemOpen(true),
                    },
                    {
                      label: "Receive",
                      icon: "arrow-down-circle" as const,
                      solid: false as boolean,
                      onPress: onCashout,
                    },
                    {
                      label: "History",
                      icon: "clock" as const,
                      solid: false as boolean,
                      onPress: () => router.push("/wallet-history"),
                    },
                    {
                      label: "FM Card",
                      icon: "credit-card" as const,
                      solid: false as boolean,
                      onPress: () => router.push("/wallet-card"),
                    },
                  ]
                ).map((a) => (
                  <Pressable
                    key={a.label}
                    style={[styles.actionOrb, a.solid && styles.actionOrbSolid]}
                    onPress={a.onPress}
                  >
                    <Feather
                      name={a.icon}
                      size={18}
                      color={a.solid ? "#fff" : colors.flexaGreen}
                    />
                    <Text
                      style={[styles.actionOrbText, a.solid && { color: "#fff" }]}
                      numberOfLines={1}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Available / Promo / Unlocked */}
              <View style={styles.triple}>
                <View style={styles.miniCard}>
                  <Text style={styles.miniLabel}>Available</Text>
                  <Text style={styles.miniValue}>{moneyUsd(balance?.availableUsd)}</Text>
                  <Text style={styles.miniSub}>Free to spend</Text>
                </View>
                <View style={styles.miniCard}>
                  <Text style={[styles.miniLabel, { color: "#7C3AED" }]}>Promo</Text>
                  <Text style={[styles.miniValue, { color: "#6D28D9" }]}>
                    {moneyUsd(balance?.promoBalance)}
                  </Text>
                  <Text style={styles.miniSub}>Locked · boosts</Text>
                </View>
                <View style={styles.miniCard}>
                  <Text style={[styles.miniLabel, { color: "#B45309" }]}>Unlocked</Text>
                  <Text style={[styles.miniValue, { color: "#B45309" }]}>
                    {moneyUsd(balance?.unlockedBalance)}
                  </Text>
                  <Text style={styles.miniSub}>Ready to convert</Text>
                </View>
              </View>

              {/* Recharge / Cash out panel */}
              <Pressable style={styles.panelGreen} onPress={onCashout}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelTitleWhite}>Recharge · Cash Out</Text>
                  <Text style={styles.panelSubWhite}>
                    Deposit blocked on Android · Cash out / agents where eligible
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#fff" />
              </Pressable>

              {isAgent ? (
                <Pressable
                  style={styles.panelLight}
                  onPress={() => router.push("/agents")}
                >
                  <Feather name="shield" size={18} color={colors.flexaGreen} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.panelTitle}>Panel Ajan Mwen</Text>
                    <Text style={styles.muted}>Rates, status, and agent profile</Text>
                  </View>
                  <View style={styles.badgeOk}>
                    <Text style={styles.badgeOkText}>OTORIZE</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.panelGold}
                  onPress={() => router.push("/agents")}
                >
                  <Feather name="star" size={18} color="#B45309" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.panelTitle}>Apply for Authorized Agent</Text>
                    <Text style={styles.muted}>Money exchange, higher transfers</Text>
                  </View>
                </Pressable>
              )}

              {isHaiti ? (
                <Pressable
                  style={styles.panelOrange}
                  onPress={() => router.push("/driver-apply")}
                >
                  <Feather name="truck" size={18} color="#fff" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.panelTitleWhite}>Apply as Driver</Text>
                    <Text style={styles.panelSubWhite}>FM Delivery — driver profile</Text>
                  </View>
                </Pressable>
              ) : null}

              {/* Referral */}
              <ReferralBlock
                referral={referral}
                onShare={async () => {
                  if (!referral?.referralCode) return;
                  await Share.share({
                    message: `Join Flexa Market with my code ${referral.referralCode}: https://flexamarket.com/auth/register?ref=${referral.referralCode}`,
                  });
                }}
              />

              {/* Recent transactions */}
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>TRANSACTION HISTORY</Text>
                <Pressable onPress={() => setTab("transactions")}>
                  <Text style={styles.link}>View all →</Text>
                </Pressable>
              </View>
              {previewTxs.length === 0 ? (
                <Text style={styles.muted}>No transactions for this filter.</Text>
              ) : (
                previewTxs.map((t) => (
                  <TxRow key={t.id} item={t} onPress={() => setSelected(t)} />
                ))
              )}

              <Text style={styles.policy}>
                Top-ups and withdrawals via in-app digital funding are not offered in this
                Android build. Use wallet balance for Haiti cart checkout where available.
              </Text>
            </>
          ) : null}

          {/* ══ PROMO ══════════════════════════════════════════════════════ */}
          {tab === "promo" ? (
            <>
              <ReferralBlock
                referral={referral}
                detailed
                onShare={async () => {
                  if (!referral?.referralCode) return;
                  await Share.share({
                    message: `Join Flexa Market with my code ${referral.referralCode}: https://flexamarket.com/auth/register?ref=${referral.referralCode}`,
                  });
                }}
              />
              <View style={styles.triple}>
                <View style={styles.miniCard}>
                  <Text style={styles.miniLabel}>Registered</Text>
                  <Text style={styles.miniValue}>{referral?.totalReferred ?? 0}</Text>
                </View>
                <View style={styles.miniCard}>
                  <Text style={[styles.miniLabel, { color: "#7C3AED" }]}>Locked</Text>
                  <Text style={[styles.miniValue, { color: "#6D28D9" }]}>
                    {moneyUsd(balance?.promoBalance)}
                  </Text>
                </View>
                <View style={styles.miniCard}>
                  <Text style={[styles.miniLabel, { color: "#B45309" }]}>Unlocked</Text>
                  <Text style={[styles.miniValue, { color: "#B45309" }]}>
                    {moneyUsd(balance?.unlockedBalance)}
                  </Text>
                </View>
              </View>
              {(balance?.newUnlockableUsd ?? 0) > 0 ? (
                <Pressable
                  style={styles.solidBtnWide}
                  disabled={busy === "unlock"}
                  onPress={() => void runUnlock()}
                >
                  <Text style={styles.solidBtnText}>
                    {busy === "unlock"
                      ? "Unlocking…"
                      : `Unlock ${moneyUsd(balance?.newUnlockableUsd)}`}
                  </Text>
                </Pressable>
              ) : null}
              {(balance?.unlockedBalance ?? 0) > 0 ? (
                <Pressable
                  style={styles.outlineBtnWide}
                  disabled={busy === "convert"}
                  onPress={() => void runConvert()}
                >
                  <Text style={styles.outlineBtnText}>
                    {busy === "convert"
                      ? "Converting…"
                      : `Convert ${moneyUsd(balance?.unlockedBalance)} to spendable`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {/* ══ TRANSACTIONS ═══════════════════════════════════════════════ */}
          {tab === "transactions" ? (
            <>
              <View style={styles.inOut}>
                <Text style={styles.inText}>In {moneyUsd(totalIn)}</Text>
                <Text style={styles.outText}>Out {moneyUsd(totalOut)}</Text>
              </View>
              <View style={styles.filterRow}>
                {(["all", "in", "out"] as FilterKey[]).map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.chip, filter === f && styles.chipOn]}
                    onPress={() => setFilter(f)}
                  >
                    <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>
                      {f === "all" ? "All" : f === "in" ? "In" : "Out"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => router.push("/wallet-history")}>
                <Text style={styles.link}>Open full paginated history →</Text>
              </Pressable>
              {(txs ?? []).length === 0 ? (
                <Text style={styles.muted}>No transactions for this filter.</Text>
              ) : (
                (txs ?? []).map((t) => (
                  <TxRow key={t.id} item={t} onPress={() => setSelected(t)} />
                ))
              )}
            </>
          ) : null}

          {showStatements && statements ? (
            <View style={styles.stmtBox}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>
                  MONTHLY {new Date().getFullYear()}
                </Text>
                <Pressable onPress={() => setShowStatements(false)}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              </View>
              {statements.filter((m) => m.totalRevenue > 0).length === 0 ? (
                <Text style={styles.muted}>No months with revenue.</Text>
              ) : (
                statements
                  .filter((m) => m.totalRevenue > 0)
                  .slice()
                  .reverse()
                  .map((m) => (
                    <Text key={m.month} style={styles.stmtRow}>
                      {m.month}: {moneyUsd(m.totalRevenue)} · orders {m.orderCount}
                    </Text>
                  ))
              )}
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* QR modal */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <Pressable style={styles.modalBg} onPress={() => setShowQR(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Wallet QR</Text>
            {qrUri ? (
              <Image source={{ uri: qrUri }} style={{ width: 200, height: 200 }} />
            ) : null}
            <Text style={styles.heroIdDark}>{balance?.accountNumber}</Text>
          </View>
        </Pressable>
      </Modal>

      {/* Redeem modal */}
      <Modal visible={redeemOpen} transparent animationType="slide" onRequestClose={() => setRedeemOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Redeem bonus card</Text>
            <TextInput
              style={styles.input}
              placeholder="Card code"
              autoCapitalize="characters"
              value={redeemCode}
              onChangeText={setRedeemCode}
            />
            <Pressable
              style={styles.solidBtnWide}
              disabled={busy === "redeem" || !redeemCode.trim()}
              onPress={() => void runRedeem()}
            >
              <Text style={styles.solidBtnText}>
                {busy === "redeem" ? "Redeeming…" : "Redeem"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setRedeemOpen(false)}>
              <Text style={[styles.link, { textAlign: "center", marginTop: 10 }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Tx detail */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBg} onPress={() => setSelected(null)}>
          {selected ? (
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{walletTxLabel(selected.type)}</Text>
              <Text style={styles.miniValue}>
                {selected.amountUsd >= 0 ? "+" : ""}
                {moneyUsd(selected.amountUsd)}
              </Text>
              <Text style={styles.muted}>Status: {selected.status || "—"}</Text>
              <Text style={styles.muted}>{formatWhen(selected.createdAt)}</Text>
              {selected.note ? <Text style={styles.muted}>{selected.note}</Text> : null}
              {selected.paymentRef ? (
                <Text style={styles.muted}>Ref: {selected.paymentRef}</Text>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

function TxRow({ item, onPress }: { item: WalletTx; onPress: () => void }) {
  const credit = item.amountUsd >= 0;
  return (
    <Pressable style={styles.txRow} onPress={onPress}>
      <View style={[styles.txIcon, { backgroundColor: credit ? "#EDE9FE" : "#FEE2E2" }]}>
        <Feather
          name={credit ? "arrow-down-left" : "arrow-up-right"}
          size={16}
          color={credit ? "#7C3AED" : "#DC2626"}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txTitle}>{walletTxLabel(item.type)}</Text>
        <Text style={styles.muted}>{formatWhen(item.createdAt)}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontWeight: "800", color: credit ? "#166534" : "#DC2626" }}>
          {credit ? "+" : ""}
          {moneyUsd(item.amountUsd)}
        </Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{item.status || "Completed"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ReferralBlock({
  referral,
  onShare,
  detailed,
}: {
  referral: WalletReferral | null;
  onShare: () => void;
  detailed?: boolean;
}) {
  return (
    <View style={styles.refCard}>
      <View style={styles.sectionHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="gift" size={16} color={colors.flexaGreen} />
          <Text style={styles.panelTitle}>Your Promo Code (Referral)</Text>
        </View>
      </View>
      <View style={styles.refCodeRow}>
        <Text style={styles.refCode}>{referral?.referralCode || "—"}</Text>
        <Pressable onPress={onShare} style={styles.iconBtn}>
          <Feather name="copy" size={16} color={colors.flexaGreen} />
        </Pressable>
        <Pressable onPress={onShare} style={styles.iconBtn}>
          <Feather name="share-2" size={16} color={colors.flexaGreen} />
        </Pressable>
      </View>
      {detailed ? (
        <Text style={styles.muted}>
          {referral?.totalReferred ?? 0} registered ·{" "}
          {moneyUsd(referral?.promoBalance)} locked ·{" "}
          {moneyUsd(referral?.unlockedBalance)} unlocked
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  iconBtn: { padding: 8 },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 17,
    color: "#0F172A",
  },
  tabs: {
    flexDirection: "row",
    gap: 6,
    padding: 10,
    backgroundColor: "#fff",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  tabOn: { backgroundColor: colors.flexaGreen },
  tabText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  tabTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  muted: { color: "#64748B", fontSize: 12 },
  errorBox: { backgroundColor: "#FEF2F2", padding: 12, borderRadius: 12 },
  errorText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "800", marginTop: 4 },
  hero: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#064E3B",
    overflow: "hidden",
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  heroLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  heroF: { color: "#fff", fontWeight: "900", fontStyle: "italic" },
  heroBrand: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
  heroId: { color: "rgba(167,243,208,0.8)", fontFamily: "monospace", fontSize: 11 },
  heroIdDark: { color: "#065F46", fontFamily: "monospace", fontWeight: "800", marginTop: 8 },
  heroIcons: { flexDirection: "row", gap: 6 },
  heroIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroLabel: { color: "rgba(167,243,208,0.9)", fontSize: 11, fontWeight: "700" },
  heroBal: { color: "#fff", fontWeight: "900", fontSize: 28, marginTop: 4 },
  heroLocal: { color: "rgba(255,255,255,0.85)", marginTop: 6, fontSize: 12 },
  heroActions: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bonusPill: {
    backgroundColor: "rgba(251,191,36,0.2)",
    borderColor: "rgba(251,191,36,0.4)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bonusText: { color: "#FEF3C7", fontSize: 10, fontWeight: "800" },
  heroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.45)",
  },
  heroBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  platformCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(16,185,129,0.35)",
    padding: 14,
    gap: 8,
  },
  platformTop: { flexDirection: "row", alignItems: "flex-start" },
  platformTitle: { fontWeight: "900", color: "#064E3B", letterSpacing: 0.4 },
  platformId: { fontFamily: "monospace", color: "#047857", fontSize: 11 },
  platformSub: { color: "#059669", fontSize: 11, fontWeight: "600" },
  platformBal: { fontSize: 26, fontWeight: "900", color: "#064E3B" },
  platformGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  platformMeta: { width: "47%", fontSize: 11, color: "#047857", fontWeight: "600" },
  platformActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  outlineBtnText: { color: "#065F46", fontWeight: "700", fontSize: 11 },
  outlineBtnWide: {
    borderWidth: 1,
    borderColor: colors.flexaGreen,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  solidBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#065F46",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  solidBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  solidBtnWide: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  actionsRow: { gap: 10, paddingVertical: 4 },
  actionOrb: {
    width: 64,
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(6,95,70,0.18)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 6,
  },
  actionOrbSolid: { backgroundColor: "#065F46", borderColor: "#047857" },
  actionOrbText: { fontSize: 9, fontWeight: "800", color: "#134E4A", textAlign: "center" },
  triple: { flexDirection: "row", gap: 8 },
  miniCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
  },
  miniLabel: { fontSize: 10, color: "#64748B", fontWeight: "700" },
  miniValue: { fontSize: 14, fontWeight: "900", color: "#0F172A", marginTop: 4 },
  miniSub: { fontSize: 10, color: "#94A3B8", marginTop: 2 },
  panelGreen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#065F46",
    borderRadius: 14,
    padding: 14,
  },
  panelLight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  panelGold: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  panelOrange: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EA580C",
    borderRadius: 14,
    padding: 14,
  },
  panelTitle: { fontWeight: "800", color: "#0F172A" },
  panelTitleWhite: { fontWeight: "800", color: "#fff" },
  panelSubWhite: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  badgeOk: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeOkText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  refCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 8,
  },
  refCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refCode: {
    flex: 1,
    fontFamily: "monospace",
    fontWeight: "800",
    color: colors.flexaGreen,
    fontSize: 16,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.6,
  },
  link: { color: colors.flexaGreen, fontWeight: "800", fontSize: 12 },
  policy: { color: "#94A3B8", fontSize: 11, lineHeight: 16 },
  inOut: { flexDirection: "row", justifyContent: "space-between" },
  inText: { color: "#166534", fontWeight: "800" },
  outText: { color: "#DC2626", fontWeight: "800" },
  filterRow: { flexDirection: "row", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  chipOn: { borderColor: colors.flexaOrange, backgroundColor: "#FFF7ED" },
  chipText: { fontWeight: "700", color: "#64748B", fontSize: 12 },
  chipTextOn: { color: colors.flexaOrange },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: { fontWeight: "700", color: "#0F172A" },
  statusPill: {
    marginTop: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: { color: "#166534", fontSize: 10, fontWeight: "800" },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  modalTitle: { fontWeight: "900", fontSize: 16, color: "#0F172A" },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  stmtBox: {
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  stmtRow: { fontSize: 12, color: "#065F46", fontWeight: "600" },
});
