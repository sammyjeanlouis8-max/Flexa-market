import { sendPushToUser } from "./push";
import { sendExpoPushToUser } from "./expo-push";

/** Preserve the same order destination across web, Android and existing APNs tokens. */
export async function sendOrderPush(userId: number, payload: {
  title: string; body: string; url: string; tag: string;
}): Promise<void> {
  await Promise.all([
    sendPushToUser(userId, payload),
    sendExpoPushToUser(userId, {
      title: payload.title,
      body: payload.body,
      data: { url: payload.url },
      sound: "default",
      priority: "high",
      channelId: "orders",
    }),
  ]);
}
