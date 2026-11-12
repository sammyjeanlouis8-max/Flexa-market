/**
 * Native Flexa calculator — marketplace fee helpers + basic arithmetic.
 * Commission 7% / transfer fee 5% match server defaults. No fake balances.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  APPROX_USD_TO_HTG,
  estimateDeliveryUsd,
  evalBasicExpression,
  htgToUsd,
  sellerNetFromPrice,
  transferFeeFromAmount,
  usdToHtg,
  type DeliveryVehicle,
} from "@/lib/marketplaceCalc";

type Mode = "marketplace" | "basic";

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("marketplace");
  const [price, setPrice] = useState("100");
  const [transferAmt, setTransferAmt] = useState("50");
  const [distance, setDistance] = useState("10");
  const [sameCommune, setSameCommune] = useState(true);
  const [vehicle, setVehicle] = useState<DeliveryVehicle>("moto");
  const [fxUsd, setFxUsd] = useState("1");
  const [expr, setExpr] = useState("");
  const [exprResult, setExprResult] = useState<string>("");

  const commission = useMemo(() => sellerNetFromPrice(Number(price)), [price]);
  const transfer = useMemo(() => transferFeeFromAmount(Number(transferAmt)), [transferAmt]);
  const delivery = useMemo(
    () =>
      estimateDeliveryUsd({
        sameCommune,
        vehicle,
        distanceKm: Number(distance),
      }),
    [sameCommune, vehicle, distance],
  );

  const runExpr = () => {
    try {
      setExprResult(String(evalBasicExpression(expr)));
    } catch (e) {
      setExprResult(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabs}>
        {(["marketplace", "basic"] as Mode[]).map((m) => (
          <Pressable key={m} style={[styles.tab, mode === m && styles.tabOn]} onPress={() => setMode(m)}>
            <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {mode === "marketplace" ? (
          <>
            <Text style={styles.note}>
              Estimates use Flexa Market rules: platform commission 7%, transfer fee 5% (server default).
              Delivery figures are approximate — live checkout quotes may differ.
            </Text>

            <Text style={styles.label}>Sale price (USD)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            <View style={styles.card}>
              <Text style={styles.row}>Commission (7%): ${commission.commissionUsd.toFixed(2)}</Text>
              <Text style={styles.rowStrong}>Seller net (93%): ${commission.sellerNetUsd.toFixed(2)}</Text>
            </View>

            <Text style={styles.label}>Wallet transfer amount (USD)</Text>
            <TextInput style={styles.input} value={transferAmt} onChangeText={setTransferAmt} keyboardType="decimal-pad" />
            <View style={styles.card}>
              <Text style={styles.row}>Fee (5% ceil): ${transfer.feeUsd.toFixed(2)}</Text>
              <Text style={styles.rowStrong}>Net to recipient: ${transfer.netUsd.toFixed(2)}</Text>
            </View>

            <Text style={styles.label}>Delivery estimate</Text>
            <View style={styles.wrap}>
              <Pressable style={[styles.chip, sameCommune && styles.chipOn]} onPress={() => setSameCommune(true)}>
                <Text style={[styles.chipText, sameCommune && styles.chipTextOn]}>Same commune</Text>
              </Pressable>
              <Pressable style={[styles.chip, !sameCommune && styles.chipOn]} onPress={() => setSameCommune(false)}>
                <Text style={[styles.chipText, !sameCommune && styles.chipTextOn]}>Cross-city</Text>
              </Pressable>
            </View>
            <View style={styles.wrap}>
              {(["moto", "compact", "suv"] as DeliveryVehicle[]).map((v) => (
                <Pressable key={v} style={[styles.chip, vehicle === v && styles.chipOn]} onPress={() => setVehicle(v)}>
                  <Text style={[styles.chipText, vehicle === v && styles.chipTextOn]}>{v}</Text>
                </Pressable>
              ))}
            </View>
            {!sameCommune ? (
              <>
                <Text style={styles.label}>Distance (km)</Text>
                <TextInput style={styles.input} value={distance} onChangeText={setDistance} keyboardType="decimal-pad" />
              </>
            ) : null}
            <View style={styles.card}>
              <Text style={styles.rowStrong}>Est. delivery: ${delivery.toFixed(2)}</Text>
            </View>

            <Text style={styles.label}>FX (approx {APPROX_USD_TO_HTG} HTG = $1)</Text>
            <TextInput style={styles.input} value={fxUsd} onChangeText={setFxUsd} keyboardType="decimal-pad" />
            <View style={styles.card}>
              <Text style={styles.row}>${Number(fxUsd || 0).toFixed(2)} → {usdToHtg(Number(fxUsd)).toFixed(2)} HTG</Text>
              <Text style={styles.row}>{Number(fxUsd || 0).toFixed(2)} HTG → ${htgToUsd(Number(fxUsd)).toFixed(2)}</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.note}>Basic arithmetic only (+ − × ÷ % parentheses). No network calls.</Text>
            <TextInput
              style={styles.input}
              value={expr}
              onChangeText={setExpr}
              placeholder="e.g. (12+3)*2"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
            />
            <Pressable style={styles.btn} onPress={runExpr}>
              <Text style={styles.btnText}>Calculate</Text>
            </Pressable>
            {exprResult ? <Text style={styles.result}>{exprResult}</Text> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 16, marginTop: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#E2E8F0" },
  tabOn: { backgroundColor: "#FFF7ED" },
  tabText: { fontWeight: "700", fontSize: 12, color: "#475569", textTransform: "capitalize" },
  tabTextOn: { color: "#EA580C" },
  note: { color: "#64748B", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  label: { fontWeight: "700", color: "#0F172A", marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, color: "#0F172A",
  },
  card: {
    marginTop: 8, backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", gap: 4,
  },
  row: { color: "#64748B", fontSize: 13 },
  rowStrong: { color: "#0F172A", fontWeight: "800", fontSize: 15 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#E2E8F0" },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { fontWeight: "700", fontSize: 12, color: "#475569" },
  chipTextOn: { color: "#EA580C" },
  btn: { marginTop: 12, backgroundColor: "#F97316", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
  result: { marginTop: 16, fontSize: 28, fontWeight: "800", color: "#0F172A" },
});
