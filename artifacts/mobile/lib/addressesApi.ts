/**
 * User address book — GET/POST/PATCH/DELETE /api/me/addresses
 * Field names match server serializeAddress / normalizeAddressInput.
 */
import { getApiBase } from "./api";

export type AddressKind = "delivery" | "ship_from";

export type UserAddress = {
  id: number;
  kind: AddressKind | string;
  label: string | null;
  fullName: string;
  phone: string;
  email?: string | null;
  street: string;
  apartment: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AddressInput = {
  kind?: AddressKind;
  label?: string | null;
  fullName: string;
  phone: string;
  email?: string | null;
  street: string;
  apartment?: string | null;
  city: string;
  region: string;
  postalCode?: string | null;
  country: string;
  isDefault?: boolean;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authedFetch(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function listAddresses(
  opts: AuthOpts,
  kind: AddressKind = "delivery",
): Promise<{ addresses: UserAddress[]; defaultAddress: UserAddress | null }> {
  const res = await authedFetch(`/me/addresses?kind=${encodeURIComponent(kind)}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Addresses failed (${res.status})`);
  return {
    addresses: Array.isArray(data.addresses) ? data.addresses : [],
    defaultAddress: data.defaultAddress ?? null,
  };
}

export async function createAddress(input: AddressInput, opts: AuthOpts): Promise<UserAddress> {
  const res = await authedFetch("/me/addresses", { ...opts, method: "POST", body: input });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Create address failed (${res.status})`);
  return (data.address ?? data) as UserAddress;
}

export async function updateAddress(
  id: number,
  input: Partial<AddressInput>,
  opts: AuthOpts,
): Promise<UserAddress> {
  const res = await authedFetch(`/me/addresses/${id}`, {
    ...opts,
    method: "PATCH",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Update address failed (${res.status})`);
  return (data.address ?? data) as UserAddress;
}

export async function deleteAddress(id: number, opts: AuthOpts): Promise<void> {
  const res = await authedFetch(`/me/addresses/${id}`, { ...opts, method: "DELETE" });
  if (res.status === 204 || res.ok) return;
  const data = await readJson(res);
  throw new Error(data.error || `Delete address failed (${res.status})`);
}

export async function setDefaultAddress(id: number, opts: AuthOpts): Promise<UserAddress> {
  const res = await authedFetch(`/me/addresses/${id}/default`, { ...opts, method: "POST" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Set default failed (${res.status})`);
  return (data.address ?? data) as UserAddress;
}

/** Client-side mirror of server normalizeAddressInput (HT/DO + common rules). */
export function validateAddressInput(input: Partial<AddressInput>): string | null {
  if (!input.fullName?.trim() || input.fullName.trim().length < 2) return "Full name is required";
  if (!input.phone?.trim() || input.phone.replace(/\D/g, "").length < 6) {
    return "Valid phone number is required";
  }
  if (!input.street?.trim() || input.street.trim().length < 3) return "Street address is required";
  if (!input.city?.trim() || input.city.trim().length < 2) return "City is required";
  if (!input.region?.trim() || input.region.trim().length < 2) return "State / region is required";
  if (!input.country?.trim() || input.country.trim().length < 2) return "Country is required";
  return null;
}
