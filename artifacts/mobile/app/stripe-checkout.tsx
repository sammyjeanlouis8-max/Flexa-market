import { NativePlaceholder } from "@/components/NativePlaceholder";
import React from "react";

export default function Screen() {
  return (
    <NativePlaceholder
      title='Checkout'
      detail='Physical-goods checkout remains Stripe/MonCash via native flow; digital goods stay blocked on Android.'
    />
  );
}
