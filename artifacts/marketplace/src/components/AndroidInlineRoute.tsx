import { useEffect, useMemo, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AndroidInlineRouteContext } from "@/contexts/android-inline-route";

type InlineLocation = ReturnType<typeof memoryLocation<unknown>>;

function InlinePage({
  initialPath,
  location,
  routes,
  onClose,
  getTitle,
}: {
  initialPath: string;
  location: InlineLocation;
  routes: ReactNode;
  onClose: () => void;
  getTitle: (path: string) => string;
}) {
  const [path] = useLocation();

  useEffect(() => {
    // Logins and in-page links can return to Home without touching the real
    // WebView history. Unmount the inline page when that happens.
    if (initialPath !== "/" && path === "/") onClose();
  }, [initialPath, path, onClose]);

  const goBack = () => {
    const previous = location.history?.at(-2);
    // A guest page may redirect to sign-in. Going back to that protected
    // page would immediately redirect again, trapping the back button.
    if (!previous || (path.startsWith("/auth/") && !previous.startsWith("/auth/"))) {
      onClose();
      return;
    }
    location.history?.pop();
    location.navigate(previous, { replace: true });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={getTitle(path) || "Flexa Market"}
      data-testid="android-inline-route"
    >
      <div className="z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
        <button
          type="button"
          aria-label="Retounen"
          data-testid="android-inline-back"
          onClick={goBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="truncate font-semibold">{getTitle(path) || "Flexa Market"}</span>
      </div>
      <main className="app-main-scroll min-h-0 flex-1 overflow-y-auto">
        {routes}
      </main>
    </div>
  );
}

export default function AndroidInlineRoute({
  path,
  routes,
  onClose,
  getTitle,
}: {
  path: string;
  routes: ReactNode;
  onClose: () => void;
  getTitle: (path: string) => string;
}) {
  const location = useMemo(() => memoryLocation({ path, record: true }), [path]);

  return (
    <AndroidInlineRouteContext.Provider value={true}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <InlinePage
          initialPath={path}
          location={location}
          routes={routes}
          onClose={onClose}
          getTitle={getTitle}
        />
      </Router>
    </AndroidInlineRouteContext.Provider>
  );
}