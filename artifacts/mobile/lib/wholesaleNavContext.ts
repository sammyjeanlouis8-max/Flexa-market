import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flexa_wholesale_nav_ctx_v1";
const CHAT_RETURN_KEY = "flexa_wholesale_chat_return_v1";

export type WholesaleNavContext = {
  path: string;
  productId?: number;
  q?: string;
  country?: string;
  category?: string;
  tab?: string;
  savedAt: number;
};

export async function saveWholesaleNavContext(
  partial: Omit<WholesaleNavContext, "savedAt"> & { savedAt?: number },
  opts?: { markChatReturn?: boolean },
): Promise<void> {
  const ctx: WholesaleNavContext = {
    ...partial,
    path: partial.path.startsWith("/") ? partial.path : `/${partial.path}`,
    savedAt: partial.savedAt ?? Date.now(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(ctx));
  if (opts?.markChatReturn) {
    await AsyncStorage.setItem(CHAT_RETURN_KEY, ctx.path);
  }
}

export async function readWholesaleNavContext(): Promise<WholesaleNavContext | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WholesaleNavContext;
  } catch {
    return null;
  }
}

export async function peekWholesaleChatReturn(): Promise<string | null> {
  try {
    const path = await AsyncStorage.getItem(CHAT_RETURN_KEY);
    if (path && (path === "/wholesale" || path.startsWith("/wholesale/"))) return path;
    return null;
  } catch {
    return null;
  }
}

export async function consumeWholesaleChatReturn(): Promise<string | null> {
  const path = await peekWholesaleChatReturn();
  try {
    await AsyncStorage.removeItem(CHAT_RETURN_KEY);
  } catch {
    /* ignore */
  }
  return path;
}
