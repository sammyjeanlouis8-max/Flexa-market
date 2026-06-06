import React, { useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

let WebView: any = null;
try {
  WebView = require("react-native-webview").default;
} catch (_) {}

function IOSSettingsScreen() {
  const insets = useSafeAreaInsets();

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () =>
            Linking.openURL("https://flexamarket.com/settings/delete-account"),
        },
      ]
    );
  }

  return (
    <View style={[styles.iosContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.iosHeader}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL("https://flexamarket.com/settings")}
        >
          <Text style={styles.rowText}>Account Settings</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL("https://flexamarket.com/edit-profile")}
        >
          <Text style={styles.rowText}>Edit Profile</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL("https://flexamarket.com/settings/password")}
        >
          <Text style={styles.rowText}>Change Password</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PRIVACY & DATA</Text>
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL("https://flexamarket.com/privacy")}
        >
          <Text style={styles.rowText}>Privacy Policy</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL("https://flexamarket.com/terms")}
        >
          <Text style={styles.rowText}>Terms of Service</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() =>
            Linking.openURL("https://flexamarket.com/settings/data-export")
          }
        >
          <Text style={styles.rowText}>Download My Data</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SUPPORT</Text>
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL("https://flexamarket.com/help")}
        >
          <Text style={styles.rowText}>Help Center</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL("mailto:support@flexamarket.com")}
        >
          <Text style={styles.rowText}>Contact Support</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: "#EF4444" }]}>DANGER ZONE</Text>
        <Pressable style={[styles.row, styles.deleteRow]} onPress={confirmDeleteAccount}>
          <Text style={styles.deleteText}>Delete My Account</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>Flexa Market · Version 1.0.0</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  if (Platform.OS === "ios") {
    return <IOSSettingsScreen />;
  }

  if (!WebView) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        source={{ uri: "https://flexamarket.com/settings" }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        contentInsetAdjustmentBehavior="automatic"
        userAgent="FlexaMarket/1.0 (Mobile App)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  iosContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 0,
  },
  iosHeader: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  section: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  rowText: { fontSize: 16, color: "#1E293B" },
  rowChevron: { fontSize: 20, color: "#CBD5E1" },
  deleteRow: { borderTopWidth: 0 },
  deleteText: { fontSize: 16, color: "#EF4444", fontWeight: "600" },
  version: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 8,
  },
});
