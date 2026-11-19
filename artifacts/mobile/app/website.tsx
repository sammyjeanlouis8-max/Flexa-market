import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";

/** Store-safe: open public website in system browser — not an in-app WebView shell. */
export default function WebsiteScreen() {
  return (
    <View style={styles.root}>
      <AppHeader title="Flexa Market Web" showBrand={false} showBack showMenu={false} />
      <View style={styles.body}>
        <Text style={styles.copy}>
          The native app is the primary experience. Open the public website in your browser if you
          need a desktop page.
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() => void WebBrowser.openBrowserAsync("https://flexamarket.com")}
        >
          <Text style={styles.btnText}>Open flexamarket.com</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { padding: 20, gap: 16 },
  copy: { fontSize: 15, lineHeight: 22, color: "#475569" },
  btn: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#FFFFFF", fontWeight: "800" },
});
