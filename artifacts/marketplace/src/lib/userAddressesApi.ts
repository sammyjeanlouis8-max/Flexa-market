export type SavedUserAddress = {
  id: number;
  kind: "delivery" | "ship_from" | string;
  label: string;
  fullName: string;
  phone: string;
  email: string | null;
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

export type AddressPayload = {
  kind?: "delivery" | "ship_from";
  label?: string;
  fullName: string;
  phone: string;
  email?: string;
  street: string;
  apartment?: string;
  city: string;
  region: string;
  postalCode?: string;
  country: string;
  isDefault?: boolean;
};

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export async function fetchUserAddresses(
  token: string,
  kind: "delivery" | "ship_from" = "delivery",
): Promise<{ addresses: SavedUserAddress[]; defaultAddress: SavedUserAddress | null }> {
  const res = await fetch(`/api/me/addresses?kind=${encodeURIComponent(kind)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to load addresses");
  return {
    addresses: Array.isArray(data.addresses) ? data.addresses : [],
    defaultAddress: data.defaultAddress ?? null,
  };
}

export async function createUserAddress(token: string, body: AddressPayload): Promise<SavedUserAddress> {
  const res = await fetch("/api/me/addresses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to save address");
  return data.address;
}

export async function updateUserAddress(
  token: string,
  id: number,
  body: Partial<AddressPayload>,
): Promise<SavedUserAddress> {
  const res = await fetch(`/api/me/addresses/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to update address");
  return data.address;
}

export async function setDefaultUserAddress(token: string, id: number): Promise<SavedUserAddress> {
  const res = await fetch(`/api/me/addresses/${id}/default`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || "Failed to set default");
  return data.address;
}

export async function deleteUserAddress(token: string, id: number): Promise<void> {
  const res = await fetch(`/api/me/addresses/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await parseJson(res);
    throw new Error(data.error || "Failed to delete address");
  }
}

/** Persist a valid checkout address to the server (and keep localStorage as cache). */
export async function persistCheckoutAddress(
  token: string | null | undefined,
  userId: number | string | null | undefined,
  address: {
    name: string;
    phone: string;
    email?: string;
    street: string;
    apartment?: string;
    city: string;
    region: string;
    zip?: string;
    country: string;
  },
  opts?: { existingId?: number | null },
): Promise<SavedUserAddress | null> {
  if (!token) return null;
  const payload: AddressPayload = {
    kind: "delivery",
    label: "Home",
    fullName: address.name,
    phone: address.phone,
    email: address.email,
    street: address.street,
    apartment: address.apartment,
    city: address.city,
    region: address.region,
    postalCode: address.zip,
    country: address.country,
    isDefault: true,
  };
  try {
    if (opts?.existingId) {
      return await updateUserAddress(token, opts.existingId, payload);
    }
    // If a default already exists, update it instead of spawning duplicates on every checkout.
    const { defaultAddress } = await fetchUserAddresses(token, "delivery");
    if (defaultAddress) {
      return await updateUserAddress(token, defaultAddress.id, payload);
    }
    return await createUserAddress(token, payload);
  } catch {
    return null;
  }
}
