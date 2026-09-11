import type { QueryClient } from "@tanstack/react-query";
import {
  getGetConversationsQueryKey,
  getGetMessagesQueryKey,
  getGetMessagesQueryOptions,
} from "@workspace/api-client-react";

/** Download the lazy route while the authorized start-chat request is running. */
export function preloadAgentChat() {
  void import("@/pages/Messages").catch(() => {
    // Normal route loading remains responsible for displaying/retrying errors.
  });
}

export function prepareAgentChat(
  client: QueryClient,
  data: {
    conversationId: number;
    isNew?: boolean;
    conversation?: { id: number; [key: string]: unknown };
    initialMessages?: unknown[];
  },
) {
  if (!Number.isSafeInteger(data.conversationId) || data.conversationId <= 0) {
    throw new Error("Invalid conversation response");
  }
  if (data.conversation?.id === data.conversationId) {
    client.setQueryData(getGetConversationsQueryKey(), (old: unknown) => [
      data.conversation,
      ...(Array.isArray(old) ? old.filter(c => c.id !== data.conversationId) : []),
    ]);
  }
  // Never replace an existing history with only the automatic welcome message.
  if (data.isNew && Array.isArray(data.initialMessages)) {
    client.setQueryData(getGetMessagesQueryKey(data.conversationId), data.initialMessages);
  } else {
    void client.prefetchQuery(getGetMessagesQueryOptions(data.conversationId, {
      query: { staleTime: 15_000 },
      request: { timeoutMs: 6_000 },
    }));
  }
}