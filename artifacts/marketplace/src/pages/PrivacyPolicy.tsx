import { Link } from "wouter";
import { ArrowLeft, Shield, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";

const CONTACT_EMAIL = "support@flexamarket.com";
const EFFECTIVE_DATE = "May 1, 2025";
const APP_NAME = "FLEXA MARKET";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2">
        <span className="inline-block w-1 h-5 rounded-full bg-primary shrink-0" />
        {title}
      </h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2 pl-3">
        {children}
      </div>
    </section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  const toc = [
    { id: "data-collection", label: "Data We Collect" },
    { id: "user-accounts", label: "User Accounts" },
    { id: "seller-accounts", label: "Seller Accounts" },
    { id: "payments", label: "Payments & Transactions" },
    { id: "messages", label: "Messages & Chat" },
    { id: "location", label: "Location Usage" },
    { id: "cookies", label: "Cookies & Tracking" },
    { id: "data-sharing", label: "Data Sharing" },
    { id: "user-rights", label: "Your Rights" },
    { id: "data-retention", label: "Data Retention" },
    { id: "account-deletion", label: "Account Deletion" },
    { id: "children", label: "Children's Privacy" },
    { id: "changes", label: "Policy Changes" },
    { id: "contact", label: "Contact Us" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-20">
      {/* Back button */}
      <Link href="/">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />
          {t("buttons.back", { defaultValue: "Back" })}
        </button>
      </Link>

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6 mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-primary/15">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">{APP_NAME}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Effective date:</strong> {EFFECTIVE_DATE}
          {" · "}
          <strong className="text-foreground">Last updated:</strong> {EFFECTIVE_DATE}
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {APP_NAME} ("we," "us," or "our") is committed to protecting your personal information.
          This Privacy Policy explains how we collect, use, share, and protect your data when you
          use our marketplace platform, mobile apps, and related services (collectively, the "Service").
        </p>
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-8">
        {/* Table of contents — sticky on desktop */}
        <aside className="hidden md:block">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contents</p>
            <nav className="space-y-1.5">
              {toc.map((item, i) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors py-0.5"
                >
                  <span className="text-xs text-muted-foreground/60 w-4 shrink-0">{i + 1}.</span>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="space-y-10">

          <Section id="data-collection" title="1. Data We Collect">
            <p>We collect information you provide directly, automatically, or from third parties:</p>
            <ul className="space-y-1.5 mt-2">
              <Li><strong className="text-foreground">Identity data:</strong> full name, username, profile photo, date of birth.</Li>
              <Li><strong className="text-foreground">Contact data:</strong> email address, phone number, country.</Li>
              <Li><strong className="text-foreground">Location data:</strong> city, region, country; optional precise GPS coordinates for nearby listings.</Li>
              <Li><strong className="text-foreground">Listing data:</strong> product titles, descriptions, images, videos, prices, and categories you post.</Li>
              <Li><strong className="text-foreground">Transaction data:</strong> purchase history, payment status, escrow records.</Li>
              <Li><strong className="text-foreground">Communication data:</strong> messages exchanged between buyers and sellers on the platform.</Li>
              <Li><strong className="text-foreground">Device & technical data:</strong> IP address, browser type, device fingerprint, operating system, language preference.</Li>
              <Li><strong className="text-foreground">Usage data:</strong> pages viewed, search queries, listing clicks, boost impressions, time on site.</Li>
              <Li><strong className="text-foreground">Verification data:</strong> OTP-verified phone number; government ID if identity verification is requested.</Li>
            </ul>
          </Section>

          <Section id="user-accounts" title="2. User Accounts">
            <p>When you create an account, we collect your name, email address, phone number, and country. We use this information to:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>Authenticate your identity and secure your account with OTP phone verification.</Li>
              <Li>Personalize your marketplace experience (country-based listings, language preference).</Li>
              <Li>Send transactional notifications: new messages, order updates, boost status, security alerts.</Li>
              <Li>Enforce our community standards and detect fraudulent or suspicious activity.</Li>
              <Li>Calculate and display a risk score visible only to platform administrators.</Li>
            </ul>
            <p className="mt-2">
              Your password is hashed using a cryptographic algorithm and is never stored in plain text.
              We do not have access to your password. If you use phone-based OTP login, no password is stored.
            </p>
          </Section>

          <Section id="seller-accounts" title="3. Seller Accounts">
            <p>Sellers have access to additional features and share additional data:</p>
            <ul className="space-y-1.5 mt-2">
              <Li><strong className="text-foreground">Payout information:</strong> MonCash number or bank account details for receiving earnings. This data is encrypted at rest and visible only to verified administrators.</Li>
              <Li><strong className="text-foreground">Listing analytics:</strong> view count, favorite count, share count, and boost impression data.</Li>
              <Li><strong className="text-foreground">Subscription plan:</strong> Basic, Standard, Premium, or VIP — linked to Stripe for recurring billing.</Li>
              <Li><strong className="text-foreground">Vendor identity:</strong> store name, verified badge status, seller rating and reviews submitted by buyers.</Li>
              <Li><strong className="text-foreground">Referral codes:</strong> your unique referral link and referral activity (who signed up, bonus earned).</Li>
            </ul>
            <p className="mt-2">
              Payout account details are never displayed publicly and are used solely for processing approved withdrawals.
            </p>
          </Section>

          <Section id="payments" title="4. Payments & Transactions">
            <p>We process payments through the following providers:</p>
            <ul className="space-y-1.5 mt-2">
              <Li><strong className="text-foreground">Stripe:</strong> card payments, subscription billing, and Stripe Checkout. Stripe stores and processes card data directly — we never receive or store raw card numbers. Stripe's privacy policy applies.</Li>
              <Li><strong className="text-foreground">MonCash:</strong> mobile money payments for Haitian users. MonCash OTP is verified via Twilio SMS.</Li>
              <Li><strong className="text-foreground">USDT (crypto):</strong> we record the transaction hash submitted by the buyer for admin verification.</Li>
              <Li><strong className="text-foreground">Escrow:</strong> funds are held in our platform wallet until delivery is confirmed. We store transaction records for accounting and dispute resolution.</Li>
              <Li><strong className="text-foreground">Promo wallet:</strong> referral bonuses and loyalty credits are recorded in our internal ledger.</Li>
            </ul>
            <p className="mt-2">
              All financial transactions are logged for fraud prevention, regulatory compliance, and dispute resolution.
              We retain payment records for a minimum of 5 years as required by applicable law.
            </p>
          </Section>

          <Section id="messages" title="5. Messages & Chat">
            <p>
              The {APP_NAME} platform includes a real-time messaging system between buyers and sellers.
              Messages are stored on our servers to provide conversation history and are accessible to
              both parties in the conversation.
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Messages are stored to allow conversation history across sessions and devices.</Li>
              <Li>Administrators may access messages when investigating reported abuse, fraud, or safety violations.</Li>
              <Li>You may send text messages, images, and short videos. Voice messages are not supported.</Li>
              <Li>Do not share sensitive personal information (passwords, full payment card numbers) via messages.</Li>
              <Li>AI-powered ZenoBot support chat is available; conversations with ZenoBot are used to improve support quality.</Li>
            </ul>
          </Section>

          <Section id="location" title="6. Location Usage">
            <p>
              {APP_NAME} uses location data to show you relevant local listings and to enforce country-based content filtering.
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li><strong className="text-foreground">Country selection:</strong> required at signup. You may change your country once every 30 days, subject to re-verification.</Li>
              <Li><strong className="text-foreground">City/region:</strong> optional. Used to display listings near you and to target boosted ads by geography.</Li>
              <Li><strong className="text-foreground">Precise GPS:</strong> only used if you explicitly grant location permission in your browser or app. Used for proximity sorting of nearby listings.</Li>
              <Li><strong className="text-foreground">IP geolocation:</strong> your approximate location may be inferred from your IP address for fraud detection and content localization.</Li>
            </ul>
            <p className="mt-2">
              You can disable precise location access in your device or browser settings at any time.
              Disabling location access does not affect your ability to use the platform.
            </p>
          </Section>

          <Section id="cookies" title="7. Cookies & Tracking">
            <p>We use the following technologies to operate and improve the Service:</p>
            <ul className="space-y-1.5 mt-2">
              <Li><strong className="text-foreground">Session tokens:</strong> JWT tokens stored in <code className="bg-muted px-1 py-0.5 rounded text-xs">localStorage</code> to keep you signed in.</Li>
              <Li><strong className="text-foreground">Theme preference:</strong> dark/light mode is saved locally in <code className="bg-muted px-1 py-0.5 rounded text-xs">localStorage</code>.</Li>
              <Li><strong className="text-foreground">Language preference:</strong> stored in your account and locally for fast rendering.</Li>
              <Li><strong className="text-foreground">Analytics:</strong> we may collect aggregated, anonymized usage statistics to improve the platform.</Li>
              <Li><strong className="text-foreground">Stripe:</strong> Stripe may set cookies for fraud detection when you complete a payment.</Li>
            </ul>
            <p className="mt-2">
              We do not use third-party advertising cookies. We do not sell data to ad networks.
            </p>
          </Section>

          <Section id="data-sharing" title="8. Data Sharing">
            <p>We do not sell your personal information. We may share data with:</p>
            <ul className="space-y-1.5 mt-2">
              <Li><strong className="text-foreground">Payment processors:</strong> Stripe and MonCash, solely for processing payments.</Li>
              <Li><strong className="text-foreground">SMS providers:</strong> Twilio, for OTP verification messages.</Li>
              <Li><strong className="text-foreground">Cloud infrastructure:</strong> Replit and Neon (PostgreSQL), for hosting and database services. These providers process data under data processing agreements.</Li>
              <Li><strong className="text-foreground">AI services:</strong> Anthropic (Claude), for powering ZenoBot customer support. Conversation snippets may be sent to Anthropic's API.</Li>
              <Li><strong className="text-foreground">Law enforcement:</strong> if required by valid legal process, court order, or to protect the safety of our users.</Li>
              <Li><strong className="text-foreground">Business transfers:</strong> in the event of a merger, acquisition, or sale of assets, your data may be transferred to the acquiring entity.</Li>
            </ul>
          </Section>

          <Section id="user-rights" title="9. Your Rights">
            <p>Depending on your jurisdiction, you have the right to:</p>
            <ul className="space-y-1.5 mt-2">
              <Li><strong className="text-foreground">Access:</strong> request a copy of the personal data we hold about you.</Li>
              <Li><strong className="text-foreground">Correction:</strong> update or correct inaccurate information via your account Settings.</Li>
              <Li><strong className="text-foreground">Deletion:</strong> request deletion of your account and associated data (see Section 11).</Li>
              <Li><strong className="text-foreground">Portability:</strong> request your data in a machine-readable format.</Li>
              <Li><strong className="text-foreground">Opt-out of marketing:</strong> unsubscribe from promotional notifications via Settings → Notifications.</Li>
              <Li><strong className="text-foreground">Restrict processing:</strong> in certain circumstances, request that we limit how we use your data.</Li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>. We respond to all requests within 30 days.
            </p>
          </Section>

          <Section id="data-retention" title="10. Data Retention">
            <ul className="space-y-1.5">
              <Li>Active account data is retained for as long as your account is open.</Li>
              <Li>Transaction and payment records are retained for a minimum of 5 years.</Li>
              <Li>Messages are retained until you or the other party deletes the conversation, or until your account is deleted.</Li>
              <Li>Logs and analytics data are retained for up to 12 months.</Li>
              <Li>After account deletion, backups may retain your data for up to 90 days before purging.</Li>
            </ul>
          </Section>

          <Section id="account-deletion" title="11. Account Deletion">
            <p>You may delete your account at any time:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>Go to <strong className="text-foreground">Settings → Security → Delete Account</strong>.</Li>
              <Li>Or email us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a> with subject "Account Deletion Request."</Li>
            </ul>
            <p className="mt-2">
              Upon deletion: your profile becomes invisible, your active listings are unpublished, and your
              personal data is permanently removed from our live database within 30 days.
              Financial records required by law are retained separately for the legally mandated period.
              Any pending escrow funds will be processed before deletion is finalized.
            </p>
          </Section>

          <Section id="children" title="12. Children's Privacy">
            <p>
              {APP_NAME} is not directed at children under the age of 13 (or 16 in the European Economic Area).
              We do not knowingly collect personal information from children. If you believe a child has
              provided us with their information, please contact us immediately and we will delete it promptly.
            </p>
          </Section>

          <Section id="changes" title="13. Policy Changes">
            <p>
              We may update this Privacy Policy periodically to reflect changes in our practices or applicable law.
              We will notify you of material changes by posting a notice in the app and/or sending an email
              to the address associated with your account. Continued use of the Service after the effective
              date of any changes constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section id="contact" title="14. Contact Us">
            <p>For privacy-related questions, requests, or complaints, please contact:</p>
            <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="font-semibold text-foreground">{APP_NAME} — Privacy Team</p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Mail className="h-4 w-4" />
                {CONTACT_EMAIL}
              </a>
              <p className="text-xs text-muted-foreground pt-1">
                We aim to respond to all privacy inquiries within 30 days.
              </p>
            </div>
          </Section>

          {/* Bottom nav */}
          <div className="pt-6 border-t border-border flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-4">
              <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
              <Link href="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
