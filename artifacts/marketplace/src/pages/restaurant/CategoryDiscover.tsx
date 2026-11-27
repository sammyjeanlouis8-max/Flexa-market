import RestaurantDiscover from "@/pages/restaurant/Discover";

/** Dedicated listing hubs for Flexa Restaurant categories. */
export function RestaurantCategoryPage() {
  return <RestaurantDiscover initialType="traditional" />;
}

export function FoodTruckCategoryPage() {
  return <RestaurantDiscover initialType="food_truck" />;
}

export function HomeKitchenCategoryPage() {
  return <RestaurantDiscover initialType="home_kitchen" />;
}

export function BakeryCategoryPage() {
  return <RestaurantDiscover initialType="bakery" />;
}

export function CateringCategoryPage() {
  return <RestaurantDiscover initialType="catering" />;
}

export default RestaurantCategoryPage;
