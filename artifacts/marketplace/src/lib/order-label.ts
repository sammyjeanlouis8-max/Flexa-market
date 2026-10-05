export type LabelAddress = {
  name: string | null; phone: string | null; street: string | null;
  city: string | null; region: string | null; zip?: string | null; country: string | null;
};
export type OrderLabelData = {
  orderId: number; orderRef: string; createdAt: string;
  listing: { id: number; title: string };
  merchant: { id: number; name: string; phone: string | null };
  shipTo: LabelAddress & { email: string | null };
  shipFrom?: LabelAddress;
  delivery?: { kind: "seller" | "flexa" | "company" | "bus" | "unassigned"; carrier: string | null; trackingNumber: string | null };
};
export function completeLabelAddress(address: LabelAddress): boolean {
  return [address.name, address.street, address.city, address.country]
    .every(value => typeof value === "string" && value.trim().length > 0);
}
export function labelAddressLine(address: LabelAddress): string {
  return [address.city, address.region, address.zip, address.country].filter(Boolean).join(", ");
}
