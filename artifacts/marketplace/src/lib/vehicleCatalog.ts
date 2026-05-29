export type VehicleBodyStyle = "sedan" | "suv" | "pickup" | "truck" | "moto" | "scooter";

export const BODY_STYLE_LABELS: Record<VehicleBodyStyle, string> = {
  sedan:   "Sedan / Berline",
  suv:     "SUV / 4×4",
  pickup:  "Pickup / Camionèt",
  truck:   "Kamyon",
  moto:    "Moto",
  scooter: "Scooter / Livrezon",
};

export const BODY_STYLE_ICONS: Record<VehicleBodyStyle, string> = {
  sedan:   "🚗",
  suv:     "🚙",
  pickup:  "🛻",
  truck:   "🚛",
  moto:    "🏍️",
  scooter: "🛵",
};

export const BODY_STYLES_BY_TYPE: Record<string, VehicleBodyStyle[]> = {
  car:  ["sedan", "suv", "pickup", "truck"],
  moto: ["moto", "scooter"],
  both: ["sedan", "suv", "pickup", "moto", "scooter"],
};

export const BRANDS_BY_STYLE: Record<VehicleBodyStyle, string[]> = {
  sedan:   ["Toyota", "Honda", "Hyundai", "Kia", "Nissan", "Mitsubishi", "Mazda", "Chevrolet", "Ford", "Renault", "Peugeot", "Volkswagen", "BMW", "Mercedes-Benz", "Suzuki"],
  suv:     ["Toyota", "Honda", "Hyundai", "Kia", "Nissan", "Mitsubishi", "Jeep", "Ford", "Chevrolet", "BMW", "Mercedes-Benz", "Land Rover", "Isuzu", "Renault", "Peugeot"],
  pickup:  ["Toyota", "Nissan", "Mitsubishi", "Ford", "Chevrolet", "Isuzu", "Mazda", "RAM"],
  truck:   ["Isuzu", "Toyota", "Mercedes-Benz", "Hino", "Mitsubishi", "MAN", "Volvo"],
  moto:    ["Honda", "Yamaha", "Suzuki", "Kawasaki", "KTM", "Bajaj", "TVS", "Hero", "Royal Enfield", "Ducati", "Harley-Davidson"],
  scooter: ["Honda", "Yamaha", "Suzuki", "TVS", "Bajaj", "Hero", "Piaggio"],
};

export const MODELS_BY_BRAND: Record<string, Partial<Record<VehicleBodyStyle, string[]>>> = {
  Toyota: {
    sedan:   ["Corolla", "Camry", "Yaris", "Vios", "Avalon", "Echo", "Tercel", "Prius"],
    suv:     ["RAV4", "Fortuner", "Land Cruiser Prado", "Land Cruiser 200", "Highlander", "4Runner", "Rush", "C-HR"],
    pickup:  ["Hilux", "Tundra", "Tacoma"],
    truck:   ["Dyna", "Land Cruiser 70 Wagon"],
  },
  Honda: {
    sedan:   ["Civic", "Accord", "Fit", "City", "Jazz", "HR-V (sedan)"],
    suv:     ["CR-V", "HR-V", "Pilot", "Passport", "Odyssey"],
    moto:    ["CG 125", "CB 125F", "XR 150", "XR 190", "Wave 110", "Biz 125", "CB 300R", "CB 500F", "CB 500X"],
    scooter: ["PCX 125", "Click 125", "Dio", "Activa 6G"],
  },
  Hyundai: {
    sedan:   ["Elantra", "Accent", "Sonata", "i10", "i20", "Verna"],
    suv:     ["Tucson", "Santa Fe", "Kona", "Creta", "ix35", "Venue"],
  },
  Kia: {
    sedan:   ["Rio", "Cerato", "Forte", "Picanto", "Stinger"],
    suv:     ["Sportage", "Sorento", "Seltos", "Telluride", "Carnival"],
  },
  Nissan: {
    sedan:   ["Almera", "Sentra", "Versa", "Tiida", "Altima"],
    suv:     ["X-Trail", "Pathfinder", "Murano", "Juke", "Rogue", "Kicks", "Terra"],
    pickup:  ["Frontier", "Navara", "Titan", "NP300"],
  },
  Mitsubishi: {
    sedan:   ["Lancer", "Mirage", "Galant", "Colt"],
    suv:     ["Outlander", "Eclipse Cross", "Montero Sport", "Pajero", "ASX", "Xpander"],
    pickup:  ["L200", "Triton"],
    truck:   ["Canter"],
  },
  Mazda: {
    sedan:   ["Mazda 2", "Mazda 3", "Mazda 6", "Mazda CX-3"],
    suv:     ["CX-5", "CX-9", "CX-30"],
    pickup:  ["BT-50"],
  },
  Chevrolet: {
    sedan:   ["Aveo", "Sonic", "Cruze", "Cobalt", "Spark", "Cavalier"],
    suv:     ["Equinox", "Traverse", "Suburban", "Trailblazer", "Captiva", "Blazer"],
    pickup:  ["Colorado", "Silverado", "S10"],
  },
  Ford: {
    sedan:   ["Fiesta", "Focus", "Fusion", "Mustang"],
    suv:     ["Escape", "Explorer", "Expedition", "EcoSport", "Bronco", "Edge"],
    pickup:  ["Ranger", "F-150", "F-250", "Maverick"],
  },
  Yamaha: {
    moto:    ["DT 100", "DT 125R", "YBR 125", "FZ 150", "FZS V3", "MT-15", "R15 V4", "Ténéré 700"],
    scooter: ["N-Max 155", "X-MAX 300", "Aerox 155", "Lexi", "Tricity"],
  },
  Suzuki: {
    sedan:   ["Swift", "Baleno", "Ciaz", "Ertiga"],
    suv:     ["Vitara", "Grand Vitara", "Jimny"],
    moto:    ["GN 125", "EN 125", "GS 150", "Gixxer 150", "GSX-R 150", "GSX-S 150"],
    scooter: ["Burgman 200", "Address"],
  },
  Kawasaki: {
    moto:    ["Barako 175", "Rouser 135", "Pulsar 150", "Ninja 250", "Ninja 400", "Z400", "Versys"],
  },
  Bajaj: {
    moto:    ["Boxer 100", "Discover 125", "Pulsar 150", "Pulsar 220F", "CT100", "Platina"],
    scooter: ["Chetak"],
  },
  TVS: {
    moto:    ["Apache RTR 150", "Apache RTR 160 4V", "Star City Plus", "HLX 150", "Radeon"],
    scooter: ["Jupiter 125", "Ntorq 125", "Wigo"],
  },
  Hero: {
    moto:    ["Splendor Plus", "Passion Pro", "Glamour", "HF Deluxe", "Xtreme 160R", "Xpulse 200"],
    scooter: ["Pleasure+", "Destini 125", "Xoom 110"],
  },
  KTM: {
    moto:    ["125 Duke", "200 Duke", "390 Duke", "RC 125", "RC 200", "390 Adventure"],
  },
  Isuzu: {
    suv:     ["MU-X"],
    pickup:  ["D-Max"],
    truck:   ["NPR 75H", "NQR 75H", "FRR 90H"],
  },
  Jeep: {
    suv:     ["Wrangler", "Cherokee", "Grand Cherokee", "Compass", "Renegade", "Gladiator"],
  },
  BMW: {
    sedan:   ["116i", "316i", "330i", "520i", "730i", "M3"],
    suv:     ["X1", "X3", "X5", "X7"],
  },
  "Mercedes-Benz": {
    sedan:   ["A180", "C200", "E220", "S500", "CLA 200"],
    suv:     ["GLA 200", "GLC 300", "GLE 350", "GLS 450"],
    truck:   ["Actros", "Atego", "Axor"],
  },
  "Land Rover": {
    suv:     ["Defender 90", "Defender 110", "Discovery 4", "Discovery Sport", "Range Rover Evoque", "Range Rover Sport", "Range Rover Vogue"],
  },
  RAM: {
    pickup:  ["1500 Classic", "1500 TRX", "2500 Power Wagon", "ProMaster"],
  },
  Renault: {
    sedan:   ["Logan", "Sandero", "Symbol", "Kwid"],
    suv:     ["Duster", "Captur", "Kadjar"],
  },
  Peugeot: {
    sedan:   ["206+", "207", "208", "301", "308"],
    suv:     ["2008", "3008", "5008"],
  },
  Volkswagen: {
    sedan:   ["Jetta", "Polo", "Golf", "Virtus", "Passat"],
    suv:     ["Tiguan", "T-Cross", "T-Roc", "Touareg"],
  },
  "Royal Enfield": {
    moto:    ["Classic 350", "Bullet 350", "Himalayan", "Meteor 350", "Thunderbird 500"],
  },
  Ducati: {
    moto:    ["Monster 797", "Scrambler 800", "Panigale V2", "Multistrada"],
  },
  "Harley-Davidson": {
    moto:    ["Sportster S", "Softail Standard", "Street 500", "Street 750", "Iron 883"],
  },
  Piaggio: {
    scooter: ["Vespa GTS 300", "Liberty 125", "Beverly 300"],
  },
  Hino: {
    truck:   ["300 Series", "500 Series", "700 Series"],
  },
  MAN: {
    truck:   ["TGS 18.440", "TGM 18.250", "TGX 25.500"],
  },
  Volvo: {
    truck:   ["FH16 750", "FM 13", "FMX 13"],
  },
};

export const COLOR_HEX: Record<string, string> = {
  rouge: "#DC2626", rouj: "#DC2626", red: "#DC2626",
  bleu: "#1D4ED8", "bleu marine": "#1E3A5F", "bleu ciel": "#7DD3FC", ble: "#1D4ED8", blue: "#1D4ED8", navy: "#1E3A5F",
  vert: "#15803D", vèt: "#15803D", green: "#15803D",
  noir: "#1C1C1E", nwa: "#1C1C1E", black: "#1C1C1E",
  blanc: "#D1D5DB", blan: "#D1D5DB", white: "#D1D5DB",
  gris: "#6B7280", gri: "#6B7280", gray: "#6B7280", grey: "#6B7280",
  argent: "#C0C0C0", silver: "#C0C0C0",
  jaune: "#EAB308", jòn: "#EAB308", yellow: "#EAB308",
  orange: "#EA580C", oranj: "#EA580C",
  marron: "#92400E", mawon: "#92400E", brown: "#92400E",
  bordeaux: "#881337", maroon: "#881337",
  beige: "#D4B896", krem: "#FEF3C7", cream: "#FEF3C7",
  rose: "#DB2777", woz: "#DB2777", pink: "#DB2777",
  violet: "#7C3AED", viyolèt: "#7C3AED", purple: "#7C3AED",
  or: "#D97706", gold: "#D97706",
};

export function getColorHex(colorName: string): string | null {
  if (!colorName) return null;
  const n = colorName.toLowerCase().trim();
  for (const [key, hex] of Object.entries(COLOR_HEX)) {
    if (n === key || n.includes(key)) return hex;
  }
  return null;
}

export function getModelsForBrandStyle(brand: string, style: VehicleBodyStyle): string[] {
  return MODELS_BY_BRAND[brand]?.[style] ?? [];
}

export function getBrandsForStyle(style: VehicleBodyStyle): string[] {
  return BRANDS_BY_STYLE[style] ?? [];
}
