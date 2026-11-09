/**
 * Native auth shell matching marketplace AuthShell:
 * navy brand panel (wordmark + worldwide headline + rotating globe)
 * over a white form card with soft top overlap on phones.
 */
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { useFonts } from "expo-font";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, type ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { prefetchFlagAtlas } from "../../lib/globeAssetCache";
import AuthGlobe from "./AuthGlobe";

export const AUTH = {
  fg: "#0f1b33",
  muted: "#6b7280",
  border: "#e5e7eb",
  accent: "#f97316",
  accentHover: "#ea6c0f",
  white: "#ffffff",
  navyTop: "#071428",
  navyMid: "#0c1c38",
  navyBot: "#081225",
} as const;

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  brandTitle?: string;
  brandSubtitle?: string;
  globeActive?: boolean;
};

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
  brandTitle = "Buy & sell with confidence worldwide.",
  brandSubtitle = "One secure account for shoppers, sellers, drivers, and admins.",
  globeActive = true,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isWide = width >= 900;
  const globeSize = isWide ? 220 : width < 360 ? 92 : width < 400 ? 124 : 140;

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  // Warm the flag atlas while the form paints — globe mounts deferred.
  useEffect(() => {
    prefetchFlagAtlas();
  }, []);

  const titleFont = fontsLoaded ? "SpaceGrotesk_700Bold" : undefined;
  const bodyFont = fontsLoaded ? "DMSans_400Regular" : undefined;
  const bodyMedium = fontsLoaded ? "DMSans_500Medium" : undefined;
  const bodyBold = fontsLoaded ? "DMSans_700Bold" : undefined;

  return (
    <View style={[styles.root, { minHeight: height }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.grid, isWide && styles.gridWide]}>
            <LinearGradient
              colors={[AUTH.navyTop, AUTH.navyMid, AUTH.navyBot]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={[
                styles.brandPanel,
                {
                  paddingTop: Math.max(insets.top, 12) + 8,
                  paddingBottom: isWide ? 48 : 36,
                },
                isWide && styles.brandPanelWide,
              ]}
            >
              {/* Subtle starfield dots — matches web atmosphere without glow */}
              <View pointerEvents="none" style={styles.stars}>
                {[
                  [12, 28],
                  [28, 62],
                  [48, 18],
                  [66, 54],
                  [78, 34],
                  [18, 78],
                ].map(([x, y], i) => (
                  <View
                    key={i}
                    style={[
                      styles.star,
                      {
                        left: `${x}%` as any,
                        top: `${y}%` as any,
                        opacity: 0.12 - i * 0.01,
                      },
                    ]}
                  />
                ))}
              </View>

              <View style={styles.brandTopRow}>
                <View style={styles.logoRow}>
                  <Image
                    source={require("../../assets/images/flexa-logo-v2.png")}
                    style={styles.logo}
                    accessibilityLabel="Flexa Market"
                  />
                  <Text style={[styles.wordmark, titleFont ? { fontFamily: titleFont } : null]}>
                    Flexa Market
                  </Text>
                </View>
              </View>

              <View style={[styles.brandBody, isWide && styles.brandBodyWide]}>
                <View style={styles.brandCopy}>
                  <Text
                    style={[
                      styles.brandTitle,
                      titleFont ? { fontFamily: titleFont } : null,
                      width < 360 && { fontSize: 22 },
                    ]}
                  >
                    {brandTitle}
                  </Text>
                  <Text
                    style={[
                      styles.brandSubtitle,
                      bodyFont ? { fontFamily: bodyFont } : null,
                    ]}
                  >
                    {brandSubtitle}
                  </Text>
                </View>
                <AuthGlobe size={globeSize} active={globeActive} deferMount />
              </View>
            </LinearGradient>

            <View
              style={[
                styles.formPanel,
                !isWide && styles.formOverlap,
                {
                  paddingBottom: Math.max(insets.bottom, 16) + 12,
                },
                isWide && styles.formPanelWide,
              ]}
            >
              <View style={styles.formInner}>
                <Text
                  style={[
                    styles.formTitle,
                    titleFont ? { fontFamily: titleFont } : null,
                  ]}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text
                    style={[
                      styles.formSubtitle,
                      bodyFont ? { fontFamily: bodyFont } : null,
                    ]}
                  >
                    {subtitle}
                  </Text>
                ) : null}

                <View style={styles.formSurface}>{children}</View>

                {footer ? (
                  <View style={styles.footer}>
                    {typeof footer === "string" ? (
                      <Text
                        style={[
                          styles.footerText,
                          bodyFont ? { fontFamily: bodyFont } : null,
                        ]}
                      >
                        {footer}
                      </Text>
                    ) : (
                      footer
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Expose font family helpers via context-free statics for child screens */}
      <View style={styles.fontProbe} accessibilityElementsHidden>
        <Text style={{ fontFamily: bodyMedium }} />
        <Text style={{ fontFamily: bodyBold }} />
      </View>
    </View>
  );
}

type AuthPrimaryButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
};

export function AuthPrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  testID,
}: AuthPrimaryButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cta,
        (disabled || loading) && styles.ctaDisabled,
        pressed && !disabled && !loading && styles.ctaPressed,
      ]}
    >
      <Text style={styles.ctaText}>{loading ? "…" : title}</Text>
    </Pressable>
  );
}

export function AuthLink({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      onPress={onPress}
      hitSlop={8}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AUTH.white,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  grid: {
    flexGrow: 1,
  },
  gridWide: {
    flexDirection: "row",
    minHeight: "100%",
  },
  brandPanel: {
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  brandPanelWide: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 48,
  },
  stars: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: "absolute",
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(125, 211, 252, 1)",
  },
  brandTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  wordmark: {
    color: AUTH.white,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  brandBody: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  brandBodyWide: {
    marginTop: 56,
    alignItems: "center",
    gap: 20,
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 4,
  },
  brandTitle: {
    color: AUTH.white,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  brandSubtitle: {
    marginTop: 10,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280,
  },
  formPanel: {
    backgroundColor: AUTH.white,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  formOverlap: {
    marginTop: -22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#071428",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 8,
  },
  formPanelWide: {
    flex: 1,
    justifyContent: "center",
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: 40,
    elevation: 0,
    shadowOpacity: 0,
  },
  formInner: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  formTitle: {
    color: AUTH.fg,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  formSubtitle: {
    marginTop: 6,
    color: AUTH.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  formSurface: {
    marginTop: 20,
    gap: 14,
  },
  footer: {
    marginTop: 20,
    alignItems: "center",
    gap: 10,
  },
  footerText: {
    color: AUTH.muted,
    fontSize: 14,
    textAlign: "center",
  },
  cta: {
    height: 52,
    borderRadius: 999,
    backgroundColor: AUTH.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: AUTH.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  ctaPressed: {
    backgroundColor: AUTH.accentHover,
    transform: [{ scale: 0.985 }],
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: AUTH.white,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  link: {
    color: AUTH.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  fontProbe: {
    width: 0,
    height: 0,
    opacity: 0,
    position: "absolute",
  },
});
