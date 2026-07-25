// Single source of truth for countries used in phone number selection.
// Each country has a unique ISO-2 code so that USA, Canada, and Dominican
// Republic are never confused despite sharing the +1 dial code.

export interface PhoneCountry {
  iso:      string;
  dialCode: string;
  flag:     string;
  name:     string;
  example:  string;
}

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: "HT", dialCode: "+509", flag: "🇭🇹", name: "Haiti",              example: "36 12 3456"    },
  { iso: "US", dialCode: "+1",   flag: "🇺🇸", name: "United States",      example: "212 555 0100"  },
  { iso: "CA", dialCode: "+1",   flag: "🇨🇦", name: "Canada",             example: "416 555 0100"  },
  { iso: "DO", dialCode: "+1",   flag: "🇩🇴", name: "Dominican Republic", example: "809 555 0100"  },
  { iso: "MX", dialCode: "+52",  flag: "🇲🇽", name: "Mexico",             example: "55 1234 5678"  },
  { iso: "BR", dialCode: "+55",  flag: "🇧🇷", name: "Brazil",             example: "11 91234 5678" },
  { iso: "CL", dialCode: "+56",  flag: "🇨🇱", name: "Chile",              example: "9 1234 5678"   },
  { iso: "FR", dialCode: "+33",  flag: "🇫🇷", name: "France",             example: "1 23 45 67 89" },
  { iso: "GB", dialCode: "+44",  flag: "🇬🇧", name: "United Kingdom",     example: "20 1234 5678"  },
  { iso: "ES", dialCode: "+34",  flag: "🇪🇸", name: "Spain",              example: "91 234 5678"   },
  { iso: "DE", dialCode: "+49",  flag: "🇩🇪", name: "Germany",            example: "30 1234 5678"  },
  { iso: "NG", dialCode: "+234", flag: "🇳🇬", name: "Nigeria",            example: "801 234 5678"  },
  { iso: "ZA", dialCode: "+27",  flag: "🇿🇦", name: "South Africa",       example: "21 123 4567"   },
  { iso: "IN", dialCode: "+91",  flag: "🇮🇳", name: "India",              example: "98765 43210"   },
  { iso: "PH", dialCode: "+63",  flag: "🇵🇭", name: "Philippines",        example: "917 123 4567"  },
  { iso: "AU", dialCode: "+61",  flag: "🇦🇺", name: "Australia",          example: "2 1234 5678"   },
  { iso: "JM", dialCode: "+1",   flag: "🇯🇲", name: "Jamaica",            example: "876 555 0100"  },
] as const;

export function getPhoneCountry(iso: string): PhoneCountry | undefined {
  return PHONE_COUNTRIES.find((c) => c.iso === iso);
}

// Maps ISO → canonical country name used in the platform (SUPPORTED_COUNTRIES).
// Only countries that exist in SUPPORTED_COUNTRIES are mapped here; others
// leave the country field empty when auto-syncing.
export const ISO_TO_COUNTRY: Record<string, string> = {
  HT: "Haiti",
  US: "USA",
  CA: "Canada",
  DO: "Dominican Republic",
  MX: "Mexico",
  BR: "Brazil",
  CL: "Chile",
  GB: "United Kingdom",
  DE: "Germany",
  NG: "Nigeria",
  ZA: "South Africa",
  IN: "India",
  PH: "Philippines",
  AU: "Australia",
  JM: "Jamaica",
};

// Maps canonical country name → ISO so the country dropdown auto-selects the
// right calling code when the user picks their country first.
export const COUNTRY_TO_ISO: Record<string, string> = {
  "Haiti":              "HT",
  "USA":                "US",
  "Canada":             "CA",
  "Dominican Republic": "DO",
  "Mexico":             "MX",
  "Brazil":             "BR",
  "Chile":              "CL",
  "United Kingdom":     "GB",
  "Germany":            "DE",
  "Nigeria":            "NG",
  "South Africa":       "ZA",
  "India":              "IN",
  "Philippines":        "PH",
  "Australia":          "AU",
  "Jamaica":            "JM",
};
