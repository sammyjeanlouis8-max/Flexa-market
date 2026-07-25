import { lazy, Suspense, useEffect, useRef } from "react";
import { useExpoPushToken } from "@/hooks/useExpoPushToken";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { FavoritesProvider } from "@/contexts/favorites";
import { CartProvider } from "@/contexts/cart";
import { BroadcastProvider } from "@/contexts/broadcast";
import Layout from "@/components/Layout";
import { ThemeProvider } from "@/components/theme-provider";
import DeliveryCodeAlert from "@/components/DeliveryCodeAlert";
import GlobalBroadcastPlayer from "@/components/GlobalBroadcastPlayer";

// ── All auth pages are lazy — they are visited rarely and should not bloat
// the main bundle that must download before the home page can render.
const Login            = lazy(() => import("@/pages/auth/Login"));
const LoginPhone       = lazy(() => import("@/pages/auth/LoginPhone"));
const Register         = lazy(() => import("@/pages/auth/Register"));
const ForgotPassword   = lazy(() => import("@/pages/auth/ForgotPassword"));
const SuspendedScreen  = lazy(() => import("@/pages/auth/SuspendedScreen"));
const SetNewPassword   = lazy(() => import("@/pages/auth/SetNewPassword"));

// ── Lazy-loaded pages — only downloaded when the route is visited ─────────────
const DriverSelfieMobile = lazy(() => import("@/pages/DriverSelfieMobile"));
const Home               = lazy(() => import("@/pages/Home"));
const Search             = lazy(() => import("@/pages/Search"));
const ListingDetail      = lazy(() => import("@/pages/ListingDetail"));
const Sell               = lazy(() => import("@/pages/Sell"));
const Messages           = lazy(() => import("@/pages/Messages"));
const Offers             = lazy(() => import("@/pages/Offers"));
const Saved              = lazy(() => import("@/pages/Saved"));
const Jobs               = lazy(() => import("@/pages/Jobs"));
const Profile            = lazy(() => import("@/pages/Profile"));
const EditProfile        = lazy(() => import("@/pages/EditProfile"));
const Boost              = lazy(() => import("@/pages/Boost"));
const Sales              = lazy(() => import("@/pages/Sales"));
const Orders             = lazy(() => import("@/pages/Orders"));
const OrderDetail        = lazy(() => import("@/pages/OrderDetail"));
const OrderLabel         = lazy(() => import("@/pages/OrderLabel"));
const Admin              = lazy(() => import("@/pages/Admin"));
const Settings           = lazy(() => import("@/pages/Settings"));
const SettingsSecurity   = lazy(() => import("@/pages/SettingsSecurity"));
const SettingsNotifications = lazy(() => import("@/pages/SettingsNotifications"));
const SettingsPreferences   = lazy(() => import("@/pages/SettingsPreferences"));
const SettingsHelp       = lazy(() => import("@/pages/SettingsHelp"));
const Support            = lazy(() => import("@/pages/Support"));
const Chatbot            = lazy(() => import("@/pages/Chatbot"));
const CalculatorPage     = lazy(() => import("@/pages/Calculator"));
const WalletPage         = lazy(() => import("@/pages/Wallet"));
const WalletHistory      = lazy(() => import("@/pages/WalletHistory"));
const FlexCardRepay      = lazy(() => import("@/pages/FlexCardRepay"));
const AgentDashboard     = lazy(() => import("@/pages/AgentDashboard"));
const CheckoutSuccess    = lazy(() => import("@/pages/CheckoutSuccess"));
const StripeOnboardReturn = lazy(() => import("@/pages/StripeOnboardReturn"));
const SubscriptionPage   = lazy(() => import("@/pages/Subscription"));
const VideoPost          = lazy(() => import("@/pages/VideoPost"));
const VideoFeed          = lazy(() => import("@/pages/VideoFeed"));
const MyBoosts           = lazy(() => import("@/pages/MyBoosts"));
const PrivacyPolicy      = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService     = lazy(() => import("@/pages/TermsOfService"));
const About              = lazy(() => import("@/pages/About"));
const Contact            = lazy(() => import("@/pages/Contact"));
const DeleteAccount      = lazy(() => import("@/pages/DeleteAccount"));
const CommunityGuidelines = lazy(() => import("@/pages/CommunityGuidelines"));
const RefundPolicy       = lazy(() => import("@/pages/RefundPolicy"));
const SellerPolicy       = lazy(() => import("@/pages/SellerPolicy"));
const ShippingPolicy     = lazy(() => import("@/pages/ShippingPolicy"));
const Cookies            = lazy(() => import("@/pages/Cookies"));
const Safety             = lazy(() => import("@/pages/Safety"));
const TrustCenter        = lazy(() => import("@/pages/TrustCenter"));
const ProhibitedItems    = lazy(() => import("@/pages/ProhibitedItems"));
const ContentPolicy      = lazy(() => import("@/pages/ContentPolicy"));
const ReportAbuse        = lazy(() => import("@/pages/ReportAbuse"));
const IntellectualProperty = lazy(() => import("@/pages/IntellectualProperty"));
const DataDeletion       = lazy(() => import("@/pages/DataDeletion"));
const Eula               = lazy(() => import("@/pages/Eula"));
const Dmca               = lazy(() => import("@/pages/Dmca"));
const Accessibility      = lazy(() => import("@/pages/Accessibility"));
const HelpCenter         = lazy(() => import("@/pages/HelpCenter"));
const FAQ                = lazy(() => import("@/pages/FAQ"));
const KYCVerification    = lazy(() => import("@/pages/KYCVerification"));
const ApplyForDriver        = lazy(() => import("@/pages/ApplyForDriver"));
const AvailableDeliveries   = lazy(() => import("@/pages/AvailableDeliveries"));
const DeliveryTracking      = lazy(() => import("@/pages/DeliveryTracking"));
const DriverSuspensionPage  = lazy(() => import("@/pages/DriverSuspensionPage"));
const WalletTransfer        = lazy(() => import("@/pages/WalletTransfer"));
const AgentApplication               = lazy(() => import("@/pages/AgentApplication"));
const AgentDirectory                 = lazy(() => import("@/pages/AgentDirectory"));
const AdminDriverApplicationsPage    = lazy(() => import("@/pages/AdminDriverApplicationsPage"));
const AdminAgentApplicationsPage     = lazy(() => import("@/pages/AdminAgentApplicationsPage"));
const AdminVehiclePanel              = lazy(() => import("@/pages/AdminVehiclePanel"));
const AdminDriversLiveMap            = lazy(() => import("@/pages/AdminDriversLiveMap"));
const DriverDashboard                = lazy(() => import("@/pages/DriverDashboard"));
const DriverApplicationStatus        = lazy(() => import("@/pages/DriverApplicationStatus"));
const Cart                           = lazy(() => import("@/pages/Cart"));
const LoanPage                       = lazy(() => import("@/pages/LoanPage"));
const AdminLoanPanel                 = lazy(() => import("@/pages/AdminLoanPanel"));
const AdminFraudPanel                = lazy(() => import("@/pages/AdminFraudPanel"));
const AdminDeliveriesPage            = lazy(() => import("@/pages/AdminDeliveriesPage"));
const CreditScorePage                = lazy(() => import("@/pages/CreditScorePage"));
const BNPLPage                       = lazy(() => import("@/pages/BNPLPage"));
const Leaderboard                    = lazy(() => import("@/pages/Leaderboard"));
const FlexaTV                        = lazy(() => import("@/pages/FlexaTV"));
const AdminTV                        = lazy(() => import("@/pages/AdminTV"));

// ── Query client ──────────────────────────────────────────────────────────────
// Retry up to 3 times for server errors (502/503/504) which happen during
// Render deployments while the new instance is warming up.  Don't retry
// on 4xx client errors (bad request, auth, etc.) — those won't self-heal.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  const status = (error as any)?.status ?? (error as any)?.response?.status;
  if (status && status < 500) return false; // 4xx → no retry
  return true; // network error or 5xx → retry
}

// Exponential back-off: 1 s, 4 s, 9 s (capped at 10 s)
function retryDelay(attempt: number): number {
  return Math.min(1_000 * attempt ** 2, 10_000);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60_000,    // 3 min — data stays "fresh"; repeat visits feel instant
      gcTime: 20 * 60_000,      // 20 min — keep unused data in memory across navigation
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: false,
      networkMode: "always",    // never pause queries on offline-detection false-positives
    },
    mutations: {
      retry: (failureCount, error) => shouldRetry(failureCount, error),
      retryDelay,
    },
  },
});

// Apply saved theme immediately before React renders to avoid flash.
(function applyStoredTheme() {
  try {
    const saved = localStorage.getItem("flexamarket_theme");
    document.documentElement.classList.toggle("dark", saved === "dark");
  } catch { /* non-critical */ }
})();

// ── Redirect any unknown route to home ────────────────────────────────────────
function RedirectHome() {
  const [, nav] = useLocation();
  useEffect(() => { nav("/"); }, []);
  return null;
}

// ── Page skeleton shown while a lazy chunk is loading ─────────────────────────
function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-7 bg-muted rounded w-40 mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Routed layout (authenticated + public pages) ───────────────────────────────
function LayoutRoutes() {
  const [, setLocation] = useLocation();
  return (
    <Layout>
      <DeliveryCodeAlert />
      <Suspense fallback={<PageSkeleton />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/search" component={Search} />
          <Route path="/listings/create">
            {() => { setLocation("/sell"); return null; }}
          </Route>
          <Route path="/videos" component={VideoFeed} />
          <Route path="/my-boosts" component={MyBoosts} />
          <Route path="/listings/:id/video" component={VideoPost} />
          <Route path="/listings/:id" component={ListingDetail} />
          <Route path="/sell" component={Sell} />
          <Route path="/messages" component={Messages} />
          <Route path="/messages/:id" component={Messages} />
          <Route path="/offers" component={Offers} />
          <Route path="/saved" component={Saved} />
          <Route path="/jobs" component={Jobs} />
          <Route path="/profile/edit" component={EditProfile} />
          <Route path="/profile/:id" component={Profile} />
          <Route path="/boost/:listingId" component={Boost} />
          <Route path="/sales" component={Sales} />
          <Route path="/orders" component={Orders} />
          <Route path="/orders/:id/label" component={OrderLabel} />
          <Route path="/orders/:id" component={OrderDetail} />
          <Route path="/driver/dashboard" component={DriverDashboard} />
          <Route path="/driver/status" component={DriverApplicationStatus} />
          <Route path="/admin/deliveries" component={AdminDeliveriesPage} />
              <Route path="/admin/driver-applications" component={AdminDriverApplicationsPage} />
          <Route path="/admin/agent-applications" component={AdminAgentApplicationsPage} />
          <Route path="/admin" component={Admin} />
          <Route path="/settings" component={Settings} />
          <Route path="/settings/security" component={SettingsSecurity} />
          <Route path="/settings/notifications" component={SettingsNotifications} />
          <Route path="/settings/preferences" component={SettingsPreferences} />
          <Route path="/settings/help" component={SettingsHelp} />
          <Route path="/support" component={Support} />
          <Route path="/support/:id" component={Support} />
          <Route path="/wallet" component={WalletPage} />
          <Route path="/wallet/history" component={WalletHistory} />
          <Route path="/subscription" component={SubscriptionPage} />
          <Route path="/agent" component={AgentDashboard} />
          <Route path="/chatbot" component={Chatbot} />
          <Route path="/calculator" component={CalculatorPage} />
          <Route path="/checkout/success" component={CheckoutSuccess} />
          <Route path="/kyc" component={KYCVerification} />
          <Route path="/settings/stripe-return" component={StripeOnboardReturn} />
          <Route path="/settings/stripe-refresh" component={StripeOnboardReturn} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/terms" component={TermsOfService} />
          <Route path="/about" component={About} />
          <Route path="/contact" component={Contact} />
          <Route path="/delete-account" component={DeleteAccount} />
          <Route path="/community-guidelines" component={CommunityGuidelines} />
          <Route path="/refund-policy" component={RefundPolicy} />
          <Route path="/seller-policy" component={SellerPolicy} />
          <Route path="/shipping-policy" component={ShippingPolicy} />
          <Route path="/cookies" component={Cookies} />
          <Route path="/safety" component={Safety} />
          <Route path="/trust-center" component={TrustCenter} />
          <Route path="/prohibited-items" component={ProhibitedItems} />
          <Route path="/content-policy" component={ContentPolicy} />
          <Route path="/report-abuse" component={ReportAbuse} />
          <Route path="/intellectual-property" component={IntellectualProperty} />
          <Route path="/data-deletion" component={DataDeletion} />
          <Route path="/eula" component={Eula} />
          <Route path="/dmca" component={Dmca} />
          <Route path="/accessibility" component={Accessibility} />
          <Route path="/help-center" component={HelpCenter} />
          <Route path="/faq" component={FAQ} />
          <Route path="/delivery/apply" component={ApplyForDriver} />
          <Route path="/delivery/deliveries" component={AvailableDeliveries} />
          <Route path="/cart" component={Cart} />
          <Route path="/loans" component={LoanPage} />
          <Route path="/admin/loans" component={AdminLoanPanel} />
          <Route path="/admin/fraud" component={AdminFraudPanel} />
          <Route path="/credit-score" component={CreditScorePage} />
          <Route path="/delivery/tracking/:id" component={DeliveryTracking} />
          <Route path="/delivery/suspended" component={DriverSuspensionPage} />
          <Route path="/wallet/transfer" component={WalletTransfer} />
          <Route path="/flex-card/repay" component={FlexCardRepay} />
          <Route path="/bnpl" component={BNPLPage} />
          <Route path="/wallet/agents" component={AgentDirectory} />
          <Route path="/agents/apply" component={AgentApplication} />
          <Route path="/admin/vehicles" component={AdminVehiclePanel} />
          <Route path="/admin/drivers/live" component={AdminDriversLiveMap} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/tv" component={FlexaTV} />
          <Route path="/admin/tv" component={AdminTV} />
          <Route component={RedirectHome} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

// ── Root router ───────────────────────────────────────────────────────────────
// The app renders IMMEDIATELY — no fullscreen spinner blocks the UI.
// Auth state loads in the background; pages handle the unauthenticated state
// gracefully (show skeleton / guest view) until the user data arrives.
function Router() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  useExpoPushToken();

  // Scroll to top instantly on genuine navigation (not on initial mount)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);

  // Redirect to profile completion only after auth has settled
  useEffect(() => {
    if (!isLoading && user && user.profileCompleted === false && location !== "/profile/edit") {
      setLocation("/profile/edit");
    }
  }, [user, isLoading, location, setLocation]);

  // Brief null guard: prevents a flash of the current page while the redirect
  // to /profile/edit is in flight (one render cycle after auth resolves).
  if (!isLoading && user && user.profileCompleted === false && location !== "/profile/edit") {
    return null;
  }

  return (
    <Switch>
      <Route path="/auth/login" component={Login} />
      <Route path="/auth/login-phone" component={LoginPhone} />
      <Route path="/auth/register" component={Register} />
      <Route path="/auth/forgot-password" component={ForgotPassword} />
      <Route path="/auth/suspended" component={SuspendedScreen} />
      <Route path="/auth/set-new-password" component={SetNewPassword} />
      <Route path="/driver-selfie" component={DriverSelfieMobile} />
      <Route>{() => <LayoutRoutes />}</Route>
    </Switch>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider storageKey="flexamarket_theme" defaultTheme="light">
          <AuthProvider>
            <CartProvider>
            <FavoritesProvider>
              <BroadcastProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router />
                  <GlobalBroadcastPlayer />
                </WouterRouter>
              </BroadcastProvider>
              <Toaster />
            </FavoritesProvider>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
