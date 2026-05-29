export const COUNTRIES = [
  { name: "Haiti",                      code: "HT", dialCode: "509", flag: "🇭🇹" },
  { name: "USA",                        code: "US", dialCode: "1",   flag: "🇺🇸" },
  { name: "Dominican Republic",         code: "DO", dialCode: "1",   flag: "🇩🇴" },
  { name: "Dominican Republic (+1809)", code: "DO", dialCode: "1",   flag: "🇩🇴" },
  { name: "Dominican Republic (+1829)", code: "DO", dialCode: "1",   flag: "🇩🇴" },
  { name: "Dominican Republic (+1849)", code: "DO", dialCode: "1",   flag: "🇩🇴" },
  { name: "Canada",                     code: "CA", dialCode: "1",   flag: "🇨🇦" },
  { name: "Mexico",                     code: "MX", dialCode: "52",  flag: "🇲🇽" },
  { name: "Brazil",                     code: "BR", dialCode: "55",  flag: "🇧🇷" },
  { name: "Chile",                      code: "CL", dialCode: "56",  flag: "🇨🇱" },
] as const;

export type CountryName = (typeof COUNTRIES)[number]["name"];

const COUNTRY_NAMES = COUNTRIES.map((c) => c.name);

export function isValidCountry(name: string): name is CountryName {
  return COUNTRY_NAMES.includes(name as CountryName);
}

const DR_AREA_CODES = new Set([809, 829, 849]);

const CA_AREA_CODES = new Set([
  204, 226, 236, 249, 250, 289, 306, 343, 365, 403, 416, 418, 431, 437, 438,
  450, 506, 514, 519, 548, 579, 581, 587, 604, 613, 639, 647, 672, 705, 709,
  778, 780, 782, 807, 819, 825, 867, 873, 902, 905,
]);

export function validatePhoneForCountry(phone: string, country: CountryName): boolean {
  const digits = phone.replace(/\D/g, "");

  switch (country) {
    case "Haiti": {
      if (digits.startsWith("509")) return digits.length === 11;
      return digits.length === 8;
    }
    case "Dominican Republic":
    case "Dominican Republic (+1809)":
    case "Dominican Republic (+1829)":
    case "Dominican Republic (+1849)": {
      let d = digits;
      if (d.startsWith("1")) d = d.slice(1);
      if (d.length !== 10) return false;
      const area = parseInt(d.slice(0, 3), 10);
      return DR_AREA_CODES.has(area);
    }
    case "Canada": {
      let d = digits;
      if (d.startsWith("1")) d = d.slice(1);
      if (d.length !== 10) return false;
      const area = parseInt(d.slice(0, 3), 10);
      return CA_AREA_CODES.has(area) && !DR_AREA_CODES.has(area);
    }
    case "USA": {
      let d = digits;
      if (d.startsWith("1")) d = d.slice(1);
      if (d.length !== 10) return false;
      const area = parseInt(d.slice(0, 3), 10);
      return !DR_AREA_CODES.has(area) && !CA_AREA_CODES.has(area);
    }
    case "Mexico": {
      let d = digits;
      if (d.startsWith("52")) d = d.slice(2);
      return d.length === 10;
    }
    case "Brazil": {
      let d = digits;
      if (d.startsWith("55")) d = d.slice(2);
      return d.length === 10 || d.length === 11;
    }
    case "Chile": {
      let d = digits;
      if (d.startsWith("56")) d = d.slice(2);
      return d.length === 8 || d.length === 9;
    }
  }
}

export function normalizePhone(phone: string, country: CountryName): string {
  const digits = phone.replace(/\D/g, "");
  const info = COUNTRIES.find((c) => c.name === country)!;
  if (digits.startsWith(info.dialCode)) return "+" + digits;
  return "+" + info.dialCode + digits;
}
