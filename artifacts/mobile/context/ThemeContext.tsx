import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

const THEME_KEY = "fm_theme_override";

type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  isDark: boolean;
  themeMode: ThemeMode;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  themeMode: "system",
  toggleDark: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === "dark" || v === "light") setThemeMode(v);
    });
  }, []);

  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && systemScheme === "dark");

  const toggleDark = useCallback(async () => {
    const next: ThemeMode = isDark ? "light" : "dark";
    setThemeMode(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
