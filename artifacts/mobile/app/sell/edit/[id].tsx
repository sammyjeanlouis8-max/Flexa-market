import { SellForm } from "@/components/SellForm";
import { useLocalSearchParams } from "expo-router";
import React from "react";

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Number(id);
  return <SellForm mode="edit" listingId={Number.isFinite(listingId) ? listingId : undefined} />;
}
