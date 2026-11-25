import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flexa_wholesale_product_draft_v2";
const RECENT_KEY = "flexa_wholesale_recent_v1";

export type WholesaleTierDraft = {
  minQuantity: string;
  maxQuantity: string;
  unitPrice: string;
};

export type WholesaleProductDraft = {
  title: string;
  description: string;
  unitPrice: string;
  currency: string;
  minOrderQty: string;
  stockQuantity: string;
  wholesaleUnitType: string;
  category: string;
  country: string;
  city: string;
  warehouseId: number | null;
  warehouseName: string;
  warehouseCity: string;
  sku: string;
  offersLocalDelivery: boolean;
  offersWarehousePickup: boolean;
  tiers: WholesaleTierDraft[];
  /** Remote Wasabi URLs already uploaded */
  imageUrls: string[];
  updatedAt: string;
};

export async function loadWholesaleDraft(): Promise<WholesaleProductDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      // Migrate v1 if present
      const v1 = await AsyncStorage.getItem("flexa_wholesale_product_draft_v1");
      if (!v1) return null;
      const old = JSON.parse(v1);
      return {
        ...old,
        warehouseId: old.warehouseId ?? null,
        tiers: old.tiers ?? [],
      };
    }
    return JSON.parse(raw) as WholesaleProductDraft;
  } catch {
    return null;
  }
}

export async function saveWholesaleDraft(draft: WholesaleProductDraft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
}

export async function clearWholesaleDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  await AsyncStorage.removeItem("flexa_wholesale_product_draft_v1");
}

export async function pushRecentProduct(id: number): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const list: number[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...list.filter((x) => x !== id)].slice(0, 40);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export async function loadRecentProductIds(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}
