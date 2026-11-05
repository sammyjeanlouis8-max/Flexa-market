/** Flexa Market brand tokens for Haiti driver surfaces (matches Layout header green). */
export const DRIVER_BRAND = {
  primary: "hsl(152,65%,18%)",
  soft: "hsl(152,40%,94%)",
  softBorder: "hsl(152,30%,85%)",
  success: "hsl(152,55%,36%)",
  danger: "hsl(0,72%,48%)",
} as const;

export function formatHtg(amount: number | null | undefined): string {
  const n = Math.round(Number(amount) || 0);
  return `${n.toLocaleString()} HTG`;
}
