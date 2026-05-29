import { Slot } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Also capture errors after this module loads
const g = globalThis as any;
g.__fm_errors = g.__fm_errors ?? [];
g.__earlyErrors = g.__earlyErrors ?? [];

if (typeof ErrorUtils !== "undefined") {
  const _prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((err: Error, isFatal?: boolean) => {
    g.__fm_errors.push(
      `[${isFatal ? "FATAL" : "warn"}] ${err?.message}\n${err?.stack ?? ""}`
    );
    _prev?.(err, isFatal);
  });
}

class ErrBoundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(e: Error) {
    return { err: e };
  }
  render() {
    if (this.state.err) {
      const e = this.state.err;
      return (
        <ScrollView style={{ flex: 1, backgroundColor: "#1a0000", padding: 16 }}>
          <Text style={{ color: "#f55", fontSize: 14, fontWeight: "bold", marginTop: 60 }}>
            RENDER ERROR:
          </Text>
          <Text style={{ color: "#ff0", fontSize: 12, marginTop: 8 }}>{e.message}</Text>
          <Text style={{ color: "#aaa", fontSize: 9, marginTop: 8 }}>{e.stack}</Text>
        </ScrollView>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

function ErrOverlay() {
  const [all, setAll] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const early: string[] = (globalThis as any).__earlyErrors ?? [];
      const late: string[] = (globalThis as any).__fm_errors ?? [];
      const merged = [...early, ...late];
      if (merged.length !== all.length) setAll([...merged]);
    }, 400);
    return () => clearInterval(id);
  });
  if (!all.length) return null;
  return (
    <ScrollView
      style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "#1a0000", zIndex: 9999, padding: 16,
      }}
    >
      <Text style={{ color: "#f55", fontSize: 14, fontWeight: "bold", marginTop: 60 }}>
        JS ERROR ({all.length}):
      </Text>
      {all.map((e, i) => (
        <Text key={i} style={{ color: "#ff0", fontSize: 10, marginTop: 8 }}>{e}</Text>
      ))}
    </ScrollView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ErrBoundary>
        <View style={{ flex: 1 }}>
          <Slot />
          <ErrOverlay />
        </View>
      </ErrBoundary>
    </SafeAreaProvider>
  );
}
