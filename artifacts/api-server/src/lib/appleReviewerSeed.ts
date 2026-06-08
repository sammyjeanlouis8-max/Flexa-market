/**
 * App Store Reviewer demo account seed (Apple Guideline 2.1(a)).
 *
 * Apple Review needs a pre-populated demo account so they can verify all
 * features end-to-end. We provision one at boot if it doesn't already exist
 * and refresh its password every restart so the reviewer credentials stay
 * stable across deploys. The seed is idempotent — running it multiple times
 * does not duplicate listings or chats.
 *
 * Credentials are intentionally hard-coded (not env-driven) so the value in
 * /app/memory/test_credentials.md matches whatever the running pod expects.
 * The reviewer email is non-rotatable; the password can be rotated by
 * changing REVIEWER_PASSWORD below and redeploying.
 */
import { sql, eq, and } from "drizzle-orm";
import {
  db,
  usersTable,
  listingsTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db";
import { hashPassword } from "./auth";
import { logger } from "./logger";

const REVIEWER_EMAIL = "apple.reviewer@flexamarket.com";
const REVIEWER_PASSWORD = "FlexaReview2026!";
const REVIEWER_NAME = "Apple Reviewer";

interface SeedListing {
  title: string;
  description: string;
  price: number;
  country: string;
  location: string;
  categoryId: number;
  images: string[];
}

const SEED_LISTINGS: SeedListing[] = [
  {
    title: "iPhone 14 Pro Max — 256 GB (Excellent Condition)",
    description:
      "Lightly used iPhone 14 Pro Max in Deep Purple, 256 GB storage. Battery health 94%. Comes with original box, USB-C cable, and a screen protector already applied. No scratches, fully functional, sold by verified seller in Port-au-Prince.",
    price: 749,
    country: "Haiti",
    location: "Port-au-Prince",
    categoryId: 1,
    images: [
      "https://images.unsplash.com/photo-1592286927505-2a31fc4a5b3e?w=800",
    ],
  },
  {
    title: "Honda Civic 2019 — Low Mileage, Clean Title",
    description:
      "2019 Honda Civic LX sedan, automatic transmission, 38,000 miles on the odometer. Original owner, dealer-serviced, recent oil change and tire rotation. Located in Santo Domingo. Title in hand, ready for transfer.",
    price: 14500,
    country: "Dominican Republic",
    location: "Santo Domingo",
    categoryId: 4,
    images: [
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
    ],
  },
  {
    title: "Apple MacBook Air M2 — Sealed in Box",
    description:
      "Brand new, factory-sealed Apple MacBook Air with M2 chip, 8 GB RAM, 256 GB SSD, Midnight color. Comes with 1-year Apple warranty. Bought as a gift but never opened. Ships from Miami warehouse.",
    price: 1099,
    country: "United States",
    location: "Miami, FL",
    categoryId: 1,
    images: [
      "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800",
    ],
  },
];

/**
 * Provision the Apple Review demo account.
 *
 * On every boot:
 *   1. Upsert the reviewer user (password rotated to current value).
 *   2. Ensure the three sample listings exist (idempotent on title+sellerId).
 *   3. Ensure a "seller chat" conversation exists so the reviewer can see
 *      the messaging feature with pre-populated content.
 *
 * Errors are logged but never thrown — a failed seed must not prevent the
 * server from starting.
 */
export async function seedAppleReviewerAccount(): Promise<void> {
  try {
    const email = REVIEWER_EMAIL.toLowerCase();
    const passwordHash = hashPassword(REVIEWER_PASSWORD);

    // 1) Upsert reviewer user
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));

    let reviewerId: number;
    if (existing) {
      reviewerId = existing.id;
      // Always refresh the password so the credentials in test_credentials.md
      // and App Store Connect stay in sync with the running pod.
      await db
        .update(usersTable)
        .set({
          passwordHash,
          name: REVIEWER_NAME,
          country: "Haiti",
          location: "Port-au-Prince",
          isVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, reviewerId));
      logger.info({ reviewerId }, "Apple reviewer account password refreshed");
    } else {
      const [created] = await db
        .insert(usersTable)
        .values({
          name: REVIEWER_NAME,
          email,
          passwordHash,
          country: "Haiti",
          location: "Port-au-Prince",
          isVerified: true,
          subscriptionPlan: "basic",
        })
        .returning({ id: usersTable.id });
      reviewerId = created.id;
      logger.info({ reviewerId }, "Apple reviewer account created");
    }

    // 2) Seed listings (idempotent)
    for (const seed of SEED_LISTINGS) {
      const [exists] = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(
          and(
            eq(listingsTable.sellerId, reviewerId),
            eq(listingsTable.title, seed.title),
          ),
        );
      if (exists) continue;
      await db.insert(listingsTable).values({
        title: seed.title,
        description: seed.description,
        price: seed.price,
        categoryId: seed.categoryId,
        condition: "used",
        location: seed.location,
        country: seed.country,
        images: seed.images,
        status: "available",
        sellerId: reviewerId,
      });
    }

    // 3) Seed a sample conversation with a fake buyer so reviewer can see
    //    the messaging UI with content. We use an existing non-reviewer user
    //    if available — otherwise we skip silently (still satisfies Apple
    //    Review's "demo account with content" requirement via listings alone).
    const [otherUser] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(sql`${usersTable.id} <> ${reviewerId}`)
      .limit(1);

    if (otherUser) {
      const [firstListing] = await db
        .select({ id: listingsTable.id })
        .from(listingsTable)
        .where(eq(listingsTable.sellerId, reviewerId))
        .limit(1);

      if (firstListing) {
        // Lookup an existing conversation between these two users on this
        // listing. The conversations table uses (buyerId, sellerId, listingId)
        // as the natural key in practice.
        const [conv] = await db
          .select({ id: conversationsTable.id })
          .from(conversationsTable)
          .where(
            and(
              eq(conversationsTable.buyerId, otherUser.id),
              eq(conversationsTable.sellerId, reviewerId),
              eq(conversationsTable.listingId, firstListing.id),
            ),
          )
          .limit(1);

        if (!conv) {
          const [newConv] = await db
            .insert(conversationsTable)
            .values({
              buyerId: otherUser.id,
              sellerId: reviewerId,
              listingId: firstListing.id,
            })
            .returning({ id: conversationsTable.id });

          await db.insert(messagesTable).values([
            {
              conversationId: newConv.id,
              senderId: otherUser.id,
              content: "Hi! Is this iPhone still available?",
            },
            {
              conversationId: newConv.id,
              senderId: reviewerId,
              content: "Yes! It's available. Let me know if you'd like to meet up.",
            },
          ]);
          logger.info({ reviewerId, convId: newConv.id }, "Apple reviewer demo conversation seeded");
        }
      }
    }
  } catch (err) {
    // Never fail boot — log and move on.
    logger.warn({ err }, "Apple reviewer seed had errors (non-fatal)");
  }
}
