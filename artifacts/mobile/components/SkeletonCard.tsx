import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

export function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.imageArea} />
      <View style={styles.info}>
        <View style={[styles.line, { width: "50%" }]} />
        <View style={[styles.line, { width: "80%" }]} />
        <View style={[styles.line, { width: "60%" }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, borderRadius: 14, borderWidth: 1, borderColor: "#1e293b", overflow: "hidden", marginBottom: 12, backgroundColor: "#0F172A" },
  imageArea: { width: "100%", height: CARD_WIDTH, backgroundColor: "#1e293b" },
  info: { padding: 10, gap: 8 },
  line: { height: 12, borderRadius: 6, backgroundColor: "#1e293b" },
});
