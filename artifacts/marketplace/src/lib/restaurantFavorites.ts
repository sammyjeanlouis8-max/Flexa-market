const KEY = "flexa_restaurant_favorites_v1";

function read(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

function write(ids: number[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* quota */
  }
}

export function getFavoriteRestaurantIds(): number[] {
  return read();
}

export function isRestaurantFavorite(id: number): boolean {
  return read().includes(id);
}

export function toggleRestaurantFavorite(id: number): number[] {
  const cur = read();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  write(next);
  return next;
}
