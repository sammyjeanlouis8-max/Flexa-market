export type PhoneCountry = {
  iso: string;
  dialCode: string;
  flag: string;
  name: string;
  example: string;
};

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: "HT", dialCode: "+509", flag: "🇭🇹", name: "Haiti", example: "36 12 3456" },
  { iso: "US", dialCode: "+1", flag: "🇺🇸", name: "United States", example: "212 555 0100" },
  { iso: "CA", dialCode: "+1", flag: "🇨🇦", name: "Canada", example: "416 555 0100" },
  { iso: "DO", dialCode: "+1", flag: "🇩🇴", name: "Dominican Republic", example: "809 555 0100" },
  { iso: "MX", dialCode: "+52", flag: "🇲🇽", name: "Mexico", example: "55 1234 5678" },
  { iso: "BR", dialCode: "+55", flag: "🇧🇷", name: "Brazil", example: "11 91234 5678" },
  { iso: "GB", dialCode: "+44", flag: "🇬🇧", name: "United Kingdom", example: "20 1234 5678" },
  { iso: "JM", dialCode: "+1", flag: "🇯🇲", name: "Jamaica", example: "876 555 0100" },
] as const;

export function getPhoneCountry(iso: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((c) => c.iso === iso);
}

export const ISO_TO_COUNTRY: Record<string, string> = {
  HT: "Haiti",
  US: "USA",
  CA: "Canada",
  DO: "Dominican Republic",
  MX: "Mexico",
  BR: "Brazil",
  GB: "United Kingdom",
  JM: "Jamaica",
};
