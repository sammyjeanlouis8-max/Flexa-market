import { Redirect } from "expo-router";

export default function FoodTrucksListingRedirect() {
  return <Redirect href={"/restaurant/category/food_truck" as any} />;
}
