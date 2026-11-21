/**
 * Temu-style embedded page — loads a Flexa website path inside SafeWebView
 * (in-app WebView with native back chrome). Does not open the system browser.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import SafeWebView from "@/components/SafeWebView";
import {
  getTemuHybridPage,
  temuHybridUrl,
} from "@/lib/temuHybridPages";

export default function TemuEmbeddedPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const key = Array.isArray(slug) ? slug[0] : slug;
  const page = key ? getTemuHybridPage(key) : undefined;

  useEffect(() => {
    if (key && !page) {
      router.replace("/(tabs)/profile");
    }
  }, [key, page, router]);

  if (!page) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Page not available</Text>
      </View>
    );
  }

  return <SafeWebView uri={temuHybridUrl(page.webPath)} showBack />;
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
  },
  fallbackText: {
    color: "#94A3B8",
    fontSize: 15,
  },
});
