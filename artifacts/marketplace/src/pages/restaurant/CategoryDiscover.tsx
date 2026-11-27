import RestaurantDiscover from "@/pages/restaurant/Discover";

/** Dedicated listing hubs for the three primary Flexa Restaurant categories. */
export function RestaurantCategoryPage() {
  return <RestaurantDiscover initialType="traditional" />;
}

export function FoodTruckCategoryPage() {
  return <RestaurantDiscover initialType="food_truck" />;
}

export function HomeKitchenCategoryPage() {
  return <RestaurantDiscover initialType="home_kitchen" />;
}

export default RestaurantCategoryPage;
