/** Mobile REST client for Flexa Restaurant — mirrors marketplace restaurantApi. */

export type Restaurant = {
  id: number;
  name: string;
  city: string;
  country: string;
  description: string;
  cuisineTags: string[];
  status: string;
  identityStatus: string;
  isOpenNow?: boolean;
};

function headers(token?: string | null): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchRestaurants(
  params: { q?: string; country?: string; openNow?: boolean; status?: string },
  opts: { token?: string | null },
): Promise<Restaurant[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.country) qs.set("country", params.country);
  if (params.openNow) qs.set("openNow", "1");
  if (params.status) qs.set("status", params.status);
  const res = await fetch(`/api/restaurants?${qs.toString()}`, { headers: headers(opts.token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load restaurants");
  return data.restaurants ?? [];
}

export async function fetchRestaurant(id: number, opts: { token?: string | null }): Promise<Restaurant> {
  const res = await fetch(`/api/restaurants/${id}`, { headers: headers(opts.token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Not found");
  return data.restaurant;
}