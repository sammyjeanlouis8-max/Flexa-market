import { registerRootComponent } from "expo";
import App from "./App";

// Plain React Native entry — no expo-router, no file-based routing.
// This is intentional: the app is a single-screen WebView shell.
registerRootComponent(App);
