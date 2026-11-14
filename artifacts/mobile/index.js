/**
 * Flexa Market native entry — Expo Router with project-local route context.
 * See AppEntry.tsx + shims/expo-router-ctx.js (pnpm monorepo route-key fix).
 */
import "react-native-gesture-handler";
import "@expo/metro-runtime";
import { App } from "./AppEntry";
import { renderRootComponent } from "expo-router/build/renderRootComponent";

renderRootComponent(App);
