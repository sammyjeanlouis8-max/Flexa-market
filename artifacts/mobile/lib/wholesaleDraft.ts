import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flexa_wholesale_product_draft_v1";

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
  warehouseName: string;
  warehouseCity: string;
  sku: string;
  offersLocalDelivery: boolean;
  offersWarehousePickup: boolean;
  /** Remote Wasabi URLs already uploaded */
  imageUrls: string[];
  updatedAt: string;
};

export async function loadWholesaleDraft(): Promise<WholesaleProductDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
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
}
