/**
 * Stable, non-sensitive install device id for push token lifecycle.
 * Uses a random UUID in AsyncStorage — not hardware or advertising identifiers.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "flexa_push_device_id_v1";
const LAST_TOKEN_KEY = "flexa_push_last_expo_token_v1";

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `fm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getOrCreatePushDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {
    /* fall through */
  }
  const id = newId();
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* still return ephemeral id for this session */
  }
  return id;
}

export async function getStoredExpoPushToken(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(LAST_TOKEN_KEY)) || null;
  } catch {
    return null;
  }
}

export async function storeExpoPushToken(token: string | null): Promise<void> {
  try {
    if (!token) await AsyncStorage.removeItem(LAST_TOKEN_KEY);
    else await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
