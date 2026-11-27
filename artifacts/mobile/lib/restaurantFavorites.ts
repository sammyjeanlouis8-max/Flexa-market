import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flexa_restaurant_favorites_v1";

export async function getFavoriteIds(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function toggleFavorite(id: number): Promise<number[]> {
  const ids = await getFavoriteIds();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function isFavorite(id: number): Promise<boolean> {
  const ids = await getFavoriteIds();
  return ids.includes(id);
}
