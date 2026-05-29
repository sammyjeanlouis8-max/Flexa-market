import { db, categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// ─── Parent categories ────────────────────────────────────────────────────────
const PARENT_CATEGORIES = [
  { name: "Electronics",          slug: "electronics",        icon: "📱" },
  { name: "Vehicles",             slug: "vehicles",           icon: "🚗" },
  { name: "Real Estate",          slug: "real-estate",        icon: "🏠" },
  { name: "Fashion",              slug: "fashion",            icon: "👗" },
  { name: "Shoes",                slug: "shoes",              icon: "👟" },
  { name: "Beauty & Health",      slug: "beauty-health",      icon: "💄" },
  { name: "Home & Furniture",     slug: "home-furniture",     icon: "🛋️" },
  { name: "Appliances",           slug: "appliances",         icon: "⚡" },
  { name: "Baby & Kids",          slug: "baby-kids",          icon: "🍼" },
  { name: "Sports & Outdoors",    slug: "sports-outdoors",    icon: "⚽" },
  { name: "Tools & Construction", slug: "tools-equipment",    icon: "🔧" },
  { name: "Books & Education",    slug: "books-education",    icon: "📚" },
  { name: "Food & Agriculture",   slug: "food-agriculture",   icon: "🌽" },
  { name: "Art & Collectibles",   slug: "art-collectibles",   icon: "🎨" },
  { name: "Music & Entertainment",slug: "music-entertainment",icon: "🎵" },
  { name: "Office & Business",    slug: "office-business",    icon: "🏢" },
  { name: "Jobs",                 slug: "jobs",               icon: "💼" },
  { name: "Services",             slug: "services",           icon: "🛠️" },
  { name: "Pets & Animals",       slug: "pets",               icon: "🐾" },
  { name: "Gaming",               slug: "gaming",             icon: "🎮" },
  { name: "Travel",               slug: "travel",             icon: "✈️" },
  { name: "Other",                slug: "other",              icon: "📦" },
];

// ─── Subcategories keyed by parent slug ──────────────────────────────────────
const SUBCATEGORIES: Record<string, { name: string; slug: string; icon: string }[]> = {

  "electronics": [
    { name: "Phones & Tablets",        slug: "phones-tablets",          icon: "📱" },
    { name: "Computers & Laptops",     slug: "computers",               icon: "💻" },
    { name: "TVs & Home Cinema",       slug: "tvs",                     icon: "📺" },
    { name: "Audio & Headphones",      slug: "electronics-audio",       icon: "🎧" },
    { name: "Cameras & Photography",   slug: "cameras",                 icon: "📷" },
    { name: "Printers & Scanners",     slug: "printers",                icon: "🖨️" },
    { name: "Networking & Internet",   slug: "networking",              icon: "📡" },
    { name: "Smart Home & Gadgets",    slug: "smart-home",              icon: "🏠" },
    { name: "Accessories & Cables",    slug: "electronics-accessories", icon: "🔌" },
    { name: "Batteries & Power Banks", slug: "batteries",               icon: "🔋" },
  ],

  "vehicles": [
    { name: "Cars",                        slug: "cars",           icon: "🚗" },
    { name: "Motorcycles",                 slug: "motorcycles",    icon: "🏍️" },
    { name: "Scooters & Mopeds",           slug: "scooters",       icon: "🛵" },
    { name: "Trucks & Pickup",             slug: "trucks",         icon: "🚚" },
    { name: "Buses & Minibuses",           slug: "buses",          icon: "🚌" },
    { name: "Boats & Marine",              slug: "boats",          icon: "⛵" },
    { name: "Bicycles",                    slug: "bicycles",       icon: "🚲" },
    { name: "Auto Parts & Accessories",    slug: "auto-parts",     icon: "⚙️" },
    { name: "Tires & Wheels",              slug: "tires",          icon: "🔵" },
    { name: "Heavy Equipment",             slug: "heavy-equipment",icon: "🚜" },
  ],

  "real-estate": [
    { name: "Houses for Sale",         slug: "houses-for-sale",     icon: "🏡" },
    { name: "Apartments for Rent",     slug: "apartments-for-rent", icon: "🏢" },
    { name: "Rooms for Rent",          slug: "rooms-for-rent",      icon: "🛏️" },
    { name: "Land & Plots",            slug: "land",                icon: "🌿" },
    { name: "Commercial Property",     slug: "commercial-property", icon: "🏬" },
    { name: "Vacation Rentals",        slug: "vacation-rentals",    icon: "🏖️" },
    { name: "Office Space",            slug: "office-space",        icon: "🏢" },
    { name: "Warehouses & Storage",    slug: "warehouses",          icon: "🏭" },
  ],

  "fashion": [
    { name: "Men's Clothing",          slug: "mens-clothing",       icon: "👔" },
    { name: "Women's Clothing",        slug: "womens-clothing",     icon: "👗" },
    { name: "Kids' Clothing",          slug: "kids-clothing-fashion",icon: "👦" },
    { name: "Traditional Wear",        slug: "traditional-wear",    icon: "🎎" },
    { name: "Underwear & Lingerie",    slug: "underwear",           icon: "👙" },
    { name: "Swimwear & Beachwear",    slug: "swimwear",            icon: "🏊" },
    { name: "Bags & Purses",           slug: "bags",                icon: "👜" },
    { name: "Belts & Wallets",         slug: "belts-wallets",       icon: "👝" },
    { name: "Sunglasses & Eyewear",    slug: "eyewear",             icon: "🕶️" },
    { name: "Watches",                 slug: "watches",             icon: "⌚" },
    { name: "Hats & Caps",             slug: "hats",                icon: "🧢" },
    { name: "Jewelry",                 slug: "jewelry",             icon: "💍" },
  ],

  "shoes": [
    { name: "Men's Shoes",             slug: "mens-shoes",          icon: "👞" },
    { name: "Women's Shoes & Heels",   slug: "womens-shoes",        icon: "👠" },
    { name: "Kids' Shoes",             slug: "kids-shoes",          icon: "👟" },
    { name: "Sports & Running",        slug: "sports-shoes",        icon: "🏃" },
    { name: "Sandals & Slippers",      slug: "sandals",             icon: "🩴" },
    { name: "Boots",                   slug: "boots",               icon: "🥾" },
    { name: "Work & Safety Shoes",     slug: "work-shoes",          icon: "🦺" },
  ],

  "beauty-health": [
    { name: "Skincare & Face",         slug: "skincare",            icon: "🧴" },
    { name: "Hair Care & Products",    slug: "haircare",            icon: "💇" },
    { name: "Wigs & Hair Extensions",  slug: "wigs",                icon: "💆" },
    { name: "Makeup & Cosmetics",      slug: "makeup",              icon: "💄" },
    { name: "Fragrances & Perfumes",   slug: "fragrances",          icon: "🌸" },
    { name: "Nail Care",               slug: "nail-care",           icon: "💅" },
    { name: "Health & Vitamins",       slug: "health-wellness",     icon: "💊" },
    { name: "Medical Equipment",       slug: "medical-equipment",   icon: "🩺" },
    { name: "Personal Care",           slug: "personal-care",       icon: "🪥" },
    { name: "Weight Loss & Fitness",   slug: "fitness-beauty",      icon: "⚖️" },
  ],

  "home-furniture": [
    { name: "Living Room Furniture",   slug: "living-room",         icon: "🛋️" },
    { name: "Bedroom Furniture",       slug: "bedroom",             icon: "🛏️" },
    { name: "Kitchen & Dining",        slug: "kitchen",             icon: "🍳" },
    { name: "Bathroom",                slug: "bathroom",            icon: "🚿" },
    { name: "Outdoor & Garden",        slug: "outdoor-garden",      icon: "🌿" },
    { name: "Lighting & Lamps",        slug: "lighting",            icon: "💡" },
    { name: "Curtains & Rugs",         slug: "curtains-rugs",       icon: "🪟" },
    { name: "Storage & Shelving",      slug: "storage",             icon: "📦" },
    { name: "Home Decor & Art",        slug: "home-decor",          icon: "🖼️" },
    { name: "Cleaning Supplies",       slug: "cleaning",            icon: "🧹" },
    { name: "Bedding & Pillows",       slug: "bedding",             icon: "🛌" },
  ],

  "appliances": [
    { name: "Refrigerators & Freezers",slug: "refrigerators",       icon: "🧊" },
    { name: "Washing Machines",        slug: "washers-dryers",      icon: "🫧" },
    { name: "Air Conditioners",        slug: "air-conditioners",    icon: "❄️" },
    { name: "Stoves & Ovens",          slug: "stoves-ovens",        icon: "🍳" },
    { name: "Generators",              slug: "generators",          icon: "⚡" },
    { name: "Solar Panels & Inverters",slug: "solar",               icon: "☀️" },
    { name: "Water Pumps & Tanks",     slug: "water-pumps",         icon: "💧" },
    { name: "Microwaves & Blenders",   slug: "small-appliances",    icon: "🔌" },
    { name: "Water Dispensers",        slug: "water-dispensers",    icon: "🚰" },
    { name: "Fans & Ventilation",      slug: "fans",                icon: "💨" },
  ],

  "baby-kids": [
    { name: "Baby Clothing",           slug: "kids-clothing",       icon: "👶" },
    { name: "Toys & Games",            slug: "toys-games",          icon: "🧸" },
    { name: "Strollers & Car Seats",   slug: "strollers",           icon: "🪑" },
    { name: "Baby Furniture & Cribs",  slug: "baby-furniture",      icon: "🛏️" },
    { name: "Feeding & Nursing",       slug: "feeding",             icon: "🍼" },
    { name: "Diapers & Hygiene",       slug: "diapers",             icon: "🧷" },
    { name: "Baby Monitors",           slug: "baby-monitors",       icon: "📷" },
    { name: "School Supplies",         slug: "school-supplies",     icon: "📐" },
    { name: "Baby Shoes",              slug: "baby-shoes",          icon: "👟" },
  ],

  "sports-outdoors": [
    { name: "Exercise Equipment",      slug: "exercise-equipment",  icon: "🏋️" },
    { name: "Outdoor & Camping",       slug: "outdoor-camping",     icon: "⛺" },
    { name: "Football & Soccer",       slug: "football",            icon: "⚽" },
    { name: "Basketball",              slug: "basketball",          icon: "🏀" },
    { name: "Boxing & Martial Arts",   slug: "boxing",              icon: "🥊" },
    { name: "Water Sports",            slug: "water-sports",        icon: "🏄" },
    { name: "Sports Clothing",         slug: "sports-clothing",     icon: "👕" },
    { name: "Sports Accessories",      slug: "sports-gear",         icon: "🎽" },
    { name: "Fishing",                 slug: "fishing",             icon: "🎣" },
    { name: "Cycling",                 slug: "cycling",             icon: "🚲" },
  ],

  "tools-equipment": [
    { name: "Power Tools",             slug: "power-tools",         icon: "🔨" },
    { name: "Hand Tools",              slug: "hand-tools",          icon: "🔧" },
    { name: "Building Materials",      slug: "building-materials",  icon: "🧱" },
    { name: "Cement & Blocks",         slug: "cement-blocks",       icon: "🪨" },
    { name: "Roofing & Flooring",      slug: "roofing-flooring",    icon: "🏗️" },
    { name: "Doors & Windows",         slug: "doors-windows",       icon: "🚪" },
    { name: "Plumbing & Pipes",        slug: "plumbing",            icon: "🔩" },
    { name: "Electrical & Wiring",     slug: "electrical",          icon: "⚡" },
    { name: "Paint & Finishes",        slug: "paint",               icon: "🎨" },
    { name: "Garden Tools",            slug: "garden-tools",        icon: "🌱" },
    { name: "Safety Equipment",        slug: "safety-equipment",    icon: "🦺" },
    { name: "Ladders & Scaffolding",   slug: "ladders",             icon: "🪜" },
  ],

  "books-education": [
    { name: "Textbooks & Academic",    slug: "textbooks",           icon: "📖" },
    { name: "Fiction & Literature",    slug: "fiction",             icon: "📚" },
    { name: "Religious Books",         slug: "religious-books",     icon: "✝️" },
    { name: "Children's Books",        slug: "childrens-books",     icon: "📗" },
    { name: "Magazines & Newspapers",  slug: "magazines",           icon: "📰" },
    { name: "Educational Materials",   slug: "educational-materials",icon: "📝" },
    { name: "Art & Craft Supplies",    slug: "art-craft",           icon: "✏️" },
    { name: "Stationery & Office",     slug: "stationery",          icon: "🖊️" },
  ],

  "food-agriculture": [
    { name: "Fresh Fruits & Vegetables",slug: "fresh-produce",      icon: "🥬" },
    { name: "Meat & Poultry",          slug: "meat-poultry",        icon: "🍖" },
    { name: "Fish & Seafood",          slug: "fish-seafood",        icon: "🐟" },
    { name: "Grains & Staples",        slug: "grains-staples",      icon: "🌾" },
    { name: "Dairy & Eggs",            slug: "dairy-eggs",          icon: "🥚" },
    { name: "Packaged & Canned Foods", slug: "packaged-foods",      icon: "🥫" },
    { name: "Drinks & Beverages",      slug: "drinks",              icon: "🧃" },
    { name: "Snacks & Sweets",         slug: "snacks",              icon: "🍬" },
    { name: "Livestock & Poultry",     slug: "livestock",           icon: "🐄" },
    { name: "Farm Equipment",          slug: "farm-equipment",      icon: "🚜" },
    { name: "Seeds & Plants",          slug: "seeds-plants",        icon: "🌱" },
    { name: "Fertilizers & Pesticides",slug: "fertilizers",         icon: "🌿" },
  ],

  "art-collectibles": [
    { name: "Paintings & Drawings",    slug: "paintings",           icon: "🖼️" },
    { name: "Sculptures & Crafts",     slug: "sculptures",          icon: "🗿" },
    { name: "Handmade & Artisan",      slug: "handmade",            icon: "🤲" },
    { name: "Antiques",                slug: "antiques",            icon: "🏺" },
    { name: "Coins & Stamps",          slug: "coins-stamps",        icon: "🪙" },
    { name: "Memorabilia & Souvenirs", slug: "memorabilia",         icon: "🎖️" },
    { name: "Photography",             slug: "photography-art",     icon: "📸" },
    { name: "Religious & Spiritual",   slug: "religious-art",       icon: "⛪" },
  ],

  "music-entertainment": [
    { name: "Guitars & Strings",       slug: "guitars",             icon: "🎸" },
    { name: "Keyboards & Pianos",      slug: "keyboards-pianos",    icon: "🎹" },
    { name: "Drums & Percussion",      slug: "drums",               icon: "🥁" },
    { name: "Wind Instruments",        slug: "wind-instruments",    icon: "🎺" },
    { name: "DJ & Sound Equipment",    slug: "dj-equipment",        icon: "🎚️" },
    { name: "Speakers & PA Systems",   slug: "speakers",            icon: "🔊" },
    { name: "Microphones & Recording", slug: "microphones",         icon: "🎤" },
    { name: "CDs, DVDs & Vinyl",       slug: "cds-dvds",            icon: "💿" },
    { name: "Movie & Event Tickets",   slug: "tickets",             icon: "🎟️" },
    { name: "TV & Streaming Accounts", slug: "streaming",           icon: "📺" },
  ],

  "office-business": [
    { name: "Office Furniture",        slug: "office-furniture",    icon: "🪑" },
    { name: "Office Electronics",      slug: "office-electronics",  icon: "🖥️" },
    { name: "Printers & Copiers",      slug: "office-printers",     icon: "🖨️" },
    { name: "Restaurant Equipment",    slug: "restaurant-equipment",icon: "🍽️" },
    { name: "Retail & POS Systems",    slug: "pos-systems",         icon: "🏪" },
    { name: "Medical & Dental Equip.", slug: "medical-dental",      icon: "🏥" },
    { name: "Industrial Machinery",    slug: "industrial-machinery",icon: "🏭" },
    { name: "Business Supplies",       slug: "business-supplies",   icon: "📋" },
    { name: "Signage & Banners",       slug: "signage",             icon: "🪧" },
  ],

  "jobs": [
    { name: "Full-time",               slug: "jobs-full-time",      icon: "💼" },
    { name: "Part-time",               slug: "jobs-part-time",      icon: "🕐" },
    { name: "Freelance & Remote",      slug: "jobs-freelance",      icon: "💻" },
    { name: "Internship",              slug: "jobs-internship",     icon: "🎓" },
    { name: "Construction & Trades",   slug: "jobs-construction",   icon: "🏗️" },
    { name: "Domestic & Cleaning",     slug: "jobs-domestic",       icon: "🧹" },
    { name: "Driver & Delivery",       slug: "jobs-driver",         icon: "🚗" },
    { name: "Security",                slug: "jobs-security",       icon: "🛡️" },
  ],

  "services": [
    { name: "Home Repair & Renovation",slug: "home-services",       icon: "🏠" },
    { name: "Plumbing & Electrical",   slug: "plumbing-electrical", icon: "🔧" },
    { name: "Beauty & Salon",          slug: "beauty-wellness-services",icon: "💆" },
    { name: "Photography & Video",     slug: "photo-video-services",icon: "📸" },
    { name: "Tutoring & Lessons",      slug: "tutoring",            icon: "📖" },
    { name: "Transportation & Moving", slug: "transportation",      icon: "🚖" },
    { name: "Tech & IT Support",       slug: "tech-support",        icon: "💻" },
    { name: "Cleaning Services",       slug: "cleaning-services",   icon: "🧹" },
    { name: "Event Planning",          slug: "event-planning",      icon: "🎉" },
    { name: "Security Services",       slug: "security-services",   icon: "🛡️" },
    { name: "Legal & Notary",          slug: "legal",               icon: "⚖️" },
    { name: "Finance & Accounting",    slug: "finance",             icon: "💰" },
  ],

  "pets": [
    { name: "Dogs",                    slug: "dogs",                icon: "🐕" },
    { name: "Cats",                    slug: "cats",                icon: "🐈" },
    { name: "Birds",                   slug: "birds",               icon: "🐦" },
    { name: "Fish & Aquarium",         slug: "fish-aquarium",       icon: "🐠" },
    { name: "Reptiles & Exotic",       slug: "reptiles",            icon: "🦎" },
    { name: "Pet Food & Treats",       slug: "pet-food",            icon: "🦴" },
    { name: "Pet Accessories",         slug: "pet-supplies",        icon: "🎾" },
    { name: "Veterinary Products",     slug: "vet-products",        icon: "🩺" },
  ],

  "gaming": [
    { name: "PlayStation",             slug: "playstation",         icon: "🎮" },
    { name: "Xbox",                    slug: "xbox",                icon: "🕹️" },
    { name: "Nintendo",                slug: "nintendo",            icon: "🎯" },
    { name: "PC Games & Software",     slug: "pc-gaming",           icon: "💻" },
    { name: "Mobile Games & Accounts", slug: "mobile-games",        icon: "📱" },
    { name: "Gaming Accessories",      slug: "gaming-accessories",  icon: "🖱️" },
    { name: "Board Games & Puzzles",   slug: "board-games",         icon: "♟️" },
    { name: "Gift Cards & Credits",    slug: "gift-cards",          icon: "🎁" },
  ],

  "travel": [
    { name: "Travel Packages",         slug: "travel-packages",     icon: "🗺️" },
    { name: "Hotels & Accommodation",  slug: "hotels",              icon: "🏨" },
    { name: "Airline Tickets",         slug: "airline-tickets",     icon: "✈️" },
    { name: "Car Rentals",             slug: "car-rentals",         icon: "🚗" },
    { name: "Tours & Activities",      slug: "tours",               icon: "🏖️" },
    { name: "Travel Accessories",      slug: "travel-accessories",  icon: "🧳" },
    { name: "Visa & Documentation",    slug: "visa-docs",           icon: "📄" },
  ],

  "other": [
    { name: "Free Items",              slug: "free-items",          icon: "🎁" },
    { name: "Wanted / Looking For",    slug: "wanted",              icon: "🔍" },
    { name: "Miscellaneous",           slug: "miscellaneous",       icon: "📦" },
    { name: "Lost & Found",            slug: "lost-found",          icon: "🔎" },
    { name: "Swap & Trade",            slug: "swap-trade",          icon: "🔄" },
  ],
};

// ─── Sync: insert new categories, skip existing ones ────────────────────────
export async function syncCategories(): Promise<void> {
  logger.info("Syncing categories...");

  // Load all existing slugs from DB
  const existing = await db.select({ slug: categoriesTable.slug }).from(categoriesTable);
  const existingSlugs = new Set(existing.map(r => r.slug));

  let added = 0;

  for (const parent of PARENT_CATEGORIES) {
    let parentId: number;

    if (!existingSlugs.has(parent.slug)) {
      const [inserted] = await db
        .insert(categoriesTable)
        .values({ name: parent.name, slug: parent.slug, icon: parent.icon, parentId: null })
        .returning({ id: categoriesTable.id });
      parentId = inserted.id;
      existingSlugs.add(parent.slug);
      added++;
    } else {
      // Get existing parent id
      const [row] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.slug, parent.slug));
      parentId = row.id;

      // Update icon/name in case it changed
      await db
        .update(categoriesTable)
        .set({ name: parent.name, icon: parent.icon })
        .where(eq(categoriesTable.slug, parent.slug));
    }

    const subs = SUBCATEGORIES[parent.slug] ?? [];
    for (const sub of subs) {
      if (!existingSlugs.has(sub.slug)) {
        await db
          .insert(categoriesTable)
          .values({ name: sub.name, slug: sub.slug, icon: sub.icon, parentId })
          .onConflictDoNothing();
        existingSlugs.add(sub.slug);
        added++;
      }
    }
  }

  logger.info({ added }, "Category sync complete");
}
