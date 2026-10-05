import { createContext, type Dispatch, type SetStateAction } from "react";

// Undefined uses the account country; null represents an admin's all-country view.
export const DeliveryMenuCountryContext = createContext<Dispatch<SetStateAction<string | null | undefined>>>(() => {});

export function canShowFMDeliveryLinks(country: string | null | undefined): boolean {
  return country === "Haiti";
}
