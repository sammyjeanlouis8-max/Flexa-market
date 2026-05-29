import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Idempotent schema migrations that run at server startup.
 * Uses IF NOT EXISTS / IF EXISTS guards — safe to run multiple times.
 * Add new ALTER TABLE statements here whenever a new column is introduced.
 */
export async function runStartupMigrations(): Promise<void> {
  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: "users.subscription_plan",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan text NOT NULL DEFAULT 'basic'`,
    },
    {
      name: "users.subscription_expires_at",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz`,
    },
    {
      name: "users.admin_scope_country",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_scope_country text`,
    },
    {
      name: "users.admin_scope_department",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_scope_department text`,
    },
    {
      name: "users.admin_scope_city",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_scope_city text`,
    },
    {
      name: "users.preferred_language",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language text`,
    },
    {
      name: "users.referral_code",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text`,
    },
    {
      name: "users.referred_by_user_id",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id integer`,
    },
    {
      name: "users.referral_bonus_paid",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_paid boolean NOT NULL DEFAULT false`,
    },
    {
      name: "users.country_changed_at",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS country_changed_at timestamptz`,
    },
    {
      name: "users.country_locked_by",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS country_locked_by text`,
    },
    {
      name: "users.is_trusted",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false`,
    },
    {
      name: "users.token_invalidated_at",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_invalidated_at timestamptz`,
    },
    {
      name: "users.stripe_account_id",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id text`,
    },
    {
      name: "users.stripe_account_status",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_status text NOT NULL DEFAULT 'not_connected'`,
    },
    {
      name: "users.stripe_customer_id",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text`,
    },
    {
      name: "users.is_flagged",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false`,
    },
    {
      name: "users.flag_reason",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS flag_reason text`,
    },
    {
      name: "users.device_id",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id text`,
    },
    {
      name: "users.registration_ip",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip text`,
    },
    {
      name: "users.role",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'`,
    },
    {
      name: "users.is_super_admin",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false`,
    },
    {
      name: "users.notify_push",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true`,
    },
    {
      name: "users.notify_email",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true`,
    },
    {
      name: "users.notify_sms",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT true`,
    },
    {
      name: "listings.stock_quantity",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS stock_quantity integer`,
    },
    {
      name: "listings.listing_video_url",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS listing_video_url text`,
    },
    {
      name: "vendor_subscriptions.create_table",
      sql: `CREATE TABLE IF NOT EXISTS vendor_subscriptions (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan text NOT NULL DEFAULT 'basic',
        status text NOT NULL DEFAULT 'active',
        started_at timestamptz NOT NULL DEFAULT NOW(),
        expires_at timestamptz,
        grace_until timestamptz,
        next_billing_date timestamptz,
        cancel_at_period_end boolean NOT NULL DEFAULT false,
        stripe_subscription_id text,
        stripe_customer_id text,
        amount_usd real,
        interval text DEFAULT 'month',
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "vendor_subscriptions.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS vendor_subscriptions_user_id_idx     ON vendor_subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS vendor_subscriptions_status_idx       ON vendor_subscriptions(status);
        CREATE INDEX IF NOT EXISTS vendor_subscriptions_expires_at_idx   ON vendor_subscriptions(expires_at);
        CREATE INDEX IF NOT EXISTS vendor_subscriptions_grace_until_idx  ON vendor_subscriptions(grace_until);
        CREATE INDEX IF NOT EXISTS vendor_subscriptions_next_billing_idx ON vendor_subscriptions(next_billing_date)
      `,
    },
    {
      name: "users.preferred_theme",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_theme text DEFAULT 'light'`,
    },
    {
      name: "users.is_restricted",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false`,
    },
    {
      name: "users.restricted_until",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_until timestamptz`,
    },
    {
      name: "users.restriction_reason",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS restriction_reason text`,
    },
    {
      name: "listings.boost_start_at",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_start_at timestamptz`,
    },
    {
      name: "promo_wallets.promo_balance",
      sql: `ALTER TABLE promo_wallets ADD COLUMN IF NOT EXISTS promo_balance real NOT NULL DEFAULT 0`,
    },
    {
      name: "promo_wallets.unlocked_balance",
      sql: `ALTER TABLE promo_wallets ADD COLUMN IF NOT EXISTS unlocked_balance real NOT NULL DEFAULT 0`,
    },
    // ── Transactions: newer columns added after initial schema ──────────────
    {
      name: "transactions.shipping_name",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_name text`,
    },
    {
      name: "transactions.shipping_phone",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_phone text`,
    },
    {
      name: "transactions.shipping_email",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_email text`,
    },
    {
      name: "transactions.shipping_street",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_street text`,
    },
    {
      name: "transactions.shipping_city",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_city text`,
    },
    {
      name: "transactions.shipping_region",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_region text`,
    },
    {
      name: "transactions.order_status",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'ready_to_ship'`,
    },
    {
      name: "transactions.shipped_at",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipped_at timestamptz`,
    },
    {
      name: "transactions.delivered_at",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivered_at timestamptz`,
    },
    {
      name: "transactions.buyer_confirmed_at",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_confirmed_at timestamptz`,
    },
    {
      name: "transactions.tracking_number",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tracking_number text`,
    },
    {
      name: "transactions.carrier",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS carrier text`,
    },
    {
      name: "transactions.tracking_status",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tracking_status text DEFAULT 'pending'`,
    },
    {
      name: "transactions.tracking_last_updated",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tracking_last_updated timestamptz`,
    },
    {
      name: "transactions.delivery_description",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_description text`,
    },
    {
      name: "transactions.driver_name",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS driver_name text`,
    },
    {
      name: "transactions.driver_phone",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS driver_phone text`,
    },
    {
      name: "transactions.delivery_note",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_note text`,
    },
    {
      name: "transactions.auto_release_at",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS auto_release_at timestamptz`,
    },
    {
      name: "transactions.escrow_released",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS escrow_released boolean NOT NULL DEFAULT false`,
    },
    {
      name: "transactions.escrow_released_at",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS escrow_released_at timestamptz`,
    },
    {
      name: "transactions.listing_country",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS listing_country text`,
    },
    {
      name: "transactions.commission_rate",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS commission_rate real`,
    },
    {
      name: "transactions.commission_amount",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS commission_amount real`,
    },
    {
      name: "transactions.seller_earnings",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS seller_earnings real`,
    },
    {
      name: "transactions.seller_user_id",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS seller_user_id integer REFERENCES users(id)`,
    },
    {
      name: "transactions.stripe_checkout_session_id",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text`,
    },
    {
      name: "transactions.stripe_payment_intent_id",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text`,
    },
    {
      name: "transactions.stripe_transfer_id",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS stripe_transfer_id text`,
    },
    // ── Seller payout tables ─────────────────────────────────────────────────
    {
      name: "seller_payout_accounts.create_table",
      sql: `CREATE TABLE IF NOT EXISTS seller_payout_accounts (
        id serial PRIMARY KEY,
        user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        moncash_number text,
        moncash_verified boolean NOT NULL DEFAULT false,
        moncash_verified_at timestamptz,
        moncash_verified_by integer REFERENCES users(id),
        moncash_rejected_reason text,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "listings.state_city_indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS listings_state_idx ON listings(state) WHERE state IS NOT NULL;
        CREATE INDEX IF NOT EXISTS listings_city_idx  ON listings(city)  WHERE city  IS NOT NULL;
        CREATE INDEX IF NOT EXISTS listings_country_state_idx ON listings(country, state) WHERE country IS NOT NULL AND state IS NOT NULL;
        CREATE INDEX IF NOT EXISTS listings_country_city_idx  ON listings(country, city)  WHERE country IS NOT NULL AND city  IS NOT NULL
      `,
    },
    {
      name: "marketplace_seller_payouts.create_table",
      sql: `CREATE TABLE IF NOT EXISTS marketplace_seller_payouts (
        id serial PRIMARY KEY,
        transaction_id integer NOT NULL UNIQUE REFERENCES transactions(id),
        seller_id integer NOT NULL REFERENCES users(id),
        gross_amount real NOT NULL,
        commission_rate real NOT NULL DEFAULT 0,
        commission_amount real NOT NULL DEFAULT 0,
        net_amount real NOT NULL,
        payment_method text NOT NULL,
        payout_moncash_number text,
        status text NOT NULL DEFAULT 'pending',
        paid_at timestamptz,
        paid_by_admin_id integer REFERENCES users(id),
        notes text,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "admin_messages.create_table",
      sql: `CREATE TABLE IF NOT EXISTS admin_messages (
        id serial PRIMARY KEY,
        from_admin_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_admin_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content text NOT NULL,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "security_questions.create_table",
      sql: `CREATE TABLE IF NOT EXISTS security_questions (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_key text NOT NULL,
        answer_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "security_questions.indexes",
      sql: `CREATE INDEX IF NOT EXISTS security_questions_user_id_idx ON security_questions(user_id)`,
    },
    {
      name: "account_recovery_sessions.create_table",
      sql: `CREATE TABLE IF NOT EXISTS account_recovery_sessions (
        id serial PRIMARY KEY,
        session_token text NOT NULL UNIQUE,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        step text NOT NULL DEFAULT 'otp_pending',
        otp_hash text,
        otp_expires_at timestamptz,
        otp_attempts integer NOT NULL DEFAULT 0,
        otp_sent_via text,
        sq_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        ip text,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )`,
    },
    {
      name: "account_recovery_sessions.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS account_recovery_sessions_token_idx   ON account_recovery_sessions(session_token);
        CREATE INDEX IF NOT EXISTS account_recovery_sessions_user_id_idx ON account_recovery_sessions(user_id);
        CREATE INDEX IF NOT EXISTS account_recovery_sessions_expires_idx ON account_recovery_sessions(expires_at)
      `,
    },
    {
      name: "offers.counter_amount",
      sql: `ALTER TABLE offers ADD COLUMN IF NOT EXISTS counter_amount real`,
    },
    {
      name: "offers.counter_message",
      sql: `ALTER TABLE offers ADD COLUMN IF NOT EXISTS counter_message text`,
    },
    {
      name: "seller_payout_accounts.bank_fields",
      sql: `
        ALTER TABLE seller_payout_accounts
          ADD COLUMN IF NOT EXISTS bank_name text,
          ADD COLUMN IF NOT EXISTS bank_account_name text,
          ADD COLUMN IF NOT EXISTS bank_account_number text,
          ADD COLUMN IF NOT EXISTS bank_verified boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS bank_verified_at timestamptz,
          ADD COLUMN IF NOT EXISTS bank_verified_by integer REFERENCES users(id),
          ADD COLUMN IF NOT EXISTS bank_rejected_reason text
      `,
    },
    {
      name: "support_threads.country",
      sql: `ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS country text`,
    },
    {
      name: "support_messages.sender_role",
      sql: `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS sender_role text NOT NULL DEFAULT 'user'`,
    },
    // ── Performance: indexes for support tables ──────────────────────────────
    {
      name: "support_threads.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS support_threads_user_id_idx        ON support_threads(user_id);
        CREATE INDEX IF NOT EXISTS support_threads_status_idx         ON support_threads(status);
        CREATE INDEX IF NOT EXISTS support_threads_country_idx        ON support_threads(country) WHERE country IS NOT NULL;
        CREATE INDEX IF NOT EXISTS support_threads_assigned_admin_idx ON support_threads(assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS support_threads_last_msg_idx       ON support_threads(last_message_at DESC NULLS LAST)
      `,
    },
    {
      name: "support_messages.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS support_messages_thread_id_idx      ON support_messages(thread_id);
        CREATE INDEX IF NOT EXISTS support_messages_thread_created_idx ON support_messages(thread_id, created_at);
        CREATE INDEX IF NOT EXISTS support_messages_sender_id_idx      ON support_messages(sender_id);
        CREATE INDEX IF NOT EXISTS support_messages_is_read_idx        ON support_messages(thread_id, is_read) WHERE is_read = false
      `,
    },
    // ── Listing views — deduplicated event log ────────────────────────────────
    {
      name: "listing_views.table",
      sql: `
        CREATE TABLE IF NOT EXISTS listing_views (
          id            SERIAL PRIMARY KEY,
          listing_id    INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
          user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
          ip_hash       TEXT    NOT NULL,
          country       TEXT,
          viewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
    },
    {
      name: "listing_views.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS listing_views_listing_id_idx    ON listing_views(listing_id);
        CREATE INDEX IF NOT EXISTS listing_views_ip_hash_idx       ON listing_views(ip_hash);
        CREATE INDEX IF NOT EXISTS listing_views_listing_time_idx  ON listing_views(listing_id, viewed_at);
        CREATE INDEX IF NOT EXISTS listing_views_country_idx       ON listing_views(country) WHERE country IS NOT NULL
      `,
    },
    // ── Boosted video post engagement columns ────────────────────────────────
    {
      name: "listings.shares_count",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS shares_count integer NOT NULL DEFAULT 0`,
    },
    {
      name: "boosts.impressions_clicks",
      sql: `
        ALTER TABLE boosts ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0;
        ALTER TABLE boosts ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0
      `,
    },
    {
      name: "comments.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS comments_listing_id_idx        ON comments(listing_id);
        CREATE INDEX IF NOT EXISTS comments_listing_created_idx   ON comments(listing_id, created_at);
        CREATE INDEX IF NOT EXISTS comments_parent_id_idx         ON comments(parent_id) WHERE parent_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS comments_user_id_idx           ON comments(user_id)
      `,
    },
    {
      name: "boosts.listing_id_idx",
      sql: `CREATE INDEX IF NOT EXISTS boosts_listing_id_idx ON boosts(listing_id)`,
    },
    // ── Performance: users lookup indexes ────────────────────────────────────
    {
      name: "users.perf_indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS users_country_idx      ON users(country) WHERE country IS NOT NULL;
        CREATE INDEX IF NOT EXISTS users_is_admin_idx     ON users(is_admin) WHERE is_admin = true;
        CREATE INDEX IF NOT EXISTS users_is_super_admin_idx ON users(is_super_admin) WHERE is_super_admin = true
      `,
    },
    // ── Restriction system ───────────────────────────────────────────────────
    {
      name: "users.is_restricted",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false`,
    },
    {
      name: "users.restricted_until",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_until timestamptz`,
    },
    {
      name: "users.restriction_reason",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS restriction_reason text`,
    },
    {
      name: "user_restrictions.create_table",
      sql: `
        CREATE TABLE IF NOT EXISTS user_restrictions (
          id serial PRIMARY KEY,
          user_id integer NOT NULL REFERENCES users(id),
          admin_id integer NOT NULL REFERENCES users(id),
          reason text NOT NULL,
          duration_days integer,
          notes text,
          is_active boolean NOT NULL DEFAULT true,
          restricted_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz
        )
      `,
    },
    {
      name: "user_restrictions.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS user_restrictions_user_id_idx   ON user_restrictions(user_id);
        CREATE INDEX IF NOT EXISTS user_restrictions_is_active_idx ON user_restrictions(is_active) WHERE is_active = true
      `,
    },
    {
      name: "users.last_seen_at",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz`,
    },
    {
      name: "users.admin_scope_countries",
      sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_scope_countries text`,
    },
    {
      name: "listings.boost_cta_type",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_cta_type text`,
    },
    {
      name: "listings.boost_external_link",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_external_link text`,
    },
    {
      name: "listings.boost_whatsapp_number",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_whatsapp_number text`,
    },
    {
      name: "listings.boost_cta_text",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_cta_text text`,
    },
    {
      name: "messages.is_listened",
      sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_listened boolean NOT NULL DEFAULT false`,
    },
    {
      name: "transactions.buyer_fee_rate",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_fee_rate real`,
    },
    {
      name: "transactions.buyer_fee_amount",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_fee_amount real`,
    },
    {
      name: "transactions.buyer_total",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_total real`,
    },
    {
      name: "transactions.listing_currency",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS listing_currency text`,
    },
    {
      name: "transactions.listing_price_original",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS listing_price_original real`,
    },
    {
      name: "transactions.exchange_rate_used",
      sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate_used real`,
    },
    {
      name: "seller_payout_accounts.card_payout_method",
      sql: `ALTER TABLE seller_payout_accounts ADD COLUMN IF NOT EXISTS card_payout_method text NOT NULL DEFAULT 'fm_wallet'`,
    },
    {
      name: "platform_settings.exchange_spread_default",
      sql: `INSERT INTO platform_settings (key, value) VALUES ('exchange_spread', '2') ON CONFLICT (key) DO NOTHING`,
    },
    {
      name: "platform_settings.buyer_fee_rate_stripe_default",
      sql: `INSERT INTO platform_settings (key, value) VALUES ('buyer_fee_rate_stripe', '0.025') ON CONFLICT (key) DO NOTHING`,
    },
    {
      name: "driver_applications.create_table",
      sql: `CREATE TABLE IF NOT EXISTS driver_applications (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        status text NOT NULL DEFAULT 'pending',
        first_name text NOT NULL,
        last_name text NOT NULL,
        date_of_birth text NOT NULL,
        address text NOT NULL,
        city text NOT NULL,
        country text NOT NULL,
        whatsapp_number text NOT NULL,
        call_phone text NOT NULL,
        has_smartphone boolean NOT NULL DEFAULT false,
        has_stable_internet boolean NOT NULL DEFAULT false,
        has_fast_phone boolean NOT NULL DEFAULT false,
        phone_brand text,
        phone_model text,
        phone_os text,
        internet_provider text,
        photo_front text,
        photo_side text,
        photo_body text,
        photo_id_selfie text,
        admin_note text,
        reviewed_by_id integer REFERENCES users(id),
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "driver_applications.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS driver_applications_user_id_idx ON driver_applications(user_id);
        CREATE INDEX IF NOT EXISTS driver_applications_status_idx ON driver_applications(status)
      `,
    },
    {
      name: "drivers.create_table",
      sql: `CREATE TABLE IF NOT EXISTS drivers (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        application_id integer REFERENCES driver_applications(id),
        status text NOT NULL DEFAULT 'active',
        country text NOT NULL,
        city text,
        vehicle_type text,
        rating real NOT NULL DEFAULT 0,
        delivery_count integer NOT NULL DEFAULT 0,
        earnings_total real NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "drivers.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS drivers_user_id_idx ON drivers(user_id);
        CREATE INDEX IF NOT EXISTS drivers_country_idx ON drivers(country)
      `,
    },
    {
      name: "deliveries.create_table",
      sql: `CREATE TABLE IF NOT EXISTS deliveries (
        id serial PRIMARY KEY,
        transaction_id integer REFERENCES transactions(id),
        seller_id integer NOT NULL REFERENCES users(id),
        buyer_id integer NOT NULL REFERENCES users(id),
        driver_id integer REFERENCES drivers(id),
        driver_user_id integer REFERENCES users(id),
        delivery_method text NOT NULL,
        pickup_address text,
        pickup_city text,
        delivery_address text,
        delivery_city text,
        country text NOT NULL,
        status text NOT NULL DEFAULT 'waiting',
        verification_code text,
        code_verified_at timestamptz,
        distance_miles real,
        price_per_mile real,
        total_amount real,
        driver_earnings real,
        commission_amount real,
        currency text NOT NULL DEFAULT 'USD',
        payment_held_until timestamptz,
        seller_payment_released boolean NOT NULL DEFAULT false,
        seller_payment_released_at timestamptz,
        seller_note text,
        accepted_at timestamptz,
        picked_up_at timestamptz,
        delivered_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "deliveries.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS deliveries_seller_id_idx ON deliveries(seller_id);
        CREATE INDEX IF NOT EXISTS deliveries_driver_user_id_idx ON deliveries(driver_user_id);
        CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries(status);
        CREATE INDEX IF NOT EXISTS deliveries_transaction_id_idx ON deliveries(transaction_id)
      `,
    },
    {
      name: "deliveries.fee_columns",
      sql: `
        ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS fee_local real;
        ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS fee_usd real;
        ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS distance_km real
      `,
    },
    {
      name: "wallet_transfers.create_table",
      sql: `CREATE TABLE IF NOT EXISTS wallet_transfers (
        id serial PRIMARY KEY,
        from_user_id integer NOT NULL REFERENCES users(id),
        to_user_id integer NOT NULL REFERENCES users(id),
        amount_usd real NOT NULL,
        fee_usd real NOT NULL DEFAULT 0,
        net_amount_usd real NOT NULL,
        currency text NOT NULL DEFAULT 'USD',
        note text,
        status text NOT NULL DEFAULT 'completed',
        daily_fee_charged boolean NOT NULL DEFAULT false,
        daily_fee_date text,
        from_country text,
        to_country text,
        is_international boolean NOT NULL DEFAULT false,
        international_fee_rate real,
        risk_score integer NOT NULL DEFAULT 0,
        is_flagged boolean NOT NULL DEFAULT false,
        flag_reason text,
        ip_address text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "wallet_transfers.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS wallet_transfers_from_user_idx ON wallet_transfers(from_user_id);
        CREATE INDEX IF NOT EXISTS wallet_transfers_to_user_idx ON wallet_transfers(to_user_id);
        CREATE INDEX IF NOT EXISTS wallet_transfers_status_idx ON wallet_transfers(status);
        CREATE INDEX IF NOT EXISTS wallet_transfers_created_idx ON wallet_transfers(created_at)
      `,
    },
    {
      name: "transfer_daily_fees.create_table",
      sql: `CREATE TABLE IF NOT EXISTS transfer_daily_fees (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        fee_date text NOT NULL,
        fee_usd real NOT NULL DEFAULT 3,
        paid boolean NOT NULL DEFAULT false,
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "transfer_daily_fees.index",
      sql: `CREATE INDEX IF NOT EXISTS transfer_daily_fees_user_date_idx ON transfer_daily_fees(user_id, fee_date)`,
    },
    {
      name: "agent_applications.create_table",
      sql: `CREATE TABLE IF NOT EXISTS agent_applications (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        status text NOT NULL DEFAULT 'pending',
        full_name text NOT NULL,
        address text NOT NULL,
        country text NOT NULL,
        city text NOT NULL,
        phone text NOT NULL,
        whatsapp_number text NOT NULL,
        business_name text,
        business_location text,
        business_type text,
        exchange_activity_type text,
        gov_id_front text,
        gov_id_back text,
        selfie_with_id text,
        proof_of_address text,
        monthly_limit_usd real NOT NULL DEFAULT 15000,
        current_month_total_usd real NOT NULL DEFAULT 0,
        current_month_key text,
        admin_note text,
        reviewed_by_id integer REFERENCES users(id),
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "agent_applications.indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS agent_applications_user_id_idx ON agent_applications(user_id);
        CREATE INDEX IF NOT EXISTS agent_applications_status_idx ON agent_applications(status)
      `,
    },
    {
      name: "transfer_monthly_usage.create_table",
      sql: `CREATE TABLE IF NOT EXISTS transfer_monthly_usage (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        month_key text NOT NULL,
        total_sent_usd real NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    },
    {
      name: "transfer_monthly_usage.index",
      sql: `CREATE INDEX IF NOT EXISTS transfer_monthly_usage_user_month_idx ON transfer_monthly_usage(user_id, month_key)`,
    },
    {
      name: "drivers.latitude",
      sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS latitude REAL`,
    },
    {
      name: "drivers.longitude",
      sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS longitude REAL`,
    },
    {
      name: "drivers.commune",
      sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS commune TEXT`,
    },
    {
      name: "drivers.zone",
      sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS zone TEXT`,
    },
    {
      name: "drivers.is_online",
      sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false`,
    },
    {
      name: "drivers.last_location_at",
      sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ`,
    },
    {
      name: "listings.boost_audience_country",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_country text`,
    },
    {
      name: "listings.boost_audience_state",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_state text`,
    },
    {
      name: "listings.boost_audience_city",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_city text`,
    },
    {
      name: "listings.boost_audience_cities",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_cities text[]`,
    },
    {
      name: "listings.boost_audience_age_min",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_age_min integer`,
    },
    {
      name: "listings.boost_audience_age_max",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_age_max integer`,
    },
    {
      name: "listings.boost_audience_gender",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_gender text`,
    },
    {
      name: "listings.boost_audience_objective",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_objective text`,
    },
    {
      name: "listings.boost_audience_type",
      sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_audience_type text`,
    },
    // ── Driver vehicle fields on applications table ──────────────────────────
    { name: "driver_applications.vehicle_type",       sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS vehicle_type text` },
    { name: "driver_applications.vehicle_brand",      sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS vehicle_brand text` },
    { name: "driver_applications.vehicle_model",      sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS vehicle_model text` },
    { name: "driver_applications.vehicle_year",       sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS vehicle_year text` },
    { name: "driver_applications.vehicle_color",      sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS vehicle_color text` },
    { name: "driver_applications.license_plate_number", sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS license_plate_number text` },
    { name: "driver_applications.license_number",     sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS license_number text` },
    { name: "driver_applications.license_expiry",     sql: `ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS license_expiry text` },
    // ── Driver vehicle fields on drivers table ───────────────────────────────
    { name: "drivers.vehicle_brand",       sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_brand text` },
    { name: "drivers.vehicle_model",       sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_model text` },
    { name: "drivers.vehicle_year",        sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_year text` },
    { name: "drivers.vehicle_color",       sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_color text` },
    { name: "drivers.license_plate_number", sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS license_plate_number text` },
    { name: "drivers.photo_front",         sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_front text` },
    { name: "drivers.photo_side",          sql: `ALTER TABLE drivers ADD COLUMN IF NOT EXISTS photo_side text` },
    {
      name: "repair.activate_paid_video_boosts_v1",
      sql: `
        UPDATE listings l
        SET
          is_boosted            = true,
          boost_start_at        = COALESCE(l.boost_start_at, b.created_at, NOW()),
          boost_expires_at      = COALESCE(b.expires_at, NOW() + INTERVAL '7 days'),
          boost_audience_country  = COALESCE(l.boost_audience_country, b.audience_country, l.country),
          boost_audience_state    = COALESCE(l.boost_audience_state,   b.audience_state),
          boost_audience_city     = COALESCE(l.boost_audience_city,    b.audience_city),
          boost_audience_age_min  = COALESCE(l.boost_audience_age_min, b.audience_age_min, 18),
          boost_audience_age_max  = COALESCE(l.boost_audience_age_max, b.audience_age_max, 65),
          boost_audience_gender   = COALESCE(l.boost_audience_gender,  b.audience_gender, 'all'),
          boost_audience_objective = COALESCE(l.boost_audience_objective, b.objective, 'auto'),
          boost_audience_type     = COALESCE(l.boost_audience_type, b.audience_type, 'advantage_plus')
        FROM boosts b
        WHERE b.listing_id    = l.id
          AND b.payment_status = 'paid'
          AND l.is_boosted     = false
          AND l.boost_video_url IS NOT NULL
          AND b.expires_at     > NOW()
      `,
    },
  ];

  // Face-profile photo columns — driver applications
  migrations.push({ name: "add_face_photo_front_to_driver_applications",    sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS face_photo_front TEXT" });
  migrations.push({ name: "add_face_photo_left_to_driver_applications",     sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS face_photo_left TEXT" });
  migrations.push({ name: "add_face_photo_right_to_driver_applications",    sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS face_photo_right TEXT" });
  migrations.push({ name: "add_face_photo_holding_id_to_driver_applications", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS face_photo_holding_id TEXT" });
  // Face-profile photo columns — drivers
  migrations.push({ name: "add_face_photo_front_to_drivers",    sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS face_photo_front TEXT" });
  migrations.push({ name: "add_face_photo_left_to_drivers",     sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS face_photo_left TEXT" });
  migrations.push({ name: "add_face_photo_right_to_drivers",    sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS face_photo_right TEXT" });
  migrations.push({ name: "add_face_photo_holding_id_to_drivers", sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS face_photo_holding_id TEXT" });
  // ── Driver suspension details ──────────────────────────────────────────────
  migrations.push({ name: "drivers.suspension_reason",  sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS suspension_reason TEXT" });
  migrations.push({ name: "drivers.suspended_until",    sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ" });
  migrations.push({ name: "drivers.suspended_by",       sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS suspended_by INTEGER" });
  migrations.push({ name: "drivers.suspended_at",       sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ" });
  // ── Agent application suspension details ──────────────────────────────────
  migrations.push({ name: "agent_applications.suspension_reason", sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS suspension_reason TEXT" });
  migrations.push({ name: "agent_applications.suspended_until",   sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ" });
  migrations.push({ name: "agent_applications.suspended_by",      sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS suspended_by INTEGER" });
  migrations.push({ name: "agent_applications.suspended_at",      sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ" });
  // ── Admin/Moderator suspension by super admin ──────────────────────────────
  migrations.push({ name: "users.is_admin_suspended",       sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin_suspended BOOLEAN NOT NULL DEFAULT FALSE" });
  migrations.push({ name: "users.admin_suspended_until",    sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_suspended_until TIMESTAMPTZ" });
  migrations.push({ name: "users.admin_suspension_reason",  sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_suspension_reason TEXT" });
  migrations.push({ name: "users.admin_suspended_by",       sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_suspended_by INTEGER" });
  migrations.push({ name: "users.admin_suspended_at",       sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_suspended_at TIMESTAMPTZ" });

  // ── Agent online availability ──────────────────────────────────────────────
  migrations.push({ name: "agent_applications.is_online",    sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE" });
  migrations.push({ name: "agent_applications.last_seen_at", sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ" });

  // ── Direct (agent-recharge) conversations — make listing_id nullable ───────
  migrations.push({ name: "conversations.listing_id_nullable", sql: "ALTER TABLE conversations ALTER COLUMN listing_id DROP NOT NULL" });
  migrations.push({ name: "conversations.conversation_type",   sql: "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'listing'" });

  // ── Admin Audit Logs ──────────────────────────────────────────────────────
  migrations.push({ name: "admin_audit_logs.create_table", sql: `
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id SERIAL PRIMARY KEY,
      audit_id TEXT NOT NULL UNIQUE,
      trace_id TEXT NOT NULL UNIQUE,
      actor_id INTEGER NOT NULL,
      actor_name TEXT,
      actor_role TEXT,
      action_type TEXT NOT NULL,
      action_category TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      target_name TEXT,
      description TEXT NOT NULL,
      before_state JSONB,
      after_state JSONB,
      metadata JSONB,
      ip_address TEXT,
      user_agent TEXT,
      device_fingerprint TEXT,
      geolocation TEXT,
      session_id TEXT,
      risk_level TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'completed',
      flagged BOOLEAN NOT NULL DEFAULT FALSE,
      flag_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `});
  migrations.push({ name: "admin_audit_logs.idx_actor",    sql: "CREATE INDEX IF NOT EXISTS idx_aal_actor ON admin_audit_logs(actor_id)" });
  migrations.push({ name: "admin_audit_logs.idx_category", sql: "CREATE INDEX IF NOT EXISTS idx_aal_category ON admin_audit_logs(action_category)" });
  migrations.push({ name: "admin_audit_logs.idx_target",   sql: "CREATE INDEX IF NOT EXISTS idx_aal_target ON admin_audit_logs(target_id, target_type)" });
  migrations.push({ name: "admin_audit_logs.idx_created",  sql: "CREATE INDEX IF NOT EXISTS idx_aal_created ON admin_audit_logs(created_at DESC)" });

  // ── Authorized-agent withdrawal flow ──────────────────────────────────────
  migrations.push({ name: "cashout_requests.assigned_agent_app_id", sql: "ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS assigned_agent_app_id integer" });
  migrations.push({ name: "cashout_requests.screenshot_url",        sql: "ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS screenshot_url text" });
  migrations.push({ name: "cashout_requests.user_note",             sql: "ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS user_note text" });
  migrations.push({ name: "cashout_requests.payout_method_note",    sql: "ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS payout_method_note text" });
  migrations.push({ name: "cashout_requests.idx_agent_app",         sql: "CREATE INDEX IF NOT EXISTS idx_cashout_assigned_agent ON cashout_requests(assigned_agent_app_id) WHERE assigned_agent_app_id IS NOT NULL" });
  migrations.push({ name: "agent_applications.fm_wallet_number",    sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS fm_wallet_number text" });
  migrations.push({ name: "agent_applications.supported_methods",   sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS supported_methods text" });

  // ── Application moderation: request-changes support ───────────────────────
  migrations.push({ name: "agent_applications.changes_requested_reason", sql: "ALTER TABLE agent_applications ADD COLUMN IF NOT EXISTS changes_requested_reason text" });
  migrations.push({ name: "driver_applications.changes_requested_reason", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS changes_requested_reason text" });

  // ── AI Chat Translation System ──────────────────────────────────────────────
  migrations.push({ name: "users.translate_messages", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS translate_messages boolean NOT NULL DEFAULT false" });
  migrations.push({ name: "message_translations.create_table", sql: `CREATE TABLE IF NOT EXISTS message_translations (id serial PRIMARY KEY, message_id integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE, target_language text NOT NULL, translated_text text NOT NULL, detected_language text, created_at timestamptz NOT NULL DEFAULT now())` });
  migrations.push({ name: "message_translations.unique_idx", sql: "CREATE UNIQUE INDEX IF NOT EXISTS message_translations_msg_lang_idx ON message_translations(message_id, target_language)" });

  // ── Comment Likes ───────────────────────────────────────────────────────────
  migrations.push({ name: "comment_likes.create_table", sql: `CREATE TABLE IF NOT EXISTS comment_likes (id serial PRIMARY KEY, comment_id integer NOT NULL REFERENCES comments(id) ON DELETE CASCADE, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(comment_id, user_id))` });
  migrations.push({ name: "comment_likes.idx", sql: "CREATE INDEX IF NOT EXISTS comment_likes_comment_id_idx ON comment_likes(comment_id)" });

  // ── Vehicle Images (Smart Vehicle Matching) ──────────────────────────────────
  migrations.push({ name: "vehicle_images.create_table", sql: `CREATE TABLE IF NOT EXISTS vehicle_images (id serial PRIMARY KEY, brand text NOT NULL, model text NOT NULL, year_from integer, year_to integer, image_url text NOT NULL, body_style text, created_by integer REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now())` });
  migrations.push({ name: "vehicle_images.brand_model_idx", sql: "CREATE INDEX IF NOT EXISTS vehicle_images_brand_model_idx ON vehicle_images(lower(brand), lower(model))" });

  // 201 — allow_edit on rejected driver applications
  migrations.push({ name: "driver_applications.allow_edit", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS allow_edit boolean NOT NULL DEFAULT false" });

  // 202-208 — new vehicle document photo columns
  migrations.push({ name: "driver_applications.photo_vehicle_registration", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_vehicle_registration text" });
  migrations.push({ name: "driver_applications.photo_vehicle_insurance",    sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_vehicle_insurance text" });
  migrations.push({ name: "driver_applications.photo_license_front",        sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_license_front text" });
  migrations.push({ name: "driver_applications.photo_license_back",         sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_license_back text" });
  migrations.push({ name: "driver_applications.photo_vehicle_front",        sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_vehicle_front text" });
  migrations.push({ name: "driver_applications.photo_vehicle_side",         sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_vehicle_side text" });
  migrations.push({ name: "driver_applications.photo_license_plate",        sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_license_plate text" });

  // 209-210 — security balance + first recharge flag on promo_wallets
  migrations.push({ name: "promo_wallets.security_balance", sql: "ALTER TABLE promo_wallets ADD COLUMN IF NOT EXISTS security_balance real NOT NULL DEFAULT 0" });
  migrations.push({ name: "promo_wallets.first_recharge_done", sql: "ALTER TABLE promo_wallets ADD COLUMN IF NOT EXISTS first_recharge_done boolean NOT NULL DEFAULT false" });

  // 211 — driver tips table (100% go to driver, no platform cut)
  migrations.push({ name: "driver_tips.create_table", sql: `CREATE TABLE IF NOT EXISTS driver_tips (
    id serial PRIMARY KEY,
    delivery_id integer NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    from_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_usd real NOT NULL,
    message text,
    rating integer,
    from_user_type text NOT NULL DEFAULT 'buyer',
    status text NOT NULL DEFAULT 'completed',
    created_at timestamptz NOT NULL DEFAULT now()
  )` });
  // 212 — tip uniqueness: one tip per (user, delivery) to prevent spam
  migrations.push({ name: "driver_tips.unique_idx", sql: "CREATE UNIQUE INDEX IF NOT EXISTS driver_tips_user_delivery_idx ON driver_tips(from_user_id, delivery_id)" });
  // 213 — indexes for fast driver lookups
  migrations.push({ name: "driver_tips.indexes", sql: `
    CREATE INDEX IF NOT EXISTS driver_tips_driver_user_id_idx ON driver_tips(driver_user_id);
    CREATE INDEX IF NOT EXISTS driver_tips_delivery_id_idx ON driver_tips(delivery_id);
    CREATE INDEX IF NOT EXISTS driver_tips_created_at_idx ON driver_tips(created_at DESC)
  ` });
  // 214 — tips_total column on drivers for fast stats
  migrations.push({ name: "drivers.tips_total", sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS tips_total real NOT NULL DEFAULT 0" });
  // 215 — driver reviews table (one review per user per delivery, anti-fraud enforced by UNIQUE index)
  migrations.push({ name: "driver_reviews.create_table", sql: `CREATE TABLE IF NOT EXISTS driver_reviews (
    id serial PRIMARY KEY,
    delivery_id integer NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    from_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text,
    tags text[],
    from_user_type text NOT NULL DEFAULT 'buyer',
    flagged boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )` });
  // 216 — one review per (user, delivery) — prevents review spam
  migrations.push({ name: "driver_reviews.unique_idx", sql: "CREATE UNIQUE INDEX IF NOT EXISTS driver_reviews_user_delivery_idx ON driver_reviews(from_user_id, delivery_id)" });
  // 217 — fast lookup indexes
  migrations.push({ name: "driver_reviews.indexes", sql: `
    CREATE INDEX IF NOT EXISTS driver_reviews_driver_user_id_idx ON driver_reviews(driver_user_id);
    CREATE INDEX IF NOT EXISTS driver_reviews_delivery_id_idx ON driver_reviews(delivery_id);
    CREATE INDEX IF NOT EXISTS driver_reviews_rating_idx ON driver_reviews(rating);
    CREATE INDEX IF NOT EXISTS driver_reviews_created_at_idx ON driver_reviews(created_at DESC)
  ` });
  // 218 — driver aggregate columns (avg_rating, review_count, flagged_for_review)
  migrations.push({ name: "drivers.review_count", sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0" });
  migrations.push({ name: "drivers.flagged_for_review", sql: "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false" });
  // 219 — delivery photo columns for pickup/drop-off verification
  migrations.push({ name: "deliveries.pickup_photo_url", sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS pickup_photo_url text" });
  migrations.push({ name: "deliveries.dropoff_photo_url", sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS dropoff_photo_url text" });
  // 221 — delivery fee columns on transactions (so buyer total includes delivery at checkout)
  migrations.push({ name: "transactions.delivery_fee_usd", sql: "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_fee_usd real" });
  migrations.push({ name: "transactions.delivery_method", sql: "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_method text" });
  migrations.push({ name: "transactions.delivery_pickup_city", sql: "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_pickup_city text" });
  migrations.push({ name: "transactions.delivery_dest_city", sql: "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_dest_city text" });
  // 222 — tip_credit / tip_received are string enum values, no schema change needed
  // 226-227 — international shipping: flat-rate cost + accepted carriers on listings
  migrations.push({ name: "listings.shipping_cost", sql: "ALTER TABLE listings ADD COLUMN IF NOT EXISTS shipping_cost real" });
  migrations.push({ name: "listings.shipping_carriers", sql: "ALTER TABLE listings ADD COLUMN IF NOT EXISTS shipping_carriers text[]" });
  // 228 — seller-chosen local delivery method (motorcycle / car) on listings
  migrations.push({ name: "listings.delivery_method", sql: "ALTER TABLE listings ADD COLUMN IF NOT EXISTS delivery_method text" });
  // 229 — buyer tip for driver (100% goes to driver, boosts priority)
  migrations.push({ name: "deliveries.tip_usd", sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS tip_usd real" });
  migrations.push({ name: "deliveries.speed_tier", sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS speed_tier text" });
  // 231-240 — driver application new fields (banking, availability, vehicle back photo, selfie)
  migrations.push({ name: "driver_applications.photo_vehicle_back", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS photo_vehicle_back text" });
  migrations.push({ name: "driver_applications.insurance_number", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS insurance_number text" });
  migrations.push({ name: "driver_applications.selfie_photo_url", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS selfie_photo_url text" });
  migrations.push({ name: "driver_applications.bank_name", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS bank_name text" });
  migrations.push({ name: "driver_applications.bank_account_name", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS bank_account_name text" });
  migrations.push({ name: "driver_applications.bank_account_number", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS bank_account_number text" });
  migrations.push({ name: "driver_applications.preferred_payment_method", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS preferred_payment_method text" });
  migrations.push({ name: "driver_applications.work_zones", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS work_zones text" });
  migrations.push({ name: "driver_applications.work_hours", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS work_hours text" });
  migrations.push({ name: "driver_applications.max_delivery_km", sql: "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS max_delivery_km integer" });

  // 241 — message column on notifications (delivery confirmation codes + rich messages)
  migrations.push({ name: "notifications.message", sql: "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text" });

  // 242 — listing_id directly on deliveries for reliable product photo display in driver view
  migrations.push({ name: "deliveries.listing_id", sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS listing_id integer REFERENCES listings(id)" });

  // 243 — backfill listing_id on existing deliveries from their linked transaction
  migrations.push({ name: "deliveries.listing_id_backfill", sql: `UPDATE deliveries d SET listing_id = t.listing_id FROM transactions t WHERE d.transaction_id = t.id AND d.listing_id IS NULL AND t.listing_id IS NOT NULL` });

  // 244 — cancellation support: timestamp columns for order and delivery cancellations
  migrations.push({ name: "transactions.cancelled_at", sql: "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz" });
  migrations.push({ name: "deliveries.cancelled_at",   sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_at timestamptz" });

  // 245 — merchant growth support: business loan applications (Haiti + DR only)
  migrations.push({ name: "loan_applications.create", sql: `
    CREATE TABLE IF NOT EXISTS loan_applications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending_review',
      amount_requested NUMERIC(10,2) NOT NULL,
      term_months INTEGER NOT NULL DEFAULT 6,
      full_name TEXT,
      dob TEXT,
      whatsapp TEXT,
      business_phone TEXT,
      emergency_phone TEXT,
      address TEXT,
      city TEXT,
      country TEXT,
      business_name TEXT,
      business_category TEXT,
      business_description TEXT,
      business_age_years INTEGER,
      monthly_sales_usd NUMERIC(10,2),
      business_photos JSONB DEFAULT '[]'::jsonb,
      product_photos JSONB DEFAULT '[]'::jsonb,
      business_docs JSONB DEFAULT '[]'::jsonb,
      identity_doc TEXT,
      facebook_url TEXT,
      tiktok_url TEXT,
      instagram_url TEXT,
      reviewer_id INTEGER REFERENCES users(id),
      reviewer_note TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  ` });
  migrations.push({ name: "loan_applications.user_idx", sql: "CREATE INDEX IF NOT EXISTS loan_applications_user_id_idx ON loan_applications(user_id)" });
  migrations.push({ name: "loan_applications.status_idx", sql: "CREATE INDEX IF NOT EXISTS loan_applications_status_idx ON loan_applications(status)" });

  // 248 — loan repayment: extra columns on loan_applications
  migrations.push({ name: "loan_applications.approved_at",        sql: "ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ" });
  migrations.push({ name: "loan_applications.completed_at",       sql: "ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ" });
  migrations.push({ name: "loan_applications.total_repayment",    sql: "ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS total_repayment_usd NUMERIC(10,2)" });
  migrations.push({ name: "loan_applications.amount_paid",        sql: "ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS amount_paid_usd NUMERIC(10,2) NOT NULL DEFAULT 0" });

  // 249 — monthly installment schedule per loan
  migrations.push({ name: "loan_installments.create", sql: `
    CREATE TABLE IF NOT EXISTS loan_installments (
      id SERIAL PRIMARY KEY,
      loan_id INTEGER NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      installment_number INTEGER NOT NULL,
      due_date TIMESTAMPTZ NOT NULL,
      amount_usd NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_at TIMESTAMPTZ,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_retry_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  ` });
  migrations.push({ name: "loan_installments.loan_idx",   sql: "CREATE INDEX IF NOT EXISTS loan_installments_loan_id_idx ON loan_installments(loan_id)" });
  migrations.push({ name: "loan_installments.user_idx",   sql: "CREATE INDEX IF NOT EXISTS loan_installments_user_id_idx ON loan_installments(user_id)" });
  migrations.push({ name: "loan_installments.status_due", sql: "CREATE INDEX IF NOT EXISTS loan_installments_status_due_idx ON loan_installments(status, due_date)" });

  // 250 — full audit log of every deduction attempt
  migrations.push({ name: "loan_payment_attempts.create", sql: `
    CREATE TABLE IF NOT EXISTS loan_payment_attempts (
      id SERIAL PRIMARY KEY,
      installment_id INTEGER NOT NULL REFERENCES loan_installments(id) ON DELETE CASCADE,
      loan_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      result TEXT NOT NULL,
      error_msg TEXT,
      amount_usd NUMERIC(10,2) NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  ` });
  migrations.push({ name: "loan_payment_attempts.inst_idx", sql: "CREATE INDEX IF NOT EXISTS loan_payment_attempts_inst_idx ON loan_payment_attempts(installment_id)" });

  // 259 — employer verification applications for the Jobs/Djòb marketplace
  migrations.push({ name: "employer_verifications.create", sql: `
    CREATE TABLE IF NOT EXISTS employer_verifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      address TEXT NOT NULL,
      business_name TEXT,
      business_address TEXT,
      id_selfie TEXT,
      id_front TEXT,
      id_back TEXT,
      business_photos TEXT[],
      social_links JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  ` });
  migrations.push({ name: "employer_verifications.user_idx", sql: "CREATE INDEX IF NOT EXISTS employer_verifications_user_idx ON employer_verifications(user_id)" });
  migrations.push({ name: "employer_verifications.status_idx", sql: "CREATE INDEX IF NOT EXISTS employer_verifications_status_idx ON employer_verifications(status)" });
  migrations.push({ name: "users.is_verified_employer", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified_employer BOOLEAN NOT NULL DEFAULT FALSE" });

  // 260 — job applications (seekers apply to specific jobs)
  migrations.push({ name: "job_applications.create", sql: `
    CREATE TABLE IF NOT EXISTS job_applications (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      applicant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cover_letter TEXT,
      whatsapp TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      employer_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(job_id, applicant_id)
    )
  ` });
  migrations.push({ name: "job_applications.job_idx",  sql: "CREATE INDEX IF NOT EXISTS job_applications_job_idx ON job_applications(job_id)" });
  migrations.push({ name: "job_applications.user_idx", sql: "CREATE INDEX IF NOT EXISTS job_applications_user_idx ON job_applications(applicant_id)" });

  // 261 — extra columns on jobs for enhanced posting
  migrations.push({ name: "jobs.category",          sql: "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category TEXT" });
  migrations.push({ name: "jobs.job_type",           sql: "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT" });
  migrations.push({ name: "jobs.work_schedule",      sql: "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_schedule TEXT" });
  migrations.push({ name: "jobs.salary_max",         sql: "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_max REAL" });
  migrations.push({ name: "jobs.experience_level",   sql: "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS experience_level TEXT" });
  migrations.push({ name: "jobs.deadline",           sql: "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ" });
  migrations.push({ name: "jobs.application_count",  sql: "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_count INTEGER NOT NULL DEFAULT 0" });

  // 262 — delivery failed-pickup + return trip fee system
  migrations.push({ name: "deliveries.hold_amount_usd",    sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS hold_amount_usd real" });
  migrations.push({ name: "deliveries.hold_released",      sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS hold_released boolean NOT NULL DEFAULT false" });
  migrations.push({ name: "deliveries.hold_released_at",   sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS hold_released_at timestamptz" });
  migrations.push({ name: "deliveries.return_code",        sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS return_code text" });
  migrations.push({ name: "deliveries.return_confirmed_at",sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS return_confirmed_at timestamptz" });
  migrations.push({ name: "deliveries.failed_pickup_at",   sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS failed_pickup_at timestamptz" });
  migrations.push({ name: "deliveries.return_fee_usd",     sql: "ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS return_fee_usd real" });

  // 270 — Kart Rechaj (FM Recharge Cards)
  migrations.push({ name: "recharge_cards.create_table", sql: `
    CREATE TABLE IF NOT EXISTS recharge_cards (
      id            SERIAL PRIMARY KEY,
      code          TEXT NOT NULL UNIQUE,
      amount_usd    REAL NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active',
      batch_id      TEXT,
      expires_at    TIMESTAMPTZ,
      created_by    INTEGER REFERENCES users(id),
      redeemed_by   INTEGER REFERENCES users(id),
      redeemed_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `});
  migrations.push({ name: "recharge_cards.idx_code",      sql: "CREATE INDEX IF NOT EXISTS idx_recharge_cards_code      ON recharge_cards(code)" });
  migrations.push({ name: "recharge_cards.idx_status",    sql: "CREATE INDEX IF NOT EXISTS idx_recharge_cards_status    ON recharge_cards(status)" });
  migrations.push({ name: "recharge_cards.idx_batch",     sql: "CREATE INDEX IF NOT EXISTS idx_recharge_cards_batch_id  ON recharge_cards(batch_id)" });
  migrations.push({ name: "messages.is_deleted",          sql: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false" });
  migrations.push({ name: "messages.deleted_at",          sql: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ" });
  migrations.push({ name: "transactions.shipping_zip",    sql: "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS shipping_zip TEXT" });
  migrations.push({ name: "listings.weight_lbs",          sql: "ALTER TABLE listings ADD COLUMN IF NOT EXISTS weight_lbs REAL" });
  migrations.push({ name: "listings.package_length_in",   sql: "ALTER TABLE listings ADD COLUMN IF NOT EXISTS package_length_in REAL" });
  migrations.push({ name: "listings.package_width_in",    sql: "ALTER TABLE listings ADD COLUMN IF NOT EXISTS package_width_in REAL" });
  migrations.push({ name: "listings.package_height_in",   sql: "ALTER TABLE listings ADD COLUMN IF NOT EXISTS package_height_in REAL" });

  // ── BNPL settings table ───────────────────────────────────────────────────
  migrations.push({
    name: "bnpl_settings.create_table",
    sql: `
      CREATE TABLE IF NOT EXISTS bnpl_settings (
        id INTEGER PRIMARY KEY,
        klarna_enabled BOOLEAN NOT NULL DEFAULT true,
        affirm_enabled BOOLEAN NOT NULL DEFAULT true,
        afterpay_enabled BOOLEAN NOT NULL DEFAULT true,
        min_amount_usd REAL NOT NULL DEFAULT 50,
        max_amount_usd REAL NOT NULL DEFAULT 2000,
        platform_fee_pct REAL NOT NULL DEFAULT 3.5,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  });
  migrations.push({
    name: "bnpl_settings.seed_default_row",
    sql: `
      INSERT INTO bnpl_settings (id, klarna_enabled, affirm_enabled, afterpay_enabled, min_amount_usd, max_amount_usd, platform_fee_pct)
      VALUES (1, true, true, true, 50, 2000, 3.5)
      ON CONFLICT (id) DO NOTHING
    `,
  });

  // ── Drop old security floor constraint (model changed: balanceUsd is now SPENDABLE only) ──
  // Previously balance_usd included the $2 security, so we had a floor constraint.
  // Now security is hard-deducted: balance_usd can legitimately be 0 while securityBalance=$2.
  migrations.push({
    name: "promo_wallets.drop_balance_security_floor_constraint",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'promo_wallets_balance_above_security_floor'
            AND conrelid = 'promo_wallets'::regclass
        ) THEN
          ALTER TABLE promo_wallets
            DROP CONSTRAINT promo_wallets_balance_above_security_floor;
        END IF;
      END
      $$
    `,
  });

  // ── NEUTRALIZED: security deposit deduction — system removed ────────────────
  // This migration previously deducted security_balance from balance_usd on
  // every restart (NOT idempotent). Replaced with a harmless no-op so the
  // migration name remains tracked without causing further balance deductions.
  migrations.push({
    name: "promo_wallets.fix_security_deposit_hard_deduct",
    sql: `SELECT 1 -- no-op: security deposit system removed`,
  });

  // ── Order Returns System ──────────────────────────────────────────────────────
  migrations.push({
    name: "order_returns.create_table",
    sql: `
      CREATE TABLE IF NOT EXISTS order_returns (
        id                     SERIAL PRIMARY KEY,
        order_id               INTEGER NOT NULL REFERENCES transactions(id),
        buyer_id               INTEGER NOT NULL REFERENCES users(id),
        seller_id              INTEGER REFERENCES users(id),
        reason                 TEXT NOT NULL,
        description            TEXT,
        status                 TEXT NOT NULL DEFAULT 'requested',
        seller_note            TEXT,
        admin_note             TEXT,
        return_tracking_number TEXT,
        return_carrier         TEXT,
        refund_amount          REAL,
        requested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        seller_responded_at    TIMESTAMPTZ,
        admin_decided_at       TIMESTAMPTZ,
        buyer_shipped_at       TIMESTAMPTZ,
        refunded_at            TIMESTAMPTZ,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  });
  migrations.push({ name: "order_returns.idx_order",  sql: "CREATE INDEX IF NOT EXISTS idx_order_returns_order  ON order_returns(order_id)" });
  migrations.push({ name: "order_returns.idx_buyer",  sql: "CREATE INDEX IF NOT EXISTS idx_order_returns_buyer  ON order_returns(buyer_id)" });
  migrations.push({ name: "order_returns.idx_seller", sql: "CREATE INDEX IF NOT EXISTS idx_order_returns_seller ON order_returns(seller_id)" });
  migrations.push({ name: "order_returns.idx_status", sql: "CREATE INDEX IF NOT EXISTS idx_order_returns_status ON order_returns(status)" });
  migrations.push({ name: "order_returns.add_refund_method",    sql: "ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS refund_method TEXT DEFAULT 'wallet'" });
  migrations.push({ name: "order_returns.add_stripe_refund_id", sql: "ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT" });

  // ── AI Guardian decisions table ──────────────────────────────────────────────
  migrations.push({
    name: "ai_guardian_decisions.create_table",
    sql: `
      CREATE TABLE IF NOT EXISTS ai_guardian_decisions (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action           TEXT NOT NULL,
        reason           TEXT NOT NULL,
        triggered_by     TEXT NOT NULL DEFAULT 'system',
        ai_analysis      TEXT,
        expires_at       TIMESTAMPTZ,
        admin_reviewed   BOOLEAN NOT NULL DEFAULT false,
        admin_reviewed_at TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  });
  migrations.push({ name: "ai_guardian_decisions.idx_user",    sql: "CREATE INDEX IF NOT EXISTS ai_guardian_user_idx    ON ai_guardian_decisions(user_id)" });
  migrations.push({ name: "ai_guardian_decisions.idx_action",  sql: "CREATE INDEX IF NOT EXISTS ai_guardian_action_idx  ON ai_guardian_decisions(action)" });
  migrations.push({ name: "ai_guardian_decisions.idx_created", sql: "CREATE INDEX IF NOT EXISTS ai_guardian_created_idx ON ai_guardian_decisions(created_at DESC)" });

  // ── NEUTRALIZED: universal security deposit backfill — system removed ────────
  // This migration previously deducted $2 from every wallet with balance >= 2.
  // The security deposit system is fully discontinued. No-op to avoid re-deduction.
  migrations.push({
    name: "promo_wallets.universal_security_backfill_v2",
    sql: `SELECT 1 -- no-op: security deposit system removed`,
  });

  migrations.push({ name: "users.must_change_password", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false" });

  migrations.push({
    name: "chargebacks.create_table",
    sql: `
      CREATE TABLE IF NOT EXISTS chargebacks (
        id                       SERIAL PRIMARY KEY,
        user_id                  INTEGER REFERENCES users(id),
        stripe_dispute_id        TEXT UNIQUE,
        stripe_charge_id         TEXT,
        stripe_payment_intent_id TEXT,
        amount_usd               REAL NOT NULL,
        status                   TEXT NOT NULL DEFAULT 'open',
        wallet_deducted          BOOLEAN NOT NULL DEFAULT false,
        user_restricted          BOOLEAN NOT NULL DEFAULT false,
        notes                    TEXT,
        resolved_by              INTEGER REFERENCES users(id),
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at              TIMESTAMPTZ
      )
    `,
  });
  migrations.push({ name: "chargebacks.idx_user",    sql: "CREATE INDEX IF NOT EXISTS idx_chargebacks_user    ON chargebacks(user_id)" });
  migrations.push({ name: "chargebacks.idx_dispute", sql: "CREATE INDEX IF NOT EXISTS idx_chargebacks_dispute ON chargebacks(stripe_dispute_id)" });
  migrations.push({ name: "chargebacks.idx_status",  sql: "CREATE INDEX IF NOT EXISTS idx_chargebacks_status  ON chargebacks(status)" });

  // ── Wallet balance floor constraints (DB-level hard guarantee) ────────────
  // These CHECK constraints make it impossible for any code path — including
  // future bugs — to push any balance column below zero at the database level.
  // Wallet balance floor constraints — DB-level hard guarantee against negative balances.
  // Uses DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL $$ for true idempotency:
  // ADD CONSTRAINT has no IF NOT EXISTS in PostgreSQL, and Drizzle wraps the error as
  // "Failed query: ..." so the catch block's "already exists" check doesn't fire.
  migrations.push({ name: "promo_wallets.chk_balance_usd_non_negative", sql: `
    DO $$ BEGIN
      ALTER TABLE promo_wallets ADD CONSTRAINT chk_balance_usd_non_negative CHECK (balance_usd >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  ` });
  migrations.push({ name: "promo_wallets.chk_security_balance_non_negative", sql: `
    DO $$ BEGIN
      ALTER TABLE promo_wallets ADD CONSTRAINT chk_security_balance_non_negative CHECK (security_balance >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  ` });
  migrations.push({ name: "promo_wallets.chk_promo_balance_non_negative", sql: `
    DO $$ BEGIN
      ALTER TABLE promo_wallets ADD CONSTRAINT chk_promo_balance_non_negative CHECK (promo_balance >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  ` });
  migrations.push({ name: "promo_wallets.chk_unlocked_balance_non_negative", sql: `
    DO $$ BEGIN
      ALTER TABLE promo_wallets ADD CONSTRAINT chk_unlocked_balance_non_negative CHECK (unlocked_balance >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  ` });

  // ── Auto-approve sammyjeanlouis8@gmail.com as Authorized Agent ───────────────
  // Platform owner gets $15,000/month transfer limit. Idempotent: skips if an
  // approved record already exists for this user.
  migrations.push({
    name: "agent_applications.owner_sammy_auto_approve",
    sql: `
      DO $$
      DECLARE
        v_user_id INTEGER;
        v_phone   TEXT;
      BEGIN
        SELECT id, COALESCE(phone, '+50900000000')
          INTO v_user_id, v_phone
          FROM users
         WHERE lower(email) = 'sammyjeanlouis8@gmail.com'
         LIMIT 1;

        IF v_user_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM agent_applications
             WHERE user_id = v_user_id AND status = 'approved'
          ) THEN
            INSERT INTO agent_applications (
              user_id, status,
              full_name, address, country, city, phone, whatsapp_number,
              monthly_limit_usd, reviewed_at, admin_note,
              created_at, updated_at
            ) VALUES (
              v_user_id, 'approved',
              'Sammy Jean Louis', 'Haiti', 'HT', 'Port-au-Prince',
              v_phone, v_phone,
              15000, NOW(), 'Auto-approved: Platform owner / Super Admin',
              NOW(), NOW()
            );
          END IF;
        END IF;
      END $$
    `,
  });

  // ── Retroactive security_deposit wallet_transaction entries ──────────────────
  // Users who had $2 taken silently by the universal_security_backfill_v2
  // migration have NO wallet_transaction record for it. This migration creates
  // the missing entries so wallet history reconciles correctly.
  migrations.push({
    name: "wallet_transactions.backfill_missing_security_deposits_v1",
    sql: `
      INSERT INTO wallet_transactions (user_id, type, amount_usd, status, note, created_at)
      SELECT
        pw.user_id,
        'security_deposit',
        -2,
        'completed',
        'Depòt sekirite — $2.00 bloke kont fro (retroaktif)',
        NOW()
      FROM promo_wallets pw
      WHERE pw.security_balance > 0
        AND pw.first_recharge_done = true
        AND NOT EXISTS (
          SELECT 1 FROM wallet_transactions wt
          WHERE wt.user_id = pw.user_id
            AND wt.type = 'security_deposit'
        )
    `,
  });

  migrations.push({
    name: "transactions.add_delivery_type_v1",
    sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'delivery'`,
  });

  migrations.push({
    name: "transactions.add_buyer_proposed_delivery_fee_v1",
    sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyer_proposed_delivery_fee REAL`,
  },
  {
    name: "listings.item_size",
    sql: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS item_size text`,
  },
  // ── Buyer-absent delivery flow ────────────────────────────────────────────
  {
    name: "deliveries.buyer_absent_at",
    sql: `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS buyer_absent_at timestamptz`,
  },
  {
    name: "deliveries.buyer_reschedule_deadline",
    sql: `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS buyer_reschedule_deadline timestamptz`,
  },
  {
    name: "deliveries.reschedule_count",
    sql: `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS reschedule_count int NOT NULL DEFAULT 0`,
  });

  // ── vendor_subscriptions: FM-wallet auto-renewal columns ──────────────────
  migrations.push({
    name: "vendor_subscriptions.wallet_payment_attempts",
    sql: `ALTER TABLE vendor_subscriptions ADD COLUMN IF NOT EXISTS wallet_payment_attempts integer NOT NULL DEFAULT 0`,
  });
  migrations.push({
    name: "vendor_subscriptions.next_wallet_retry_at",
    sql: `ALTER TABLE vendor_subscriptions ADD COLUMN IF NOT EXISTS next_wallet_retry_at timestamptz`,
  });
  migrations.push({
    name: "vendor_subscriptions.next_wallet_retry_idx",
    sql: `CREATE INDEX IF NOT EXISTS vendor_subscriptions_next_wallet_retry_idx ON vendor_subscriptions(next_wallet_retry_at)`,
  });

  // ── Deduplicate wallet_transactions.payment_ref before adding unique index ───
  // If any historical rows share the same non-null payment_ref (e.g. from an
  // earlier version of the return flow that reused the same ref for both seller
  // debit and buyer credit), rename the older duplicates so the index creation
  // below can succeed. Idempotent: no-op when no duplicates exist.
  migrations.push({
    name: "wallet_transactions.dedup_payment_ref_v1",
    sql: `UPDATE wallet_transactions
          SET payment_ref = payment_ref || '_legacy_dup_' || id
          WHERE id IN (
            SELECT id FROM (
              SELECT id,
                     ROW_NUMBER() OVER (
                       PARTITION BY payment_ref
                       ORDER BY created_at DESC, id DESC
                     ) AS rn
              FROM wallet_transactions
              WHERE payment_ref IS NOT NULL
            ) ranked
            WHERE rn > 1
          )`,
  });

  // ── Restore security deposit to balance_usd (runs inside the loop) ───────────
  // Returns any locked security_balance back to balance_usd.
  migrations.push({
    name: "wallet_transactions.add_payment_ref_unique_idx",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_payment_ref_unique_idx
          ON wallet_transactions (payment_ref)
          WHERE payment_ref IS NOT NULL`,
  });

  // Idempotent: WHERE security_balance > 0 only matches wallets not yet restored.
  // Previously this was pushed AFTER the for loop (bug) and never ran — fixed here.
  migrations.push({
    name: "promo_wallets.remove_security_deposit_v1",
    sql: `UPDATE promo_wallets
          SET balance_usd      = balance_usd + security_balance,
              security_balance = 0,
              updated_at       = NOW()
          WHERE security_balance > 0`,
  });

  // ── KYC / Identity verification ───────────────────────────────────────────
  migrations.push({
    name: "users.kyc_columns_v1",
    sql: `ALTER TABLE users
          ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'not_submitted',
          ADD COLUMN IF NOT EXISTS kyc_document_url TEXT,
          ADD COLUMN IF NOT EXISTS kyc_selfie_url TEXT,
          ADD COLUMN IF NOT EXISTS kyc_document_type TEXT,
          ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
          ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS kyc_reviewed_by INTEGER`,
  });

  migrations.push({
    name: "users.kyc_status_idx_v1",
    sql: `CREATE INDEX IF NOT EXISTS users_kyc_status_idx ON users (kyc_status)`,
  });

  migrations.push({
    name: "expo_push_tokens.create_table",
    sql: `CREATE TABLE IF NOT EXISTS expo_push_tokens (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL,
      device_id text,
      platform text,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )`,
  });

  migrations.push({
    name: "expo_push_tokens.indexes",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS expo_push_tokens_token_idx    ON expo_push_tokens(token);
      CREATE        INDEX IF NOT EXISTS expo_push_tokens_user_id_idx  ON expo_push_tokens(user_id)
    `,
  });

  let applied = 0;
  let failed = 0;

  for (const m of migrations) {
    try {
      await db.execute(sql.raw(m.sql));
      applied++;
    } catch (err: any) {
      // Ignore "already exists" errors; log real failures as warnings
      if (!err?.message?.includes("already exists")) {
        logger.warn({ migration: m.name, err: err?.message }, "Migration warning");
        failed++;
      }
    }
  }

  logger.info({ applied, failed }, "Startup migrations complete");
}

