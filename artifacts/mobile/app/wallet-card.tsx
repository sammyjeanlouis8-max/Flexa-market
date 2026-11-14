/**
 * FM Card (Virtual Card) — display-only destination matching web `my_card` / VirtualCardPanel.
 * Shows personal wallet account number + QR. Separate from Flex Card debt repay.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchWalletBalance, moneyUsd, type WalletBalance } from "@/lib/walletApi";

export default function WalletCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setBalance(await fetchWalletBalance({ token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load card");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const account = balance?.accountNumber || "FM-······";
  const qrUri = balance?.accountNumber
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(balance.accountNumber)}`
    : null;

  const shareId = async () => {
    await Share.share({
      message: `Flexa Market Wallet ID: ${account}\nhttps://flexamarket.com/wallet`,
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>FM Card</Text>
        <Pressable onPress={() => void load()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="refresh-cw" size={18} color={colors.flexaGreen} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <Pressable style={styles.card} onPress={() => setFlipped((v) => !v)}>
            {!flipped ? (
              <>
                <View style={styles.cardTop}>
                  <View style={styles.logo}>
                    <Text style={styles.logoF}>F</Text>
                  </View>
                  <Text style={styles.cardBrand}>FLEXA MARKET</Text>
                </View>
                <Text style={styles.cardLabel}>Personal wallet card</Text>
                <Text style={styles.cardName}>{user?.name || "Member"}</Text>
                <Text style={styles.cardNumber}>{account}</Text>
                <View style={styles.cardBottom}>
                  <Text style={styles.cardBal}>{moneyUsd(balance?.balanceUsd)}</Text>
                  <Text style={styles.tapHint}>Tap to show QR</Text>
                </View>
              </>
            ) : (
              <View style={styles.qrFace}>
                <Text style={styles.qrTitle}>Scan to receive</Text>
                {qrUri ? (
                  <Image source={{ uri: qrUri }} style={styles.qr} />
                ) : (
                  <Text style={styles.error}>No account number yet</Text>
                )}
                <Text style={styles.cardNumberDark}>{account}</Text>
                <Text style={styles.tapHintDark}>Tap to flip back</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={() => void shareId()}>
              <Feather name="copy" size={16} color={colors.flexaGreen} />
              <Text style={styles.actionText}>Copy / Share ID</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={() => router.push("/flex-card-repay")}
            >
              <Feather name="credit-card" size={16} color={colors.flexaGreen} />
              <Text style={styles.actionText}>Flex Card debt</Text>
            </Pressable>
          </View>

          <Text style={styles.note}>
            This is your personal FM wallet card (account {account}). It is separate from the
            official FM-FLEXA-MARKET platform account and from Flex Card debt repayment.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  iconBtn: { padding: 8 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 17,
    color: colors.light.text,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  body: { padding: 16, gap: 14 },
  card: {
    borderRadius: 20,
    padding: 20,
    minHeight: 200,
    backgroundColor: "#064E3B",
    overflow: "hidden",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  logoF: { color: "#fff", fontWeight: "900", fontStyle: "italic", fontSize: 16 },
  cardBrand: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  cardLabel: { color: "rgba(167,243,208,0.85)", fontSize: 12 },
  cardName: { color: "#fff", fontWeight: "700", fontSize: 16, marginTop: 4 },
  cardNumber: {
    color: "#FCD34D",
    fontFamily: "monospace",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
    letterSpacing: 1,
  },
  cardBottom: {
    marginTop: "auto" as any,
    paddingTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  cardBal: { color: "#fff", fontWeight: "900", fontSize: 22 },
  tapHint: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  qrFace: { alignItems: "center", gap: 10, paddingVertical: 8 },
  qrTitle: { color: "#A7F3D0", fontWeight: "700" },
  qr: { width: 160, height: 160, backgroundColor: "#fff", borderRadius: 12 },
  cardNumberDark: { color: "#FCD34D", fontWeight: "800", fontFamily: "monospace" },
  tapHintDark: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(6,95,70,0.2)",
    paddingVertical: 12,
  },
  actionText: { color: colors.flexaGreen, fontWeight: "800", fontSize: 13 },
  note: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  error: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "800" },
});
