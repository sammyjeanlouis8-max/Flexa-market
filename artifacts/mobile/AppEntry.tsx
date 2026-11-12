/**
 * Native entry that wires Expo Router with a project-local require.context.
 * Avoids pnpm-hoisted expo-router/_ctx keys that break `/` matching.
 */
import React from "react";
import { ExpoRoot } from "expo-router";
import Head from "expo-router/head";
import "expo-router/build/fast-refresh";
import { ctx } from "./shims/expo-router-ctx";

export function App() {
  return (
    <Head.Provider>
      <ExpoRoot context={ctx} />
    </Head.Provider>
  );
}

export default App;
