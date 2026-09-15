export type PromaxPageParam = {
  page: number;
  hourKey: string | null;
  demotedIds: number[];
  demotionsPinned: boolean;
};

export type PromaxFeedPage<TListing = unknown> = {
  listings: TListing[];
  page: number;
  totalPages: number;
  promaxRotation?: {
    hourKey?: string | null;
    demotedListingIds?: number[];
    demotionsPinned?: boolean;
  };
  demotedListingIds?: number[];
};

/**
 * React Query persists pageParams/pages together. Always derive the next
 * token from that stored sequence's first page, never mutable component
 * state that can reset while a cached query is being restored.
 */
export function getPromaxNextPageParam<TListing>(
  lastPage: PromaxFeedPage<TListing>,
  allPages: PromaxFeedPage<TListing>[],
  allPageParams: PromaxPageParam[],
): PromaxPageParam | undefined {
  if (lastPage.page >= lastPage.totalPages) return undefined;
  const firstParam = allPageParams[0] as Partial<PromaxPageParam> | undefined;
  const firstHourKey = firstParam?.hourKey ?? allPages[0]?.promaxRotation?.hourKey ?? null;
  const firstDemotedIds = firstParam?.demotedIds && firstParam.demotedIds.length > 0
    ? firstParam.demotedIds
    : allPages[0]?.promaxRotation?.demotedListingIds ?? [];
  const demotionsPinned = Boolean(
    firstParam?.demotionsPinned ||
    allPages[0]?.promaxRotation?.demotionsPinned,
  );
  return { page: lastPage.page + 1, hourKey: firstHourKey, demotedIds: firstDemotedIds, demotionsPinned };
}

export function serializePromaxPageParam(param: PromaxPageParam): {
  hourKey?: string;
  demotedIds?: string;
  demotionsPinned?: "1";
} {
  return {
    ...(param.hourKey ? { hourKey: param.hourKey } : {}),
    ...(param.demotedIds.length > 0 ? { demotedIds: param.demotedIds.join(",") } : {}),
    ...(param.demotionsPinned ? { demotionsPinned: "1" as const } : {}),
  };
}