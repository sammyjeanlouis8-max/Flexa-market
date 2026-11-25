import React from "react";
import { WholesaleSimplePage } from "@/components/wholesale/WholesaleSimplePage";

export default function Screen() {
  return (
    <WholesaleSimplePage
      title="How Wholesale works"
      subtitle="Angro sèlman — chat, pa gen bouton achte."

        items={[
          { title: "Chat only", meta: "No Buy Now, cart, or checkout on wholesale." },
          { title: "Country depots", meta: "Sellers stock a warehouse buyers can visit." },
          { title: "Negotiate", meta: "Agree price and pickup in Market chat." },
        ]}
      empty="Nothing here yet — chat-only wholesale."
    />
  );
}
