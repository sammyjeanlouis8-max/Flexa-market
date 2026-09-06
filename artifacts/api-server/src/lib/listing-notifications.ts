import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendPushToUser } from "./push";

const DIGEST_DELAY_MS = 60_000;

type PendingDigest = {
  count: number;
  sellerNames: Set<string>;
  timer: NodeJS.Timeout;
};

const pendingDigests = new Map<number, PendingDigest>();

/**
 * Queue a push digest for a follower instead of sending one push per listing.
 * In-app notification rows remain durable and are still created immediately;
 * this queue only smooths the noisy push channel.
 */
export function queueNewListingPush(userId: number, sellerName: string): void {
  const current = pendingDigests.get(userId);
  if (current) {
    current.count += 1;
    current.sellerNames.add(sellerName);
    return;
  }

  const timer = setTimeout(() => {
    void flushNewListingPush(userId);
  }, DIGEST_DELAY_MS);

  pendingDigests.set(userId, {
    count: 1,
    sellerNames: new Set([sellerName]),
    timer,
  });
}

async function flushNewListingPush(userId: number): Promise<void> {
  const digest = pendingDigests.get(userId);
  if (!digest) return;
  pendingDigests.delete(userId);

  try {
    const [user] = await db
      .select({ notifyPush: usersTable.notifyPush })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user?.notifyPush) return;

    const names = [...digest.sellerNames];
    const sellerLabel = names.length === 1
      ? names[0]
      : `${names.length} vandè`;
    const body = digest.count === 1
      ? `${sellerLabel} ajoute yon nouvo pwodwi.`
      : `${sellerLabel} ajoute ${digest.count} nouvo pwodwi.`;

    await sendPushToUser(userId, {
      title: "Nouvo pwodwi sou Flexa Market",
      body: `${body} Louvri aplikasyon an pou wè yo.`,
      url: "/",
      tag: "new-listing-digest",
    });
  } catch (err) {
    logger.warn({ err, userId }, "[listing-notifications] digest push failed");
  }
}