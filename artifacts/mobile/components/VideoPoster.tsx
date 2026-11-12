/**
 * Shared video preview poster for home Promo cards and feed tiles.
 * Order: thumbnailUrl → productPhotoUrl → light placeholder with play icon.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { absoluteMediaUrl } from "@/lib/mediaUrl";

type Props = {
  thumbnailUrl?: string | null;
  productPhotoUrl?: string | null;
  style?: StyleProp<ViewStyle>;
  playIconSize?: number;
  testID?: string;
};

export function VideoPoster({
  thumbnailUrl,
  productPhotoUrl,
  style,
  playIconSize = 22,
  testID,
}: Props) {
  const candidates = [
    absoluteMediaUrl(thumbnailUrl),
    absoluteMediaUrl(productPhotoUrl),
  ].filter((u, i, arr): u is string => !!u && arr.indexOf(u) === i);

  const [index, setIndex] = useState(0);
  const uri = candidates[index] ?? null;

  useEffect(() => {
    setIndex(0);
  }, [thumbnailUrl, productPhotoUrl]);

  return (
    <View style={[styles.root, style]} testID={testID}>
      <View style={styles.placeholder} accessibilityElementsHidden>
        <View style={styles.playCircle}>
          <Feather name="play" size={playIconSize} color="#0F172A" />
        </View>
      </View>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          onError={() => setIndex((i) => i + 1)}
          testID={testID ? `${testID}-image` : undefined}
        />
      ) : null}
      {uri ? (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={[styles.playCircle, styles.playCircleOnMedia]}>
            <Feather name="play" size={playIconSize} color="#fff" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    backgroundColor: "#E8EEF5",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8EEF5",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.12)",
    paddingLeft: 2,
  },
  playCircleOnMedia: {
    backgroundColor: "rgba(15,23,42,0.45)",
    borderColor: "rgba(255,255,255,0.55)",
  },
});
