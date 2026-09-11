import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/api-client-react", () => ({
  getGetConversationsQueryKey: () => ["/api/conversations"],
  getGetMessagesQueryKey: (id: number) => [`/api/conversations/${id}/messages`],
  getGetMessagesQueryOptions: (id: number, options: unknown) => ({ id, options }),
}));

import { prepareAgentChat } from "../../../marketplace/src/lib/agentChat";

function cacheFixture() {
  const cache = new Map<string, unknown>();
  const prefetchQuery = vi.fn().mockResolvedValue(undefined);
  const client = {
    setQueryData: (key: unknown, value: any) => {
      const k = JSON.stringify(key);
      cache.set(k, typeof value === "function" ? value(cache.get(k)) : value);
    },
    prefetchQuery,
  } as unknown as Parameters<typeof prepareAgentChat>[0];
  return { client, cache, prefetchQuery };
}

describe("agent chat opening bootstrap", () => {
  it("makes the real new conversation and welcome message available before navigation", () => {
    const { client, cache, prefetchQuery } = cacheFixture();
    const conversation = { id: 12, otherUserName: "Approved agent" };
    const messages = [{ id: 21, conversationId: 12, content: "Hello" }];
    prepareAgentChat(client, { conversationId: 12, isNew: true, conversation, initialMessages: messages });
    expect(cache.get('["/api/conversations"]')).toEqual([conversation]);
    expect(cache.get('["/api/conversations/12/messages"]')).toEqual(messages);
    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("preserves other conversations and does not duplicate a reopened thread", () => {
    const { client, cache, prefetchQuery } = cacheFixture();
    cache.set('["/api/conversations"]', [{ id: 12 }, { id: 14 }]);
    const history = [{ id: 21 }, { id: 22 }];
    cache.set('["/api/conversations/12/messages"]', history);
    prepareAgentChat(client, {
      conversationId: 12, isNew: false, conversation: { id: 12, otherUserName: "Agent" },
      initialMessages: [],
    });
    expect(cache.get('["/api/conversations"]')).toEqual([{ id: 12, otherUserName: "Agent" }, { id: 14 }]);
    expect(cache.get('["/api/conversations/12/messages"]')).toEqual(history);
    expect(prefetchQuery).toHaveBeenCalledOnce();
  });

  it("supports the previous API response during a rolling deploy", () => {
    const { client, cache, prefetchQuery } = cacheFixture();
    prepareAgentChat(client, { conversationId: 12, isNew: true });
    expect(cache.size).toBe(0);
    expect(prefetchQuery).toHaveBeenCalledOnce();
  });

  it("does not seed a mismatched conversation", () => {
    const { client, cache } = cacheFixture();
    prepareAgentChat(client, { conversationId: 12, conversation: { id: 999 } });
    expect(cache.has('["/api/conversations"]')).toBe(false);
  });

  it.each([0, -1, NaN, 1.2])("rejects invalid conversation id %s", (conversationId) => {
    const { client, cache, prefetchQuery } = cacheFixture();
    expect(() => prepareAgentChat(client, { conversationId })).toThrow();
    expect(cache.size).toBe(0);
    expect(prefetchQuery).not.toHaveBeenCalled();
  });
});