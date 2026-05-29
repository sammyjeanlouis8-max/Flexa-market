import { Stack } from "expo-router";
import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function RootLayout() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>FlexaMarket ✅</Text>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A" },
  text: { color: "#22C55E", fontSize: 14, textAlign: "center", paddingTop: 60 },
});
