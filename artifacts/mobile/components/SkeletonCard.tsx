import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

const CARD_WIDTH = (Dimensions.get("window").width - 12 * 3) / 2;

export function SkeletonCard() {
  const colors = useColors();
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
    <Animated.View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity }]}>
      <View style={[styles.imageArea, { backgroundColor: colors.muted }]} />
      <View style={styles.info}>
        <View style={[styles.line, { backgroundColor: colors.muted, width: "50%" }]} />
        <View style={[styles.line, { backgroundColor: colors.muted, width: "80%" }]} />
        <View style={[styles.line, { backgroundColor: colors.muted, width: "60%" }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  imageArea: {
    width: "100%",
    height: CARD_WIDTH,
  },
  info: {
    padding: 10,
    gap: 8,
  },
  line: {
    height: 12,
    borderRadius: 6,
  },
});
