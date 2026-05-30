import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LANGUAGES, useLanguage, type Lang } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

export default function LanguagePickerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang, setLang, t } = useLanguage();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  async function handleSelect(code: Lang) {
    if (code === lang) {
      router.back();
      return;
    }
    Haptics.selectionAsync();
    await setLang(code);
    router.back();
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t("languagesTitle")}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {t("selectLanguage")}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.list,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {LANGUAGES.map((item, idx) => {
            const isSelected = item.code === lang;
            return (
              <Pressable
                key={item.code}
                onPress={() => handleSelect(item.code as Lang)}
                style={({ pressed }) => [
                  styles.row,
                  idx < LANGUAGES.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                  isSelected && { backgroundColor: colors.primary + "12" },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.flag}>{item.flag}</Text>

                <View style={styles.labelWrap}>
                  <Text
                    style={[
                      styles.langName,
                      {
                        color: isSelected ? colors.primary : colors.foreground,
                        fontFamily: isSelected
                          ? "Inter_700Bold"
                          : "Inter_500Medium",
                      },
                    ]}
                  >
                    {item.native}
                  </Text>
                  {item.native !== item.label && (
                    <Text
                      style={[
                        styles.langSub,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {item.label}
                    </Text>
                  )}
                </View>

                {isSelected ? (
                  <View
                    style={[
                      styles.checkCircle,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Feather name="check" size={13} color="#fff" />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.checkCircleEmpty,
                      { borderColor: colors.border },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  list: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 14,
  },
  flag: { fontSize: 26 },
  labelWrap: { flex: 1 },
  langName: { fontSize: 15 },
  langSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
