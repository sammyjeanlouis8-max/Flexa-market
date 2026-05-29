import { Link } from "wouter";
import { ArrowLeft, FileText, Mail } from "lucide-react";
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

export default function TermsOfService() {
  const { t } = useTranslation();

  const toc = [
    { id: "acceptance", label: "Acceptance of Terms" },
    { id: "eligibility", label: "Eligibility" },
    { id: "accounts", label: "Accounts & Registration" },
    { id: "marketplace", label: "Marketplace Rules" },
    { id: "listings", label: "Listing Policies" },
    { id: "payments", label: "Payments & Fees" },
    { id: "prohibited", label: "Prohibited Conduct" },
    { id: "boosts", label: "Boost & Advertising" },
    { id: "jobs", label: "Jobs (Djòb)" },
    { id: "subscriptions", label: "Vendor Subscriptions" },
    { id: "ip", label: "Intellectual Property" },
    { id: "liability", label: "Limitation of Liability" },
    { id: "termination", label: "Termination" },
    { id: "disputes", label: "Dispute Resolution" },
    { id: "changes", label: "Changes to Terms" },
    { id: "contact", label: "Contact" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-20">
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
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Terms of Service</h1>
            <p className="text-sm text-muted-foreground">{APP_NAME}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Effective date:</strong> {EFFECTIVE_DATE}
          {" · "}
          <strong className="text-foreground">Last updated:</strong> {EFFECTIVE_DATE}
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          These Terms of Service ("Terms") govern your use of {APP_NAME} and all related services.
          By creating an account or using our platform, you agree to be bound by these Terms.
          Please read them carefully.
        </p>
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-8">
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

        <main className="space-y-10">

          <Section id="acceptance" title="1. Acceptance of Terms">
            <p>
              By accessing or using {APP_NAME} ("Service," "platform," "we," "us"), you confirm that you
              have read, understood, and agree to be bound by these Terms and our{" "}
              <Link href="/privacy-policy" className="text-primary underline underline-offset-2">Privacy Policy</Link>.
              If you do not agree, you must not use the Service.
            </p>
          </Section>

          <Section id="eligibility" title="2. Eligibility">
            <ul className="space-y-1.5">
              <Li>You must be at least 18 years old to create an account and use the Service.</Li>
              <Li>If you are between 13 and 17, you may only use the Service with verifiable parental consent.</Li>
              <Li>You must be legally permitted to use online marketplace services in your country of residence.</Li>
              <Li>You may not create more than one personal account. Additional accounts may be terminated without notice.</Li>
            </ul>
          </Section>

          <Section id="accounts" title="3. Accounts & Registration">
            <p>When registering, you agree to:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>Provide accurate, current, and complete information.</Li>
              <Li>Verify your phone number via OTP as part of account setup.</Li>
              <Li>Keep your login credentials confidential and not share your account with others.</Li>
              <Li>Notify us immediately of any unauthorized access to your account.</Li>
              <Li>Complete your profile (country, name, photo) as required by our mandatory profile completion policy.</Li>
            </ul>
            <p className="mt-2">
              We reserve the right to suspend or terminate accounts that violate these Terms, contain false information,
              or are associated with fraudulent activity.
            </p>
          </Section>

          <Section id="marketplace" title="4. Marketplace Rules">
            <p>{APP_NAME} is a peer-to-peer marketplace. We are not a party to any transaction between buyers and sellers. By using the marketplace, you agree that:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>All transactions are between users — {APP_NAME} is not responsible for the actions of other users.</Li>
              <Li>Listings and communications must comply with the laws of the country where the listing is posted.</Li>
              <Li>Country-based filtering is enforced: your listings and feed are scoped to your registered country. Country changes are limited to once every 30 days.</Li>
              <Li>Escrow services are provided for eligible purchases. Release of funds follows the escrow policy (delivery confirmation or auto-release timers).</Li>
              <Li>Ratings and reviews must be honest and based on genuine transactions.</Li>
            </ul>
          </Section>

          <Section id="listings" title="5. Listing Policies">
            <p>All listings are subject to moderation review. You may not post:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>Illegal, counterfeit, stolen, or dangerous goods.</Li>
              <Li>Weapons, explosives, drugs, or controlled substances.</Li>
              <Li>Adult content, pornographic material, or sexually exploitative content.</Li>
              <Li>Living animals, endangered species, or any item subject to CITES restrictions.</Li>
              <Li>Financial instruments, currency, or investment products without proper licensing.</Li>
              <Li>Content that infringes third-party intellectual property rights.</Li>
              <Li>False, misleading, or deceptive listings.</Li>
            </ul>
            <p className="mt-2">
              Listings violating these policies will be removed and the account may be suspended.
              Repeat violations result in permanent termination.
            </p>
          </Section>

          <Section id="payments" title="6. Payments & Fees">
            <ul className="space-y-1.5">
              <Li><strong className="text-foreground">Platform commission:</strong> {APP_NAME} may charge a commission on completed transactions, disclosed at checkout.</Li>
              <Li><strong className="text-foreground">Boost fees:</strong> paid advertising boosts are non-refundable once the campaign has started.</Li>
              <Li><strong className="text-foreground">Subscription fees:</strong> vendor subscription plans are billed monthly via Stripe. Cancellation takes effect at the end of the billing period.</Li>
              <Li><strong className="text-foreground">Wallet credits:</strong> promotional balance credits cannot be withdrawn to external accounts; they can only be used for boosts.</Li>
              <Li><strong className="text-foreground">Escrow:</strong> funds held in escrow are released upon confirmed delivery or per the auto-release schedule.</Li>
              <Li><strong className="text-foreground">Refunds:</strong> refunds on purchases are subject to seller agreement and our dispute resolution process. Stripe and MonCash payment processing fees may be non-recoverable.</Li>
            </ul>
          </Section>

          <Section id="prohibited" title="7. Prohibited Conduct">
            <p>You may not:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>Harass, threaten, or abuse other users on or off the platform.</Li>
              <Li>Attempt to circumvent platform fees by conducting transactions outside {APP_NAME}.</Li>
              <Li>Create fake reviews, manipulate ratings, or use bots/automation.</Li>
              <Li>Scrape, crawl, or extract data from the platform without written permission.</Li>
              <Li>Attempt to reverse engineer, hack, or disrupt the platform or its services.</Li>
              <Li>Use the platform to launder money, fund terrorism, or engage in financial fraud.</Li>
              <Li>Impersonate another person, business, or government entity.</Li>
              <Li>Use multiple accounts to evade bans or restrictions.</Li>
            </ul>
            <p className="mt-2">
              Violation of these rules may result in immediate account termination and reporting to law enforcement authorities.
            </p>
          </Section>

          <Section id="boosts" title="8. Boost & Advertising">
            <ul className="space-y-1.5">
              <Li>Boosted listings are subject to our content moderation standards.</Li>
              <Li>Boost fees are charged based on the selected plan (daily budget, duration, audience).</Li>
              <Li>Active boosts are non-refundable. Pending boosts awaiting admin approval may be cancelled for a full refund.</Li>
              <Li>Boost targeting is restricted to the seller's country — cross-country advertising is not permitted.</Li>
              <Li>Promotional video content in boosts must not contain misleading claims, adult content, or third-party copyrighted material.</Li>
            </ul>
          </Section>

          <Section id="jobs" title="9. Jobs (Djòb)">
            <p>The Jobs feature allows users to post and claim peer-to-peer job opportunities:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>Job posts must be for legitimate work opportunities. Pyramid schemes, MLM recruiting, or fraudulent job offers are prohibited.</Li>
              <Li>A posting fee applies to job listings as displayed at time of posting.</Li>
              <Li>{APP_NAME} is not an employer, staffing agency, or party to any employment relationship created through the platform.</Li>
              <Li>Users engage with jobs at their own risk. Perform due diligence before accepting any job offer.</Li>
            </ul>
          </Section>

          <Section id="subscriptions" title="10. Vendor Subscriptions">
            <ul className="space-y-1.5">
              <Li>Vendor subscription plans (Basic, Standard, Premium, VIP) are billed monthly via Stripe.</Li>
              <Li>You may cancel anytime; access continues until the end of the current billing period.</Li>
              <Li>A 5-day grace period applies for failed payments before downgrade to the Basic plan.</Li>
              <Li>Subscription fees are non-refundable once the billing period has started.</Li>
              <Li>Plan features may change; we will notify you at least 14 days before any material change to your active plan.</Li>
            </ul>
          </Section>

          <Section id="ip" title="11. Intellectual Property">
            <p>
              All content on {APP_NAME} — including our logo, design, code, and brand assets — is owned by
              {APP_NAME} or its licensors and protected by applicable intellectual property law.
            </p>
            <p className="mt-2">
              By posting content (listings, photos, videos, messages), you grant {APP_NAME} a non-exclusive,
              worldwide, royalty-free license to display, reproduce, and distribute that content solely for
              the purpose of operating and promoting the Service. You retain all ownership of your content.
            </p>
            <p className="mt-2">
              You represent that you own or have the right to post all content you submit and that it does
              not infringe any third-party rights.
            </p>
          </Section>

          <Section id="liability" title="12. Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, {APP_NAME} and its officers, directors,
              employees, and agents shall not be liable for any indirect, incidental, special, consequential,
              or punitive damages arising from your use of the Service, including but not limited to:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Loss of profits, revenue, or data.</Li>
              <Li>Damages resulting from transactions between users.</Li>
              <Li>Unauthorized access to your account or data breaches beyond our reasonable control.</Li>
              <Li>Service downtime, bugs, or technical failures.</Li>
            </ul>
            <p className="mt-2">
              Our total liability for any claim arising from use of the Service shall not exceed the greater
              of $100 USD or the total fees you paid to {APP_NAME} in the 12 months preceding the claim.
            </p>
          </Section>

          <Section id="termination" title="13. Termination">
            <p>
              You may close your account at any time via Settings. We reserve the right to suspend or
              terminate your account immediately, without notice, if you:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Violate these Terms or our community standards.</Li>
              <Li>Engage in fraud, abuse, or conduct that harms other users.</Li>
              <Li>Fail to pay outstanding fees or subscription charges.</Li>
              <Li>Provide false identity or verification information.</Li>
            </ul>
            <p className="mt-2">
              Upon termination, your right to access the Service ceases immediately. Provisions that by
              their nature should survive (payment obligations, IP rights, liability limitations) will continue to apply.
            </p>
          </Section>

          <Section id="disputes" title="14. Dispute Resolution">
            <p>
              In the event of a dispute between users, {APP_NAME} may facilitate mediation but is not
              obligated to resolve disputes or make payments on behalf of either party.
            </p>
            <p className="mt-2">
              Any dispute between you and {APP_NAME} shall be resolved by binding arbitration under the
              rules of the applicable arbitration authority in your jurisdiction, except where prohibited by law.
              You waive any right to a class action lawsuit or class arbitration.
            </p>
            <p className="mt-2">
              For users in Haiti: disputes shall be governed by Haitian law.
              For users in the Dominican Republic: disputes shall be governed by Dominican law.
              For users in other countries: disputes shall be governed by the laws of the State of Florida, USA.
            </p>
          </Section>

          <Section id="changes" title="15. Changes to Terms">
            <p>
              We may update these Terms at any time. We will notify you of material changes by posting a
              notice in the app and/or sending an email to your registered address. Your continued use of
              the Service after the effective date of any changes constitutes acceptance.
            </p>
          </Section>

          <Section id="contact" title="16. Contact">
            <p>Questions about these Terms? Contact us:</p>
            <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="font-semibold text-foreground">{APP_NAME} — Legal Team</p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Mail className="h-4 w-4" />
                {CONTACT_EMAIL}
              </a>
            </div>
          </Section>

          <div className="pt-6 border-t border-border flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-4">
              <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>
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
