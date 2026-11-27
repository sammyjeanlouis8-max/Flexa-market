import { Redirect } from "expo-router";

export default function RestaurantsListingRedirect() {
  return <Redirect href={"/restaurant/category/traditional" as any} />;
}
