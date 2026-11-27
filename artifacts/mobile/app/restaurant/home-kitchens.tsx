import { Redirect } from "expo-router";

export default function HomeKitchensListingRedirect() {
  return <Redirect href={"/restaurant/category/home_kitchen" as any} />;
}
