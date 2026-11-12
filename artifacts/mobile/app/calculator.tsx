/**
 * Native marketplace calculator — local math only (no website).
 * Optional CalcAI (/api/calculator/ask) can be added later.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BUTTONS = [
  ["C", "⌫", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "=", ""],
] as const;

function evaluate(expr: string): string {
  const normalized = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/%/g, "/100");
  if (!/^[\d+\-*/().\s]+$/.test(normalized)) throw new Error("Invalid");
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${normalized})`)();
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid");
  return String(Number(value.toPrecision(12)));
}

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");

  const press = (key: string) => {
    if (!key) return;
    if (key === "C") {
      setDisplay("0");
      setExpr("");
      return;
    }
    if (key === "⌫") {
      if (expr.length <= 1) {
        setExpr("");
        setDisplay("0");
      } else {
        const next = expr.slice(0, -1);
        setExpr(next);
        setDisplay(next);
      }
      return;
    }
    if (key === "=") {
      try {
        const result = evaluate(expr || display);
        setDisplay(result);
        setExpr(result);
      } catch {
        setDisplay("Error");
        setExpr("");
      }
      return;
    }
    const next = expr === "0" && /\d/.test(key) ? key : `${expr}${key}`;
    setExpr(next);
    setDisplay(next);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.displayBox}>
        <Text style={styles.display} numberOfLines={2}>
          {display}
        </Text>
      </View>

      <View style={styles.pad}>
        {BUTTONS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key, ki) =>
              key ? (
                <Pressable
                  key={`${ri}-${ki}`}
                  style={[
                    styles.key,
                    /[÷×−+]/.test(key) && styles.keyOp,
                    key === "=" && styles.keyEq,
                  ]}
                  onPress={() => press(key)}
                >
                  <Text
                    style={[
                      styles.keyText,
                      (/[÷×−+]/.test(key) || key === "=") && styles.keyTextLight,
                    ]}
                  >
                    {key}
                  </Text>
                </Pressable>
              ) : (
                <View key={`${ri}-${ki}`} style={styles.keySpacer} />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  displayBox: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 20,
    minHeight: 110,
    justifyContent: "flex-end",
    marginBottom: 16,
  },
  display: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "700",
    textAlign: "right",
  },
  pad: { gap: 10, flex: 1, justifyContent: "flex-end" },
  row: { flexDirection: "row", gap: 10 },
  key: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  keySpacer: { flex: 1 },
  keyOp: { backgroundColor: "#1E293B", borderColor: "#1E293B" },
  keyEq: { backgroundColor: "#F97316", borderColor: "#F97316" },
  keyText: { fontSize: 22, fontWeight: "700", color: "#0F172A" },
  keyTextLight: { color: "#fff" },
});
