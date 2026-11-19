/** Static legal / policy copy for native legal/[slug] screens. */

export type LegalDoc = {
  title: string;
  effectiveDate: string;
  sections: { heading: string; body: string[] }[];
};

const CONTACT = "support@flexamarket.com";
const DATE = "May 1, 2025";

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    effectiveDate: DATE,
    sections: [
      {
        heading: "Data we collect",
        body: [
          "Account data (name, email, phone, country), listings, messages, orders, wallet activity, device and usage diagnostics needed to operate Flexa Market.",
          "Payment processing is handled by Stripe, MonCash, and similar providers — we do not store full card numbers.",
        ],
      },
      {
        heading: "How we use data",
        body: [
          "To provide marketplace, delivery, wallet, support, fraud prevention, and account security features.",
          "To send transactional notices (orders, OTP, support). Marketing emails are optional and can be disabled in Settings → Notifications.",
        ],
      },
      {
        heading: "Sharing",
        body: [
          "We share data with service providers (hosting, payments, SMS/email) only as needed to run the platform.",
          "We may disclose information when required by law or to protect users from fraud or abuse.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "You may access or update profile data, export limited account info via support, or delete your account at /delete-account.",
          `Questions: ${CONTACT}`,
        ],
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    effectiveDate: DATE,
    sections: [
      {
        heading: "Agreement",
        body: [
          "By creating an account or using Flexa Market you agree to these Terms and our Privacy Policy and EULA.",
          "You must be of legal age in your country and provide accurate information.",
        ],
      },
      {
        heading: "Marketplace rules",
        body: [
          "Sellers are responsible for listings, pricing, inventory, and legal compliance. Prohibited items are not allowed.",
          "Buyers must pay for confirmed orders. Flexa may cancel fraudulent or abusive activity.",
        ],
      },
      {
        heading: "Fees & wallet",
        body: [
          "Platform commissions, delivery fees, boosts, and transfer fees are shown in-app before you confirm.",
          "Wallet balances are not a bank account; availability depends on payment rails and local regulations.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "Flexa Market is a platform connecting users. We are not a party to every transaction and limit liability to the maximum extent permitted by law.",
          `Contact: ${CONTACT}`,
        ],
      },
    ],
  },
  eula: {
    title: "End User License Agreement (EULA)",
    effectiveDate: DATE,
    sections: [
      {
        heading: "License",
        body: [
          "Flexa grants you a personal, non-exclusive, non-transferable license to use the Flexa Market mobile apps and website.",
          "You may not reverse engineer, scrape at scale, or misuse the service for spam, fraud, or illegal activity.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "No harassment, scams, counterfeit goods, weapons, controlled substances, or content that violates law or community guidelines.",
          "We may suspend or ban accounts that violate this EULA.",
        ],
      },
      {
        heading: "Updates & termination",
        body: [
          "We may update the apps and these terms. Continued use after notice constitutes acceptance.",
          "You may stop using the app and delete your account at any time.",
        ],
      },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    effectiveDate: DATE,
    sections: [
      {
        heading: "What we use",
        body: [
          "Essential cookies/local storage keep you signed in and remember language, country, and cart state.",
          "Analytics cookies (where enabled) help us understand traffic and improve reliability.",
        ],
      },
      {
        heading: "Control",
        body: [
          "You can clear app storage or browser cookies anytime. Some features require essential storage to function.",
        ],
      },
    ],
  },
  "community-guidelines": {
    title: "Community Guidelines",
    effectiveDate: DATE,
    sections: [
      {
        heading: "Be respectful",
        body: [
          "Treat buyers, sellers, drivers, and support agents with respect. No hate speech or threats.",
        ],
      },
      {
        heading: "Honest listings",
        body: [
          "Describe products accurately with real photos. Do not impersonate brands or other users.",
        ],
      },
      {
        heading: "Report problems",
        body: [
          "Use in-app reporting or Support for scams, prohibited items, or safety issues.",
        ],
      },
    ],
  },
  "refund-policy": {
    title: "Refund Policy",
    effectiveDate: DATE,
    sections: [
      {
        heading: "When refunds apply",
        body: [
          "Refunds depend on order status, delivery confirmation, and whether the item was misrepresented or not received.",
          "Open a support ticket with your order ID. Wallet/promo balances used for boosts are generally non-refundable.",
        ],
      },
    ],
  },
  "seller-policy": {
    title: "Seller Policy",
    effectiveDate: DATE,
    sections: [
      {
        heading: "Seller responsibilities",
        body: [
          "Keep listings accurate, fulfill orders promptly, and communicate with buyers.",
          "Platform commission (typically 7%) is deducted per sale unless a promo applies.",
        ],
      },
    ],
  },
  safety: {
    title: "Safety Center",
    effectiveDate: DATE,
    sections: [
      {
        heading: "Stay safe",
        body: [
          "Meet in public places for local pickup when possible. Never share OTPs or passwords.",
          "Report suspicious users via Support or Report Abuse.",
        ],
      },
    ],
  },
  "data-deletion": {
    title: "Data Deletion",
    effectiveDate: DATE,
    sections: [
      {
        heading: "How to request deletion",
        body: [
          "Use Settings → Security → Delete account, or visit Delete Account in the app.",
          "Personal data is anonymized; some transaction records may be retained for legal/tax obligations.",
        ],
      },
    ],
  },
  accessibility: {
    title: "Accessibility",
    effectiveDate: DATE,
    sections: [
      {
        heading: "Our commitment",
        body: [
          "We aim to make Flexa Market usable with larger text, screen readers, and clear contrast.",
          `Feedback: ${CONTACT}`,
        ],
      },
    ],
  },
  about: {
    title: "About Flexa Market",
    effectiveDate: DATE,
    sections: [
      {
        heading: "Who we are",
        body: [
          "Flexa Market is a peer-to-peer marketplace for Haiti, the Caribbean, and the diaspora — with wallet, delivery, jobs, TV, and music services.",
          `Support: ${CONTACT}`,
        ],
      },
    ],
  },
};

export function resolveLegalSlug(slug: string | undefined): LegalDoc | null {
  if (!slug) return null;
  const key = slug.toLowerCase().replace(/\.html$/, "");
  const aliases: Record<string, string> = {
    "privacy-policy": "privacy",
    "terms-of-service": "terms",
    tos: "terms",
    "end-user-license": "eula",
    "end-user-license-agreement": "eula",
    guidelines: "community-guidelines",
    refund: "refund-policy",
    seller: "seller-policy",
    delete: "data-deletion",
  };
  const resolved = aliases[key] || key;
  return LEGAL_DOCS[resolved] ?? null;
}
