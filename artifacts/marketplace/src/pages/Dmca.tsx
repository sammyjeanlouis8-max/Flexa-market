import { Link } from "wouter";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

const CONTACT_EMAIL = "dmca@flexamarket.com";
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

function NumberedLi({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 text-xs font-bold text-primary shrink-0 w-4">{n}.</span>
      <span>{children}</span>
    </li>
  );
}

export default function Dmca() {
  const { t } = useTranslation();

  const toc = [
    { id: "overview",       label: "Overview" },
    { id: "notification",   label: "Filing a DMCA Notice" },
    { id: "requirements",   label: "Notice Requirements" },
    { id: "counternotice",  label: "Counter-Notice" },
    { id: "repeat",         label: "Repeat Infringer Policy" },
    { id: "false",          label: "False Claims" },
    { id: "trademark",      label: "Trademark Complaints" },
    { id: "contact",        label: "Contact" },
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
            <ShieldAlert className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">DMCA & Copyright Policy</h1>
            <p className="text-sm text-muted-foreground">{APP_NAME} — Intellectual Property Protection</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Effective date:</strong> {EFFECTIVE_DATE}
          {" · "}
          <strong className="text-foreground">Last updated:</strong> {EFFECTIVE_DATE}
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {APP_NAME} respects the intellectual property rights of others and expects users to do the same.
          In accordance with the Digital Millennium Copyright Act of 1998 ("DMCA") and applicable international
          copyright laws, we will respond to clear notices of alleged copyright infringement. This policy
          describes how to report infringing content and how we handle such reports.
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

          <Section id="overview" title="1. Overview">
            <p>
              {APP_NAME} is a peer-to-peer marketplace platform where users post listings, images, videos,
              and other content. While we do not create user-generated content, we take copyright infringement
              seriously and are committed to removing infringing material promptly upon receiving valid notices.
            </p>
            <p className="mt-2">
              Our designated agent for receiving DMCA notices is identified in Section 8 (Contact) below.
              We process notices in accordance with the DMCA's safe harbor provisions (17 U.S.C. § 512).
            </p>
          </Section>

          <Section id="notification" title="2. Filing a DMCA Takedown Notice">
            <p>
              If you believe that content on {APP_NAME} infringes your copyright, you may submit a written
              DMCA takedown notice to our Designated Agent. To be effective, your notice must be submitted
              in writing (email is acceptable) and include all required elements described in Section 3.
            </p>
            <p className="mt-2">
              Upon receipt of a valid notice, we will:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Expeditiously remove or disable access to the allegedly infringing content.</Li>
              <Li>Notify the user who posted the content that it has been removed.</Li>
              <Li>Provide the user with a copy of the takedown notice (with your contact information).</Li>
              <Li>Log the notice for our repeat infringer records.</Li>
            </ul>
          </Section>

          <Section id="requirements" title="3. Notice Requirements">
            <p>
              A valid DMCA takedown notice must include ALL of the following elements (17 U.S.C. § 512(c)(3)):
            </p>
            <ol className="space-y-2 mt-2">
              <NumberedLi n={1}>
                <strong className="text-foreground">Identification of the copyrighted work:</strong>{" "}
                Describe the copyrighted work you claim has been infringed, or if multiple works are
                covered by a single notice, a representative list of such works.
              </NumberedLi>
              <NumberedLi n={2}>
                <strong className="text-foreground">Identification of infringing material:</strong>{" "}
                Identify the material on {APP_NAME} that you claim is infringing and that you request
                be removed. Include the specific URL(s) or enough information to locate the content.
              </NumberedLi>
              <NumberedLi n={3}>
                <strong className="text-foreground">Your contact information:</strong>{" "}
                Your full name, mailing address, telephone number, and email address.
              </NumberedLi>
              <NumberedLi n={4}>
                <strong className="text-foreground">Good faith statement:</strong>{" "}
                A statement that you have a good faith belief that the use of the material in the
                manner complained of is not authorized by the copyright owner, its agent, or the law.
              </NumberedLi>
              <NumberedLi n={5}>
                <strong className="text-foreground">Accuracy statement:</strong>{" "}
                A statement that the information in the notice is accurate, and under penalty of perjury,
                that you are authorized to act on behalf of the copyright owner.
              </NumberedLi>
              <NumberedLi n={6}>
                <strong className="text-foreground">Signature:</strong>{" "}
                A physical or electronic signature of the person authorized to act on behalf of the
                copyright owner.
              </NumberedLi>
            </ol>
            <p className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
              <strong>Important:</strong> Notices that are incomplete or do not satisfy all requirements
              may not be processed. We recommend consulting an attorney if you are unsure about your rights.
            </p>
          </Section>

          <Section id="counternotice" title="4. Counter-Notice (Dispute a Takedown)">
            <p>
              If you believe your content was removed in error — for example, because you have a license
              to use the material or the complaint was filed mistakenly — you may file a counter-notice.
              A valid counter-notice must include:
            </p>
            <ol className="space-y-2 mt-2">
              <NumberedLi n={1}>
                Your full name, mailing address, phone number, and email address.
              </NumberedLi>
              <NumberedLi n={2}>
                Identification of the material that was removed and its location before removal
                (e.g., the URL of the listing).
              </NumberedLi>
              <NumberedLi n={3}>
                A statement under penalty of perjury that you have a good faith belief the material
                was removed or disabled as a result of mistake or misidentification.
              </NumberedLi>
              <NumberedLi n={4}>
                A statement that you consent to the jurisdiction of the Federal District Court for the
                judicial district in which your address is located (or, if outside the U.S., any
                judicial district where {APP_NAME} may be found).
              </NumberedLi>
              <NumberedLi n={5}>
                Your physical or electronic signature.
              </NumberedLi>
            </ol>
            <p className="mt-2">
              Upon receiving a valid counter-notice, we will forward it to the original complainant
              and restore the content within 10–14 business days unless the complainant files a court
              action to restrain the restoration.
            </p>
          </Section>

          <Section id="repeat" title="5. Repeat Infringer Policy">
            <p>
              {APP_NAME} has adopted a policy of terminating, in appropriate circumstances and at its
              sole discretion, the accounts of users who are deemed to be repeat infringers.
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>A user who receives 3 or more valid DMCA takedown notices will have their account suspended.</Li>
              <Li>Accounts with a pattern of intellectual property abuse may be permanently banned.</Li>
              <Li>
                Sellers with suspended accounts due to copyright violations will have their active listings
                removed and pending transactions cancelled.
              </Li>
              <Li>We maintain records of all DMCA notices received for at least 3 years.</Li>
            </ul>
          </Section>

          <Section id="false" title="6. False Claims & Abuse">
            <p>
              Submitting a DMCA takedown notice when you know the material is not infringing, or when
              you do not have the right to submit such a notice, is a serious matter.
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>
                Under 17 U.S.C. § 512(f), anyone who knowingly materially misrepresents that material is
                infringing may be liable for damages, including costs and attorneys' fees.
              </Li>
              <Li>
                {APP_NAME} reserves the right to seek damages against persons who abuse the DMCA process,
                including those who file fraudulent notices.
              </Li>
              <Li>
                We may decline to process notices that appear to be submitted in bad faith or as a means of
                censoring legitimate content.
              </Li>
            </ul>
          </Section>

          <Section id="trademark" title="7. Trademark Complaints">
            <p>
              This policy addresses copyright infringement under the DMCA. For trademark complaints,
              please contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a>{" "}
              with the subject line "Trademark Complaint" and include:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Your trademark registration number and jurisdiction.</Li>
              <Li>The specific content on {APP_NAME} that you believe infringes your trademark.</Li>
              <Li>Proof that you are the owner or authorized representative of the trademark.</Li>
            </ul>
            <p className="mt-2">
              We also accept reports of counterfeit goods or misleading listings through our in-app
              "Report" feature on any listing page, or via our{" "}
              <Link href="/contact" className="text-primary underline underline-offset-2">contact form</Link>.
            </p>
          </Section>

          <Section id="contact" title="8. Contact — Designated DMCA Agent">
            <p>
              Send all DMCA takedown notices, counter-notices, and intellectual property inquiries to
              our Designated Agent:
            </p>
            <div className="mt-3 p-4 rounded-xl bg-muted/50 border border-border text-sm space-y-1">
              <p><strong className="text-foreground">DMCA Agent — {APP_NAME}</strong></p>
              <p>
                Email:{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p>Subject line: <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">DMCA Takedown Notice</span></p>
              <p className="text-xs text-muted-foreground mt-2">
                We aim to acknowledge valid notices within 2 business days and take action within 5 business days.
                For urgent matters involving clearly illegal content, we act immediately.
              </p>
            </div>
            <p className="mt-3">
              For general copyright questions not requiring a formal takedown, you may also use our{" "}
              <Link href="/contact" className="text-primary underline underline-offset-2">support form</Link>.
            </p>
          </Section>

        </main>
      </div>
    </div>
  );
}
