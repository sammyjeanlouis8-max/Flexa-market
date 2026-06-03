import LegalLayout from "@/components/LegalLayout";
import { Trash2, AlertTriangle, ShieldCheck, Clock } from "lucide-react";

const sections = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <p>You have the right to delete your account at any time. This page explains what data is deleted, what is retained, and how to submit your request.</p>
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 not-prose mt-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-400"><strong>Warning:</strong> Account deletion is permanent. Data cannot be recovered after 30 days.</p>
        </div>
      </>
    ),
  },
  {
    id: "how-to-delete",
    title: "How to delete your account",
    content: (
      <ol className="list-decimal pl-4 space-y-2">
        <li>Log in to your FLEXA MARKET account</li>
        <li>Go to <strong>Settings → Security</strong></li>
        <li>Tap <strong>"Delete my account"</strong></li>
        <li>Enter your password to confirm</li>
        <li>Tap <strong>"Confirm deletion"</strong></li>
        <li>You will receive a confirmation email</li>
      </ol>
    ),
  },
  {
    id: "alternative",
    title: "Alternative: contact support",
    content: (
      <>
        <p>If you cannot log in to your account or are experiencing technical issues, contact us at:</p>
        <p><strong>Email:</strong> support@flexamarket.com</p>
        <p>Subject: <em>"Account deletion request"</em> — please include:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Your full name</li>
          <li>The email address used to create your account</li>
          <li>The phone number associated with the account (if available)</li>
        </ul>
      </>
    ),
  },
  {
    id: "what-gets-deleted",
    title: "What gets deleted",
    content: (
      <ul className="list-disc pl-4 space-y-1.5">
        <li>Your profile (name, photo, bio)</li>
        <li>All listings you published</li>
        <li>Message history</li>
        <li>Preferences and settings</li>
        <li>Notifications</li>
        <li>Promotional balance (non-refundable)</li>
      </ul>
    ),
  },
  {
    id: "what-is-kept",
    title: "What is retained (for legal reasons)",
    content: (
      <>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Transaction history for 7 years (tax obligations)</li>
          <li>Anti-fraud reports and security activity</li>
          <li>Minimal data to prevent fraudulent re-registration</li>
        </ul>
        <p className="mt-3">All personal data is fully deleted after 30 days. During this period, your account is deactivated and not visible to other users.</p>
      </>
    ),
  },
  {
    id: "seller-considerations",
    title: "Considerations for sellers",
    content: (
      <>
        <p>If you are an active seller, <strong>before</strong> deleting your account:</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Ensure all orders are delivered or cancelled</li>
          <li>Withdraw your wallet balance</li>
          <li>Cancel your seller subscription (if applicable)</li>
          <li>Close all open disputes</li>
        </ul>
        <p className="mt-2">We cannot refund any remaining balance after account deletion.</p>
      </>
    ),
  },
  {
    id: "timeline",
    title: "Deletion timeline",
    content: (
      <div className="not-prose space-y-3">
        {[
          { icon: Clock, label: "Immediately", desc: "Account deactivated, no longer visible to others" },
          { icon: Clock, label: "7 days", desc: "Listings removed from search results" },
          { icon: Clock, label: "30 days", desc: "Complete deletion of all personal data" },
          { icon: ShieldCheck, label: "7 years", desc: "Transaction history retained (legal requirement)" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export default function DeleteAccount() {
  return (
    <LegalLayout
      icon={<Trash2 className="h-6 w-6" />}
      badge="Account Management"
      title="Delete Your Account"
      subtitle="We respect your right to control your personal data."
      lastUpdated="Last updated: May 2026"
      sections={sections}
    />
  );
}
