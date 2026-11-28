import { Stack } from "expo-router";
import { BeautyGate } from "@/components/beauty/BeautyGate";

export default function BeautyLayout() {
  return (
    <BeautyGate>
      <Stack screenOptions={{ headerShown: false }} />
    </BeautyGate>
  );
}
