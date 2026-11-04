import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-shaped Suspense fallbacks for a desktop app-like transition.
 * Keeps the Layout chrome visible while the lazy page chunk loads.
 */
export function PageSkeleton() {
  const [location] = useLocation();
  const path = location.split("?")[0] || "/";

  if (path.startsWith("/listings/") && !path.endsWith("/video")) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8" aria-busy="true" aria-live="polite">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (path.startsWith("/messages")) {
    return (
      <div className="h-[calc(100vh-8rem)] max-w-7xl mx-auto px-2 md:px-4" aria-busy="true">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 h-full">
          <div className="hidden md:flex flex-col gap-2 border rounded-xl p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
          <div className="border rounded-xl p-4 flex flex-col gap-3">
            <Skeleton className="h-10 w-48" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-12 w-2/3 rounded-2xl" />
              <Skeleton className="h-12 w-1/2 rounded-2xl ml-auto" />
              <Skeleton className="h-12 w-3/5 rounded-2xl" />
            </div>
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (path.startsWith("/wallet")) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (path === "/search") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6" aria-busy="true">
        <Skeleton className="h-11 w-full max-w-xl mb-6 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
          <div className="hidden md:block space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Default / Home grid
  return (
    <div className="max-w-7xl mx-auto px-4 py-8" aria-busy="true" aria-live="polite">
      <Skeleton className="h-7 w-40 mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
