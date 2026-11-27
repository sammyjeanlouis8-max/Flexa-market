import { Stack } from "expo-router";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";

export default function RestaurantLayout() {
  return (
    <RestaurantGate>
      <Stack screenOptions={{ headerShown: false }} />
    </RestaurantGate>
  );
}
