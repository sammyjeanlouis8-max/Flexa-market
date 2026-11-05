import LegalLayout, { type LegalSection } from "@/components/LegalLayout";
import { Mail, MessageCircle, Clock, HelpCircle, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

const ContactCard = ({ icon: Icon, title, desc, action, href }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; desc: string; action: string; href: string;
}) => (
  <a href={href} className="flex items-start gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all group">
    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary/20 transition-colors">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="font-semibold text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      <p className="text-xs text-primary font-semibold mt-2">{action} →</p>
    </div>
  </a>
);

export default function Contact() {
  const { t } = useTranslation();

  const sections: LegalSection[] = [
    {
      id: "support-options",
      title: t("contact.supportOptions"),
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 not-prose">
          <ContactCard icon={Mail} title={t("contact.emailTitle")} desc={t("contact.emailDesc")} action={t("contact.emailAction")} href="mailto:support@flexamarket.com" />
          <ContactCard icon={MessageCircle} title={t("contact.chatTitle")} desc={t("contact.chatDesc")} action={t("contact.chatAction")} href="/support" />
          <ContactCard icon={HelpCircle} title={t("contact.helpTitle")} desc={t("contact.helpDesc")} action={t("contact.helpAction")} href="/help-center" />
          <ContactCard icon={Shield} title={t("contact.abuseTitle")} desc={t("contact.abuseDesc")} action={t("contact.abuseAction")} href="/report-abuse" />
        </div>
      ),
    },
    {
      id: "hours",
      title: t("contact.hoursTitle"),
      content: (
        <div className="not-prose space-y-2">
          {[
            [t("contact.hoursWeekdays"), t("contact.hoursWeekdaysVal")],
            [t("contact.hoursSaturday"), t("contact.hoursSaturdayVal")],
            [t("contact.hoursSunday"), t("contact.hoursSundayVal")],
          ].map(([day, hours]) => (
            <div key={day} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-foreground">{day}</span></div>
              <span className="text-sm font-semibold text-primary">{hours}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "buyer-support",
      title: t("contact.buyerTitle"),
      content: (
        <ul className="list-disc pl-4 space-y-1.5">
          <li>{t("contact.buyer1")}</li>
          <li>{t("contact.buyer2")}</li>
          <li>{t("contact.buyer3")}</li>
          <li>{t("contact.buyer4")}</li>
          <li>{t("contact.buyer5")}</li>
        </ul>
      ),
    },
    {
      id: "seller-support",
      title: t("contact.sellerTitle"),
      content: (
        <ul className="list-disc pl-4 space-y-1.5">
          <li>{t("contact.seller1")}</li>
          <li>{t("contact.seller2")}</li>
          <li>{t("contact.seller3")}</li>
          <li>{t("contact.seller4")}</li>
          <li>{t("contact.seller5")}</li>
        </ul>
      ),
    },
    {
      id: "safety-support",
      title: t("contact.safetyTitle"),
      content: (
        <>
          <p>{t("contact.safetyIntro")}</p>
          <p><strong>{t("contact.safetyEmail")}</strong> security@flexamarket.com</p>
          <p>{t("contact.safetyReply")}</p>
        </>
      ),
    },
  ];

  return (
    <LegalLayout
      icon={<Mail className="h-6 w-6" />}
      badge={t("contact.badge")}
      title={t("contact.title")}
      subtitle={t("contact.subtitle")}
      lastUpdated={t("contact.lastUpdated")}
      sections={sections}
    />
  );
}
