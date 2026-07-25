import { Link } from "wouter";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

const CONTACT_EMAIL = "legal@flexamarket.com";
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

export default function Eula() {
  const { t } = useTranslation();

  const toc = [
    { id: "grant",        label: "License Grant" },
    { id: "restrictions", label: "Restrictions" },
    { id: "ownership",    label: "Ownership" },
    { id: "apple",        label: "Apple App Store Terms" },
    { id: "google",       label: "Google Play Terms" },
    { id: "updates",      label: "Updates & Changes" },
    { id: "termination",  label: "Termination" },
    { id: "warranty",     label: "Disclaimer of Warranties" },
    { id: "liability",    label: "Limitation of Liability" },
    { id: "governing",    label: "Governing Law" },
    { id: "contact",      label: "Contact" },
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
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">End User License Agreement</h1>
            <p className="text-sm text-muted-foreground">{APP_NAME} — EULA</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Effective date:</strong> {EFFECTIVE_DATE}
          {" · "}
          <strong className="text-foreground">Last updated:</strong> {EFFECTIVE_DATE}
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          This End User License Agreement ("EULA") is a legal agreement between you ("User," "you") and
          {" "}{APP_NAME} ("Company," "we," "us") governing your use of the {APP_NAME} mobile application
          and web platform ("Application"). By downloading, installing, or using the Application, you
          accept and agree to be bound by the terms of this EULA. If you do not agree, do not install or
          use the Application.
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

          <Section id="grant" title="1. License Grant">
            <p>
              Subject to your compliance with this EULA and our{" "}
              <Link href="/terms" className="text-primary underline underline-offset-2">Terms of Service</Link>,
              {" "}{APP_NAME} grants you a limited, non-exclusive, non-transferable, revocable license to:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Download and install the Application on devices you own or control.</Li>
              <Li>Access and use the Application solely for your personal, non-commercial purposes.</Li>
              <Li>Use the Application in accordance with all applicable laws and regulations in your country.</Li>
            </ul>
            <p className="mt-2">
              This license does not include any right to sublicense, sell, resell, transfer, assign,
              or otherwise commercially exploit the Application.
            </p>
          </Section>

          <Section id="restrictions" title="2. Restrictions">
            <p>You agree NOT to:</p>
            <ul className="space-y-1.5 mt-2">
              <Li>Copy, modify, or create derivative works of the Application or its source code.</Li>
              <Li>Reverse-engineer, decompile, disassemble, or attempt to derive the source code of the Application.</Li>
              <Li>Remove, alter, or obscure any copyright, trademark, or other proprietary notices.</Li>
              <Li>Use the Application to develop a competing product or service.</Li>
              <Li>Rent, lease, lend, sell, sublicense, or redistribute the Application.</Li>
              <Li>Use any automated means (bots, scrapers, crawlers) to access or extract data from the Application.</Li>
              <Li>Transmit any viruses, malware, or other harmful code through the Application.</Li>
              <Li>Use the Application in any manner that violates applicable law or infringes third-party rights.</Li>
            </ul>
          </Section>

          <Section id="ownership" title="3. Ownership">
            <p>
              The Application and all copies thereof are proprietary to {APP_NAME} and title thereto
              remains with {APP_NAME}. All rights in the Application not specifically granted in this
              EULA are reserved to {APP_NAME}.
            </p>
            <p className="mt-2">
              You acknowledge that no title to the intellectual property in the Application is transferred
              to you. You further acknowledge that title and full ownership rights to the Application will
              remain the exclusive property of {APP_NAME} and you will not acquire any rights to the
              Application except as expressly set forth in this EULA.
            </p>
          </Section>

          <Section id="apple" title="4. Apple App Store Additional Terms">
            <p>
              If you are accessing the Application through Apple's App Store, the following additional
              terms apply:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>
                <strong className="text-foreground">Acknowledgment:</strong> This EULA is concluded between
                you and {APP_NAME} only, and not with Apple, Inc. ("Apple"). Apple is not responsible for
                the Application or its content.
              </Li>
              <Li>
                <strong className="text-foreground">Scope of License:</strong> The license granted to you
                for the Application is limited to a non-transferable license to use the Application on any
                Apple-branded products you own or control as permitted by the App Store Terms of Service.
              </Li>
              <Li>
                <strong className="text-foreground">Maintenance and Support:</strong> {APP_NAME} is solely
                responsible for providing maintenance and support services for the Application. Apple has no
                obligation whatsoever to furnish any maintenance and support services.
              </Li>
              <Li>
                <strong className="text-foreground">Warranty:</strong> In the event of any failure of the
                Application to conform to any applicable warranty, you may notify Apple and Apple will refund
                the purchase price (if any) for the Application. Apple has no other warranty obligation.
              </Li>
              <Li>
                <strong className="text-foreground">Product Claims:</strong> {APP_NAME}, not Apple, is
                responsible for addressing any claims relating to the Application, including product liability,
                consumer protection, or intellectual property infringement claims.
              </Li>
              <Li>
                <strong className="text-foreground">Third-Party Beneficiary:</strong> Apple and its
                subsidiaries are third-party beneficiaries of this EULA. Upon your acceptance, Apple will
                have the right to enforce this EULA against you as a third-party beneficiary.
              </Li>
            </ul>
          </Section>

          <Section id="google" title="5. Google Play Additional Terms">
            <p>
              If you are accessing the Application through Google Play, the following additional terms apply:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>
                <strong className="text-foreground">Acknowledgment:</strong> This EULA is concluded between
                you and {APP_NAME} only, and not with Google LLC ("Google"). Google is not responsible for
                the Application or its content.
              </Li>
              <Li>
                <strong className="text-foreground">Google Play Terms:</strong> Your use of Google Play is
                subject to Google's Terms of Service and Google Play Terms of Service. In the event of a
                conflict, this EULA shall govern with respect to the Application.
              </Li>
              <Li>
                <strong className="text-foreground">Data Safety:</strong> Information about data collected
                and shared by the Application is described in our{" "}
                <Link href="/privacy-policy" className="text-primary underline underline-offset-2">Privacy Policy</Link>.
                The data safety information shown on Google Play is a summary derived from that policy.
              </Li>
            </ul>
          </Section>

          <Section id="updates" title="6. Updates & Changes">
            <p>
              {APP_NAME} may from time to time provide updates, patches, or new versions of the Application
              ("Updates"). Updates may be automatically installed or may require your action.
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Updates may add, change, or remove features of the Application.</Li>
              <Li>Continued use of the Application after an Update constitutes acceptance of the updated EULA.</Li>
              <Li>We reserve the right to modify or discontinue the Application at any time without prior notice.</Li>
            </ul>
          </Section>

          <Section id="termination" title="7. Termination">
            <p>
              This EULA is effective until terminated. Your rights under this EULA will terminate
              automatically without notice if you fail to comply with any of its terms.
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Upon termination, you must cease all use of the Application and delete all copies.</Li>
              <Li>
                {APP_NAME} may also terminate this EULA if your account is suspended or terminated under our{" "}
                <Link href="/terms" className="text-primary underline underline-offset-2">Terms of Service</Link>.
              </Li>
              <Li>Sections 3, 8, 9, and 10 survive termination of this EULA.</Li>
            </ul>
          </Section>

          <Section id="warranty" title="8. Disclaimer of Warranties">
            <p>
              THE APPLICATION IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND.
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, {APP_NAME.toUpperCase()} EXPRESSLY
              DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING
              WITHOUT LIMITATION:
            </p>
            <ul className="space-y-1.5 mt-2">
              <Li>Any implied warranty of merchantability, fitness for a particular purpose, or non-infringement.</Li>
              <Li>That the Application will meet your requirements or be available on an uninterrupted, secure, or error-free basis.</Li>
              <Li>That the results obtained from use of the Application will be accurate or reliable.</Li>
            </ul>
          </Section>

          <Section id="liability" title="9. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL {APP_NAME.toUpperCase()},
              ITS AFFILIATES, DIRECTORS, EMPLOYEES, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATING TO YOUR USE OF THE
              APPLICATION, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="mt-2">
              IN JURISDICTIONS THAT DO NOT ALLOW THE EXCLUSION OR LIMITATION OF LIABILITY FOR INCIDENTAL
              OR CONSEQUENTIAL DAMAGES, {APP_NAME}'S LIABILITY SHALL BE LIMITED TO THE MAXIMUM EXTENT
              PERMITTED BY LAW.
            </p>
          </Section>

          <Section id="governing" title="10. Governing Law">
            <p>
              This EULA shall be governed by and construed in accordance with the laws of the Republic of
              Haiti, without regard to its conflict of law provisions. For users in other jurisdictions,
              mandatory local consumer protection laws may also apply.
            </p>
            <p className="mt-2">
              Any dispute arising from this EULA shall first be attempted to be resolved through good-faith
              negotiation. If unresolved, disputes shall be subject to binding arbitration or the courts
              of competent jurisdiction as set forth in our{" "}
              <Link href="/terms" className="text-primary underline underline-offset-2">Terms of Service</Link>.
            </p>
          </Section>

          <Section id="contact" title="11. Contact">
            <p>
              If you have any questions about this EULA, please contact us at:
            </p>
            <div className="mt-3 p-4 rounded-xl bg-muted/50 border border-border text-sm space-y-1">
              <p><strong className="text-foreground">{APP_NAME}</strong></p>
              <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a></p>
              <p>Support: <Link href="/contact" className="text-primary underline underline-offset-2">flexamarket.com/contact</Link></p>
            </div>
          </Section>

        </main>
      </div>
    </div>
  );
}
