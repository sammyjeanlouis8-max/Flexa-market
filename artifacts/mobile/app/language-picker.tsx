import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { useLanguage, type Lang } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

const OPTIONS: { code: Lang; label: string }[] = [
  { code: "en", label: "English (default)" },
  { code: "ht", label: "Kreyòl ayisyen" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "de", label: "Deutsch" },
  { code: "hi", label: "हिन्दी" },
  { code: "fil", label: "Filipino" },
  { code: "ha", label: "Hausa" },
  { code: "zu", label: "isiZulu" },
  { code: "af", label: "Afrikaans" },
];

export default function LanguagePickerScreen() {
  const colors = useColors();
  const { lang, setLang } = useLanguage();

  return (
    <NativeScreen
      title="Language"
      subtitle="English is the primary app language. Other available locales stay selectable."
    >
      <View style={{ gap: 8 }}>
        {OPTIONS.map((opt) => {
          const active = lang === opt.code;
          return (
            <Pressable
              key={opt.code}
              onPress={() => setLang(opt.code)}
              style={[
                styles.row,
                {
                  borderColor: colors.border,
                  backgroundColor: active ? colors.primary : "transparent",
                },
              ]}
            >
              <Text
                style={{
                  color: active ? "#0F172A" : colors.foreground,
                  fontWeight: "600",
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
});
