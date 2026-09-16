export type SavedCheckoutAddress = {
  name: string;
  phone: string;
  email?: string;
  street: string;
  city: string;
  region: string;
  zip?: string;
};

const keyFor = (userId: number | string) => `flexamarket_saved_checkout_address_${userId}`;

export function readSavedCheckoutAddress(userId: number | string | null | undefined): Partial<SavedCheckoutAddress> {
  if (userId == null) return {};
  try {
    return JSON.parse(localStorage.getItem(keyFor(userId)) ?? "{}");
  } catch {
    return {};
  }
}

export function saveCheckoutAddress(
  userId: number | string | null | undefined,
  address: SavedCheckoutAddress,
) {
  if (userId == null) return;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(address));
  } catch {}
}