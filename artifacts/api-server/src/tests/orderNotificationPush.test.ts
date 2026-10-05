import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/push", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/expo-push", () => ({ sendExpoPushToUser: vi.fn().mockResolvedValue({}) }));

import { sendPushToUser } from "../lib/push";
import { sendExpoPushToUser } from "../lib/expo-push";
import { sendOrderPush } from "../lib/orderNotificationPush";

describe("shipment notification destinations", () => {
  it("sends the same specific order to web and existing native push channels", async () => {
    const payload = { title: "Order shipped", body: "Your package was shipped", url: "/orders/4321", tag: "order-4321" };
    await sendOrderPush(77, payload);
    expect(sendPushToUser).toHaveBeenCalledWith(77, payload);
    expect(sendExpoPushToUser).toHaveBeenCalledWith(77, {
      title: payload.title, body: payload.body, data: { url: "/orders/4321" },
      sound: "default", priority: "high", channelId: "orders",
    });
    expect(sendExpoPushToUser).toHaveBeenCalledTimes(1);
  });
});
