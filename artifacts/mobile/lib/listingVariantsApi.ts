/**
 * Multi-SKU listing variants — GET/PUT /api/listings/:id/variants
 * When schemaReady=false, callers must keep using listing.itemSize.
 */
import { getApiBase } from "./api";

export type ListingVariant = {
  id?: number;
  listingId?: number;
  sku: string | null;
  size: string | null;
  color: string | null;
  price: number | null;
  stockQuantity: number;
  images: string[];
  isActive?: boolean;
};

export type VariantsResponse = {
  schemaReady: boolean;
  variants: ListingVariant[];
  code?: string;
  error?: string;
};

type AuthOpts = { token?: string | null; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchListingVariants(
  listingId: number | string,
  opts: AuthOpts = {},
): Promise<VariantsResponse> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${getApiBase()}/listings/${listingId}/variants`, {
    headers,
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok && res.status !== 503) {
    throw new Error(data.error || `Variants failed (${res.status})`);
  }
  return {
    schemaReady: data.schemaReady === true,
    variants: Array.isArray(data.variants) ? data.variants : [],
    code: data.code,
    error: data.error,
  };
}

export async function replaceListingVariants(
  listingId: number | string,
  variants: ListingVariant[],
  opts: { token: string; signal?: AbortSignal },
): Promise<VariantsResponse> {
  const res = await fetch(`${getApiBase()}/listings/${listingId}/variants`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ variants }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) {
    return {
      schemaReady: data.schemaReady === true,
      variants: [],
      code: data.code,
      error: data.error || `Save failed (${res.status})`,
    };
  }
  return {
    schemaReady: true,
    variants: Array.isArray(data.variants) ? data.variants : [],
  };
}
