/** Shared demo fixtures for Wholesale UI (preview / empty-API fallbacks). */
export const WHOLESALE_CATEGORIES = [
  { slug: "food-grocery", name: "Food & Grocery", count: 48 },
  { slug: "beverages", name: "Beverages", count: 22 },
  { slug: "construction", name: "Construction", count: 31 },
  { slug: "packaging", name: "Packaging", count: 14 },
  { slug: "electronics", name: "Electronics", count: 19 },
  { slug: "household", name: "Household", count: 27 },
] as const;

export const WHOLESALE_WAREHOUSES = [
  { id: 1, name: "Flexa Delmas Depot", city: "Delmas", country: "Haiti", products: 12, seller: "Caribbean Bulk Co" },
  { id: 2, name: "Nord Wholesale Hub", city: "Cap-Haïtien", country: "Haiti", products: 8, seller: "Nord Supply" },
  { id: 3, name: "PV Cold Store", city: "Pétion-Ville", country: "Haiti", products: 6, seller: "Caribbean Bulk Co" },
  { id: 4, name: "Industrial Yard 3", city: "Carrefour", country: "Haiti", products: 15, seller: "BuildMart HT" },
  { id: 5, name: "MIA Forwarding", city: "Miami", country: "USA", products: 9, seller: "SunTech Wholesale" },
  { id: 6, name: "SDX Bulk Dock", city: "Santo Domingo", country: "Dominican Republic", products: 11, seller: "Island Pack" },
] as const;

export const WHOLESALE_INQUIRIES = [
  { id: 1, product: "Rice 50lb bags", buyer: "Hotel Karibe", qty: 40, status: "open", country: "Haiti", ago: "2h" },
  { id: 2, product: "Cooking oil cartons", buyer: "SuperMax Cap", qty: 25, status: "replied", country: "Haiti", ago: "5h" },
  { id: 3, product: "Cement bags", buyer: "Construct SA", qty: 200, status: "open", country: "Haiti", ago: "1d" },
  { id: 4, product: "Water pallets", buyer: "Event Pro", qty: 60, status: "closed", country: "Haiti", ago: "3d" },
] as const;

export const WHOLESALE_PLANS = [
  { id: "starter", name: "Starter", price: 0, perks: ["5 active listings", "1 warehouse", "Chat buyers"] },
  { id: "growth", name: "Growth", price: 29, perks: ["40 listings", "3 warehouses", "Priority chat", "Country badge"] },
  { id: "pro", name: "Pro Depot", price: 79, perks: ["Unlimited listings", "Unlimited depots", "Featured catalog", "Admin support"] },
] as const;
