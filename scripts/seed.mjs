import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.SESSION_SECRET ?? "marketplace-secret-key";

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + JWT_SECRET).digest("hex");
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("Seeding database...");

    // Parent categories
    const parentCategories = [
      { name: "Electronics",        slug: "electronics",       icon: "📱" },
      { name: "Vehicles",           slug: "vehicles",          icon: "🚗" },
      { name: "Real Estate",        slug: "real-estate",       icon: "🏠" },
      { name: "Fashion",            slug: "fashion",           icon: "👗" },
      { name: "Shoes",              slug: "shoes",             icon: "👟" },
      { name: "Beauty & Health",    slug: "beauty-health",     icon: "💄" },
      { name: "Home & Furniture",   slug: "home-furniture",    icon: "🛋️" },
      { name: "Appliances",         slug: "appliances",        icon: "🧺" },
      { name: "Baby & Kids",        slug: "baby-kids",         icon: "🍼" },
      { name: "Sports & Outdoors",  slug: "sports-outdoors",   icon: "⚽" },
      { name: "Tools & Equipment",  slug: "tools-equipment",   icon: "🔧" },
      { name: "Books & Education",  slug: "books-education",   icon: "📚" },
      { name: "Jobs",               slug: "jobs",              icon: "💼" },
      { name: "Services",           slug: "services",          icon: "🛠️" },
      { name: "Pets",               slug: "pets",              icon: "🐾" },
      { name: "Gaming",             slug: "gaming",            icon: "🎮" },
      { name: "Other",              slug: "other",             icon: "📦" },
    ];

    const parentIds = {};
    for (const cat of parentCategories) {
      const res = await client.query(
        `INSERT INTO categories (name, slug, icon, parent_id)
         VALUES ($1, $2, $3, NULL)
         ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, parent_id=NULL
         RETURNING id`,
        [cat.name, cat.slug, cat.icon]
      );
      parentIds[cat.slug] = res.rows[0].id;
    }

    const subcategories = {
      "electronics": [
        { name: "Phones & Tablets", slug: "phones-tablets", icon: "📱" },
        { name: "Computers", slug: "computers", icon: "💻" },
        { name: "TVs & Monitors", slug: "tvs", icon: "📺" },
        { name: "Audio & Headphones", slug: "electronics-audio", icon: "🎧" },
        { name: "Cameras", slug: "cameras", icon: "📷" },
        { name: "Accessories", slug: "electronics-accessories", icon: "🔌" },
      ],
      "vehicles": [
        { name: "Cars", slug: "cars", icon: "🚗" },
        { name: "Trucks", slug: "trucks", icon: "🚚" },
        { name: "Motorcycles", slug: "motorcycles", icon: "🏍️" },
        { name: "Scooters", slug: "scooters", icon: "🛵" },
        { name: "Boats", slug: "boats", icon: "⛵" },
        { name: "Auto Parts & Accessories", slug: "auto-parts", icon: "⚙️" },
      ],
      "real-estate": [
        { name: "Houses for Sale", slug: "houses-for-sale", icon: "🏡" },
        { name: "Apartments for Rent", slug: "apartments-for-rent", icon: "🏢" },
        { name: "Land", slug: "land", icon: "🌿" },
        { name: "Commercial Property", slug: "commercial-property", icon: "🏬" },
        { name: "Vacation Rentals", slug: "vacation-rentals", icon: "🏖️" },
      ],
      "fashion": [
        { name: "Men's Clothing", slug: "mens-clothing", icon: "👔" },
        { name: "Women's Clothing", slug: "womens-clothing", icon: "👗" },
        { name: "Jewelry", slug: "jewelry", icon: "💍" },
        { name: "Bags & Accessories", slug: "bags", icon: "👜" },
        { name: "Watches", slug: "watches", icon: "⌚" },
      ],
      "shoes": [
        { name: "Men's Shoes", slug: "mens-shoes", icon: "👞" },
        { name: "Women's Shoes", slug: "womens-shoes", icon: "👠" },
        { name: "Kids' Shoes", slug: "kids-shoes", icon: "👟" },
        { name: "Sandals & Flip Flops", slug: "sandals", icon: "🩴" },
        { name: "Athletic Shoes", slug: "athletic-shoes", icon: "👟" },
      ],
      "beauty-health": [
        { name: "Skincare", slug: "skincare", icon: "🧴" },
        { name: "Makeup", slug: "makeup", icon: "💄" },
        { name: "Hair Care", slug: "hair-care", icon: "💇" },
        { name: "Perfume & Fragrance", slug: "perfume", icon: "🌸" },
        { name: "Health & Wellness", slug: "health-wellness", icon: "💊" },
      ],
      "home-furniture": [
        { name: "Furniture", slug: "furniture", icon: "🛋️" },
        { name: "Kitchen Items", slug: "kitchen-items", icon: "🍳" },
        { name: "Bedding", slug: "bedding", icon: "🛏️" },
        { name: "Home Decor", slug: "home-decor", icon: "🖼️" },
        { name: "Lighting", slug: "lighting", icon: "💡" },
      ],
      "appliances": [
        { name: "Refrigerators", slug: "refrigerators", icon: "🧊" },
        { name: "Washing Machines", slug: "washing-machines", icon: "🫧" },
        { name: "Air Conditioners", slug: "air-conditioners", icon: "❄️" },
        { name: "Stoves & Ovens", slug: "stoves-ovens", icon: "🍳" },
        { name: "Small Appliances", slug: "small-appliances", icon: "🔌" },
      ],
      "baby-kids": [
        { name: "Baby Gear", slug: "baby-items", icon: "🍼" },
        { name: "Toys & Games", slug: "toys", icon: "🧸" },
        { name: "Kids' Clothing", slug: "kids-clothing", icon: "👶" },
        { name: "School Supplies", slug: "school-supplies", icon: "✏️" },
      ],
      "sports-outdoors": [
        { name: "Bikes & Cycling", slug: "bikes", icon: "🚲" },
        { name: "Gym & Fitness", slug: "gym-equipment", icon: "🏋️" },
        { name: "Outdoor & Camping", slug: "outdoor-gear", icon: "🏕️" },
        { name: "Team Sports", slug: "team-sports", icon: "⚽" },
        { name: "Water Sports", slug: "water-sports", icon: "🏄" },
      ],
      "tools-equipment": [
        { name: "Power Tools", slug: "power-tools", icon: "🔧" },
        { name: "Hand Tools", slug: "hand-tools", icon: "🔨" },
        { name: "Construction Equipment", slug: "construction-tools", icon: "🏗️" },
        { name: "Farming Tools", slug: "farming-tools", icon: "🌾" },
        { name: "Generators", slug: "generators", icon: "⚡" },
      ],
      "books-education": [
        { name: "Textbooks", slug: "textbooks", icon: "📖" },
        { name: "Fiction & Literature", slug: "fiction", icon: "📚" },
        { name: "Children's Books", slug: "childrens-books", icon: "🧒" },
        { name: "Online Courses", slug: "online-courses", icon: "🎓" },
        { name: "Musical Instruments", slug: "musical-instruments", icon: "🎸" },
      ],
      "jobs": [
        { name: "Full-Time", slug: "full-time-jobs", icon: "🏢" },
        { name: "Part-Time", slug: "part-time-jobs", icon: "⏰" },
        { name: "Freelance / Contract", slug: "freelance-jobs", icon: "💻" },
        { name: "Internships", slug: "internships", icon: "🎓" },
        { name: "Remote Jobs", slug: "remote-jobs", icon: "🌐" },
      ],
      "services": [
        { name: "Cleaning", slug: "cleaning", icon: "🧹" },
        { name: "Repairs & Maintenance", slug: "repairs", icon: "🔩" },
        { name: "Moving & Delivery", slug: "moving", icon: "🚚" },
        { name: "Tutoring & Lessons", slug: "tutoring", icon: "📝" },
        { name: "Beauty Services", slug: "beauty-services", icon: "💅" },
        { name: "Tech Support", slug: "tech-support", icon: "🖥️" },
      ],
      "pets": [
        { name: "Dogs", slug: "dogs", icon: "🐶" },
        { name: "Cats", slug: "cats", icon: "🐱" },
        { name: "Birds", slug: "birds", icon: "🦜" },
        { name: "Fish & Aquatic", slug: "fish", icon: "🐠" },
        { name: "Pet Supplies", slug: "pet-supplies", icon: "🦴" },
      ],
      "gaming": [
        { name: "Video Games", slug: "video-games", icon: "🕹️" },
        { name: "Consoles", slug: "consoles", icon: "🎮" },
        { name: "Gaming Accessories", slug: "gaming-accessories", icon: "🖱️" },
      ],
      "other": [
        { name: "Miscellaneous", slug: "miscellaneous", icon: "📦" },
      ],
    };

    let subCount = 0;
    for (const [parentSlug, subs] of Object.entries(subcategories)) {
      const parentId = parentIds[parentSlug];
      if (!parentId) continue;
      for (const sub of subs) {
        await client.query(
          `INSERT INTO categories (name, slug, icon, parent_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, icon=EXCLUDED.icon, parent_id=EXCLUDED.parent_id`,
          [sub.name, sub.slug, sub.icon, parentId]
        );
        subCount++;
      }
    }
    console.log(`✓ ${parentCategories.length + subCount} categories seeded (${parentCategories.length} parent + ${subCount} subcategories)`);

    // Demo users
    const passwordHash = hashPassword("password123");

    const users = [
      { name: "Alice Johnson", email: "alice@example.com", location: "New York, NY", bio: "Selling quality items at great prices!", phone: "555-0101", rating: 4.8, reviews: 12 },
      { name: "Bob Smith", email: "bob@example.com", location: "Los Angeles, CA", bio: "Tech enthusiast. Everything in great condition.", phone: "555-0102", rating: 4.5, reviews: 8 },
      { name: "Carol White", email: "carol@example.com", location: "Chicago, IL", bio: "Vintage collector and furniture lover.", phone: "555-0103", rating: 4.9, reviews: 21 },
      { name: "David Brown", email: "david@example.com", location: "Austin, TX", bio: "Sports gear and outdoor equipment.", phone: "555-0104", rating: 4.6, reviews: 5 },
    ];

    const userIds = [];
    for (const u of users) {
      const res = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, location, bio, rating, review_count, is_verified, listing_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, rating=EXCLUDED.rating RETURNING id`,
        [u.name, u.email, passwordHash, u.phone, u.location, u.bio, u.rating, u.reviews, true, 0]
      );
      userIds.push(res.rows[0].id);
    }
    console.log("✓ Users seeded");

    // Get category IDs
    const catRes = await client.query("SELECT id, slug FROM categories ORDER BY id");
    const catMap = {};
    for (const row of catRes.rows) catMap[row.slug] = row.id;

    // Reset listing counts on categories for idempotency
    await client.query("UPDATE categories SET listing_count = 0");
    await client.query("UPDATE users SET listing_count = 0");
    // Remove old seeded listings to keep idempotent
    await client.query("DELETE FROM listings WHERE seller_id = ANY($1::int[])", [userIds]);

    // Sample listings
    const listings = [
      {
        title: "iPhone 14 Pro - 256GB Space Black",
        description: "Like new condition, barely used. Comes with original box, charger, and two cases. No scratches or dents. Battery health at 99%. Unlocked for all carriers.",
        price: 750, category: "electronics", condition: "like_new", location: "New York, NY",
        images: ["https://placehold.co/600x400/1a1a2e/white?text=iPhone+14+Pro"],
        seller: 0, isBoosted: true, views: 187,
      },
      {
        title: "Sony PlayStation 5 Console",
        description: "PS5 disc edition with two controllers, HDMI cable, and 3 games (Spider-Man, Horizon, God of War). Works perfectly, all cables included.",
        price: 450, category: "electronics", condition: "good", location: "Brooklyn, NY",
        images: ["https://placehold.co/600x400/003087/white?text=PlayStation+5"],
        seller: 1, isBoosted: false, views: 243,
      },
      {
        title: "MacBook Pro 14\" M2 Pro",
        description: "2023 MacBook Pro with M2 Pro chip, 16GB RAM, 512GB SSD. Excellent condition, used for 6 months. Original charger and box included.",
        price: 1650, category: "electronics", condition: "like_new", location: "Manhattan, NY",
        images: ["https://placehold.co/600x400/555555/white?text=MacBook+Pro+M2"],
        seller: 0, isBoosted: true, views: 512,
      },
      {
        title: "Samsung 65\" QLED 4K Smart TV",
        description: "Samsung QN65Q80C 65-inch QLED 4K TV. 1 year old, in perfect condition. Wall mount bracket included. Replacing with larger screen.",
        price: 875, category: "electronics", condition: "like_new", location: "Chicago, IL",
        images: ["https://placehold.co/600x400/0a0a0a/white?text=Samsung+QLED+65"],
        seller: 2, isBoosted: false, views: 98,
      },
      {
        title: "Vintage Levi's 501 Jeans - Size 32x30",
        description: "Authentic 1990s Levi's 501 jeans in great vintage condition. Some natural fading, no holes or tears. Classic straight fit.",
        price: 65, category: "clothing", condition: "good", location: "Los Angeles, CA",
        images: ["https://placehold.co/600x400/1a3a5c/white?text=Levis+501+Vintage"],
        seller: 1, isBoosted: false, views: 45,
      },
      {
        title: "Nike Air Jordan 1 High OG - Size 10",
        description: "DS (deadstock) Air Jordan 1 Chicago colorway, size 10. Never worn. Original receipt and box included. Purchased from Nike.com.",
        price: 380, category: "clothing", condition: "new", location: "Chicago, IL",
        images: ["https://placehold.co/600x400/cc0000/white?text=Jordan+1+Chicago"],
        seller: 2, isBoosted: false, views: 321,
      },
      {
        title: "Mid-Century Modern Sofa - Walnut Legs",
        description: "Beautiful mid-century modern sofa in teal velvet fabric. Walnut tapered legs. Perfect condition, from a pet-free smoke-free home. Dimensions: 84\"W x 33\"D x 32\"H.",
        price: 895, category: "furniture", condition: "like_new", location: "Chicago, IL",
        images: ["https://placehold.co/600x400/2a7a6a/white?text=MCM+Velvet+Sofa"],
        seller: 2, isBoosted: true, views: 156,
      },
      {
        title: "IKEA KALLAX 4x4 Shelf Unit - White",
        description: "4x4 KALLAX shelf unit in white. All cubbies intact. Some minor scuffs but otherwise great condition. Need gone by weekend - negotiable!",
        price: 80, category: "furniture", condition: "good", location: "Austin, TX",
        images: ["https://placehold.co/600x400/e8e8e8/333333?text=KALLAX+4x4+Shelf"],
        seller: 3, isBoosted: false, views: 37,
      },
      {
        title: "Trek FX 3 Disc Hybrid Bike - 2022",
        description: "2022 Trek FX 3 Disc, 54cm frame, barely ridden (~200 miles). Hydraulic disc brakes, carbon fork. Comes with lights and water bottle cage.",
        price: 620, category: "sports", condition: "like_new", location: "Austin, TX",
        images: ["https://placehold.co/600x400/0057a8/white?text=Trek+FX+3+Disc"],
        seller: 3, isBoosted: false, views: 88,
      },
      {
        title: "Bowflex SelectTech 552 Adjustable Dumbbells",
        description: "Pair of Bowflex SelectTech 552 adjustable dumbbells, 5-52.5 lbs each. Excellent condition with stands included. Replacing with heavier weights.",
        price: 299, category: "sports", condition: "like_new", location: "New York, NY",
        images: ["https://placehold.co/600x400/333333/white?text=Bowflex+552"],
        seller: 0, isBoosted: false, views: 67,
      },
      {
        title: "Harry Potter Complete 7-Book Hardcover Set",
        description: "Complete original Harry Potter series by J.K. Rowling. All hardcover first editions. Minor shelf wear on spines, all pages clean and intact.",
        price: 55, category: "books", condition: "good", location: "Los Angeles, CA",
        images: ["https://placehold.co/600x400/7b2d8b/white?text=Harry+Potter+Set"],
        seller: 1, isBoosted: false, views: 29,
      },
      {
        title: "Weber Spirit II E-310 Gas Grill",
        description: "3-burner propane grill with side tables, iGrill 3 thermometer, and partial tank of propane. Used one season, works perfectly. Original cover included.",
        price: 399, category: "home", condition: "good", location: "Chicago, IL",
        images: ["https://placehold.co/600x400/c0392b/white?text=Weber+Spirit+E-310"],
        seller: 2, isBoosted: false, views: 52,
      },
      {
        title: "LEGO Star Wars Millennium Falcon 75257",
        description: "Complete set, all 1353 pieces included. Minifigures in excellent shape. Instruction booklet included. Built once and carefully displayed.",
        price: 130, category: "toys", condition: "like_new", location: "Austin, TX",
        images: ["https://placehold.co/600x400/ffd700/333333?text=LEGO+Millennium+Falcon"],
        seller: 3, isBoosted: false, views: 115,
      },
      {
        title: "2019 Honda Civic EX - 45,000 Miles",
        description: "2019 Honda Civic EX sedan, 45,000 miles. One owner, clean title, no accidents. Moonroof, heated seats, Honda Sensing suite. Service records available.",
        price: 19500, category: "vehicles", condition: "good", location: "New York, NY",
        images: ["https://placehold.co/600x400/1a1a1a/white?text=2019+Honda+Civic+EX"],
        seller: 0, isBoosted: true, views: 431,
      },
      {
        title: "DeWalt 20V MAX Drill & Driver Combo Kit",
        description: "DeWalt DCK240C2 drill and impact driver combo. Includes 2 1.5Ah batteries, charger, and contractor bag. Lightly used on one home project.",
        price: 145, category: "tools", condition: "like_new", location: "Los Angeles, CA",
        images: ["https://placehold.co/600x400/ffb300/333333?text=DeWalt+Drill+Kit"],
        seller: 1, isBoosted: false, views: 73,
      },
      {
        title: "Golden Retriever Puppies - AKC Registered",
        description: "AKC registered golden retriever puppies, 8 weeks old, vet checked, first shots and deworming done. Health guarantee provided. 3 males, 2 females available.",
        price: 1200, category: "pets", condition: "new", location: "Austin, TX",
        images: ["https://placehold.co/600x400/ffa500/white?text=Golden+Retriever+Puppies"],
        seller: 3, isBoosted: true, views: 289,
      },
    ];

    const listingIds = [];
    for (const l of listings) {
      const catId = catMap[l.category];
      const sellerId = userIds[l.seller];
      const boostExpires = l.isBoosted ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
      const res = await client.query(
        `INSERT INTO listings (title, description, price, category_id, condition, location, images, status, is_boosted, boost_expires_at, view_count, favorite_count, seller_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          l.title, l.description, l.price, catId, l.condition, l.location,
          l.images, "available", l.isBoosted, boostExpires,
          l.views, Math.floor(Math.random() * 25) + 1, sellerId
        ]
      );
      listingIds.push(res.rows[0].id);
      await client.query(`UPDATE categories SET listing_count = listing_count + 1 WHERE id = $1`, [catId]);
      await client.query(`UPDATE users SET listing_count = listing_count + 1 WHERE id = $1`, [sellerId]);
    }
    console.log(`✓ ${listings.length} listings seeded`);

    // Sample reviews
    const reviews = [
      { reviewer: 1, seller: 0, rating: 5, comment: "Great seller! Item exactly as described, fast response. Highly recommend!" },
      { reviewer: 2, seller: 0, rating: 4, comment: "Good communication, item was in good condition as stated." },
      { reviewer: 0, seller: 1, rating: 5, comment: "Super fast response, honest description. Would buy from again!" },
      { reviewer: 3, seller: 1, rating: 4, comment: "Good seller, product was as described. Pickup was easy." },
      { reviewer: 0, seller: 2, rating: 5, comment: "Amazing deal, Carol is a fantastic seller. 5 stars!" },
      { reviewer: 1, seller: 2, rating: 5, comment: "Perfect transaction, furniture was exactly as described and looked great." },
      { reviewer: 2, seller: 3, rating: 5, comment: "David was very helpful and honest. Great product!" },
    ];

    // Clear old reviews for these users
    await client.query("DELETE FROM reviews WHERE reviewer_id = ANY($1::int[]) OR seller_id = ANY($1::int[])", [userIds]);

    for (const r of reviews) {
      await client.query(
        `INSERT INTO reviews (reviewer_id, seller_id, rating, comment) VALUES ($1, $2, $3, $4)`,
        [userIds[r.reviewer], userIds[r.seller], r.rating, r.comment]
      );
    }

    // Update user ratings from reviews
    for (const uid of userIds) {
      await client.query(
        `UPDATE users SET
          rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE seller_id = $1), 0),
          review_count = (SELECT COUNT(*) FROM reviews WHERE seller_id = $1)
         WHERE id = $1`,
        [uid]
      );
    }
    console.log(`✓ ${reviews.length} reviews seeded`);

    console.log("\n✅ Database seeded successfully!");
    console.log(`   ${categories.length} categories | ${users.length} users | ${listings.length} listings | ${reviews.length} reviews`);
    console.log("\n   Demo login credentials:");
    console.log("   Email: alice@example.com | Password: password123");
    console.log("   Email: bob@example.com   | Password: password123");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
