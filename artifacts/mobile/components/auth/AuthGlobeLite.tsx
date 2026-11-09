/**
 * Lightweight rotating globe fallback for low-end Android devices.
 * Same flag atlas, circular mask, soft sphere shading, continuous 12s loop.
 * Uses translateX (native driver) — no WebGL / rotateY quirks on old Android.
 */
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  AppState,
  type AppStateStatus,
  Easing,
  Image,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

const REVOLUTION_MS = 12_000;

type Props = {
  size?: number;
  style?: ViewStyle;
  active?: boolean;
};

export default function AuthGlobeLite({
  size = 128,
  style,
  active = true,
}: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const appActiveRef = useRef(true);

  useEffect(() => {
    const start = () => {
      animRef.current?.stop();
      spin.setValue(0);
      animRef.current = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: REVOLUTION_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      animRef.current.start();
    };

    const stop = () => {
      animRef.current?.stop();
      animRef.current = null;
    };

    const sync = () => {
      if (active && appActiveRef.current) start();
      else stop();
    };

    sync();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      appActiveRef.current = state === "active";
      sync();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [active, spin]);

  // Two atlas copies side-by-side so the loop scrolls seamlessly.
  const atlasWidth = size * 2.4;
  const translateX = spin.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -atlasWidth],
  });

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          styles.strip,
          {
            width: atlasWidth * 2,
            height: size,
            transform: [{ translateX }],
          },
        ]}
      >
        <Image
          source={require("../../assets/images/auth-globe-flags.jpg")}
          style={{ width: atlasWidth, height: size }}
          resizeMode="cover"
        />
        <Image
          source={require("../../assets/images/auth-globe-flags.jpg")}
          style={{ width: atlasWidth, height: size }}
          resizeMode="cover"
        />
      </Animated.View>

      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(255,255,255,0.2)",
          "rgba(0,0,0,0)",
          "rgba(0,0,0,0.32)",
        ]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.18, y: 0.12 }}
        end={{ x: 0.88, y: 0.92 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Side falloff to sell curvature */}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(7,20,40,0.55)", "transparent", "rgba(7,20,40,0.55)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.rim} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: "#1a3358",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  strip: {
    flexDirection: "row",
    position: "absolute",
    left: 0,
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
});
