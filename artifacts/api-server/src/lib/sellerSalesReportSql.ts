/**
 * Reporting-only SELECTs. No provider calls, balance reads, DML, or new ledger.
 * Amounts are PostgreSQL NUMERIC integer minor units, serialized as strings.
 * Refund allocation follows the existing admin Stripe report's retained ratio;
 * original commission/earnings are snapshots, never recomputed using today's rates.
 */
export const REPORT_OWNER_SQL = `
  t.type = 'purchase'
  AND (t.seller_user_id = $1 OR (t.seller_user_id IS NULL AND l.seller_id = $1))
`;

export const REPORT_CTE_SQL = `
WITH period AS (
  SELECT ($2::date::timestamp AT TIME ZONE $3) AS start_at,
    (($2::date + INTERVAL '1 month')::timestamp AT TIME ZONE $3) AS end_at
), base AS MATERIALIZED (
  SELECT t.*, l.title, l.images, l.seller_id AS listing_owner_id,
    CASE WHEN UPPER(t.currency) IN ('JPY','KRW','VND','CLP','XAF','XOF','XPF','BIF','DJF','GNF','KMF','PYG','RWF','UGX','VUV') THEN 0
         WHEN UPPER(t.currency) IN ('BHD','IQD','JOD','KWD','LYD','OMR','TND') THEN 3
         WHEN UPPER(t.currency) IN ('CLF','UYW') THEN 4 ELSE 2 END AS exponent
  FROM transactions t LEFT JOIN listings l ON l.id = t.listing_id CROSS JOIN period p
  WHERE ${REPORT_OWNER_SQL}
    AND t.created_at >= p.start_at AND t.created_at < p.end_at
    AND ($4::text IS NULL OR UPPER(t.currency) = $4)
    AND ($5::text IS NULL OR t.order_status = $5)
    AND ($6::text IS NULL OR t.payment_status = $6)
), ledger_refunds AS (
  SELECT r.transaction_id,
    COALESCE(SUM(r.amount_cents) FILTER (WHERE r.provider_status = 'succeeded' AND UPPER(r.currency) = UPPER(b.currency)),0)::numeric AS amount,
    BOOL_OR(r.provider_status = 'succeeded' AND UPPER(r.currency) <> UPPER(b.currency)) AS currency_mismatch,
    COUNT(*) > 0 AS has_records,
    JSONB_AGG(JSONB_BUILD_OBJECT('id','refund-' || r.id,'source','refund_ledger',
      'amountMinor',r.amount_cents::text,'date',r.created_at) ORDER BY r.id)
      FILTER (WHERE r.provider_status = 'succeeded' AND UPPER(r.currency) = UPPER(b.currency)) AS evidence
  FROM stripe_refund_ledger r JOIN base b ON b.id = r.transaction_id
  GROUP BY r.transaction_id
), confirmed_returns AS (
  SELECT r.order_id,
    SUM(ROUND(r.refund_amount::numeric * POWER(10::numeric,b.exponent))) AS amount,
    JSONB_AGG(JSONB_BUILD_OBJECT('id','return-' || r.id,'source','order_return',
      'amountMinor',ROUND(r.refund_amount::numeric * POWER(10::numeric,b.exponent))::text,
      'date',r.refunded_at) ORDER BY r.id) AS evidence
  FROM order_returns r JOIN base b ON b.id = r.order_id
  WHERE r.status = 'refunded' AND r.refund_amount IS NOT NULL GROUP BY r.order_id
), wallet_returns AS (
  SELECT r.order_id, SUM(ROUND(-w.amount_usd::numeric * 100)) AS amount, MAX(w.created_at) AS returned_at
  FROM order_returns r JOIN base b ON b.id = r.order_id
  JOIN wallet_transactions w ON w.payment_ref = 'return-' || r.id
    AND w.user_id = $1 AND w.type = 'return_debit' AND w.status = 'completed' AND w.amount_usd < 0
  GROUP BY r.order_id
), facts AS (
  SELECT b.*,
    ROUND(b.amount::numeric * POWER(10::numeric,b.exponent)) AS gross,
    ROUND(COALESCE(b.buyer_total,b.amount)::numeric * POWER(10::numeric,b.exponent)) AS charged,
    ROUND(COALESCE(b.commission_amount,0)::numeric * POWER(10::numeric,b.exponent)) AS original_commission,
    ROUND(COALESCE(b.seller_earnings,b.amount)::numeric * POWER(10::numeric,b.exponent)) AS original_net,
    -- Preserve old releaseEscrow's seller_earnings ?? amount fallback.
    CASE WHEN lr.amount > 0 THEN lr.amount
      WHEN lr.has_records AND b.payment_status IN ('refunded','partially_refunded','returned') THEN NULL
      WHEN cr.amount > 0 THEN cr.amount
      WHEN b.payment_status = 'refunded' OR b.order_status = 'return_refunded'
        THEN ROUND(COALESCE(b.buyer_total,b.amount)::numeric * POWER(10::numeric,b.exponent))
      WHEN b.payment_status IN ('partially_refunded','returned') THEN NULL
      ELSE 0::numeric END AS customer_refund,
    COALESCE(lr.currency_mismatch,false) AS refund_currency_mismatch,
    CASE WHEN lr.amount > 0 THEN lr.evidence
      WHEN lr.has_records AND b.payment_status IN ('refunded','partially_refunded','returned') THEN '[]'::jsonb
      WHEN cr.amount > 0 THEN cr.evidence
      WHEN b.payment_status = 'refunded' OR b.order_status = 'return_refunded' THEN
        JSONB_BUILD_ARRAY(JSONB_BUILD_OBJECT('id','payment-status-' || b.id,'source','full_refund_status',
          'amountMinor',ROUND(COALESCE(b.buyer_total,b.amount)::numeric * POWER(10::numeric,b.exponent))::text,'date',NULL))
      ELSE '[]'::jsonb END AS refund_evidence,
    (b.payment_status IN ('completed','paid','partially_refunded','refunded')
      AND b.order_status NOT IN ('cancelled','canceled','failed')
      AND (b.stripe_verified_status IS NULL OR
        (b.stripe_verified_status IN ('succeeded','paid')
          AND UPPER(b.stripe_verified_currency) = UPPER(b.currency)
          AND b.stripe_verified_amount_cents = ROUND(COALESCE(b.buyer_total,b.amount)::numeric * POWER(10::numeric,b.exponent))))) AS included,
    w.id AS wallet_credit_id, ROUND(w.amount_usd::numeric * 100) AS wallet_credit,
    w.created_at AS wallet_credit_at,
    wr.amount AS wallet_return, wr.returned_at AS wallet_return_at,
    sp.status AS payout_record_status, ROUND(sp.net_amount::numeric * 100) AS payout_record_amount,
    sp.paid_at AS payout_record_date, sp.payment_method AS payout_record_method
  FROM base b
  LEFT JOIN ledger_refunds lr ON lr.transaction_id = b.id
  LEFT JOIN confirmed_returns cr ON cr.order_id = b.id
  LEFT JOIN wallet_returns wr ON wr.order_id = b.id
  -- Exact reference is crucial: Stripe release also logs a wallet transaction,
  -- but its '-stripe-release' reference is NOT evidence of an FM credit.
  LEFT JOIN wallet_transactions w ON w.payment_ref = 'order-' || b.id
    AND w.user_id = $1 AND w.type = 'sale_earnings' AND w.status = 'completed' AND w.amount_usd > 0
  LEFT JOIN marketplace_seller_payouts sp ON sp.transaction_id = b.id AND sp.seller_id = $1
), allocated AS (
  SELECT f.*,
    (refund_currency_mismatch OR customer_refund IS NULL OR customer_refund > charged
      OR customer_refund < 0 OR gross < 0 OR charged < gross
      OR original_net < 0 OR original_commission < 0 OR original_net + original_commission > gross) AS invalid_amounts,
    CASE WHEN charged > 0 THEN GREATEST(0,1 - customer_refund / charged)
      WHEN charged = 0 AND customer_refund = 0 THEN 1::numeric ELSE NULL END AS retained,
    CASE WHEN wallet_credit_id IS NOT NULL THEN 'FM Card'
      WHEN stripe_transfer_id IS NOT NULL THEN 'Stripe'
      WHEN payout_record_status IS NOT NULL THEN
        CASE WHEN payout_record_method = 'natcash' THEN 'NatCash' ELSE 'MonCash' END
      WHEN settlement_method = 'stripe_connect' THEN 'Stripe'
      WHEN settlement_method = 'fm_wallet' THEN 'FM Card'
      ELSE NULL END AS destination,
    CASE WHEN wallet_credit_id IS NOT NULL AND stripe_transfer_id IS NOT NULL THEN 'verification_required'
      WHEN UPPER(currency) <> 'USD' AND
        (wallet_credit_id IS NOT NULL OR stripe_transfer_id IS NOT NULL OR payout_record_status = 'paid')
        THEN 'verification_required'
      WHEN wallet_credit_id IS NOT NULL AND COALESCE(wallet_return,0) >= wallet_credit THEN 'returned'
      WHEN settlement_status = 'returned' OR payout_record_status = 'returned' THEN 'returned'
      WHEN wallet_credit_id IS NOT NULL OR
        (stripe_transfer_id IS NOT NULL AND escrow_released) OR
        (payout_record_status = 'paid' AND payout_record_date IS NOT NULL) THEN 'transferred'
      WHEN NOT included OR customer_refund = charged AND charged > 0 THEN 'not_applicable'
      WHEN settlement_status IN ('processing','refund_processing') OR payout_record_status = 'processing' THEN 'processing'
      WHEN settlement_status = 'failed' OR payout_record_status = 'failed' THEN 'failed'
      WHEN settlement_status IN ('paid','legacy_review','legacy_checkout') OR escrow_released OR stripe_transfer_id IS NOT NULL OR
        settlement_status IN ('refund_recovery_required','dispute_recovery_required') THEN 'verification_required'
      WHEN settlement_status = 'pending' AND (payout_record_status IS NULL OR payout_record_status = 'pending') THEN 'pending'
      ELSE 'verification_required' END AS payout_status,
    CASE WHEN wallet_credit_id IS NOT NULL AND stripe_transfer_id IS NOT NULL THEN NULL
      WHEN UPPER(currency) <> 'USD' THEN NULL
      WHEN wallet_credit_id IS NOT NULL THEN wallet_credit
      WHEN stripe_transfer_id IS NOT NULL AND escrow_released THEN original_net
      WHEN payout_record_status = 'paid' AND payout_record_date IS NOT NULL THEN payout_record_amount
      WHEN settlement_status IN ('paid','legacy_review','legacy_checkout','refund_recovery_required','dispute_recovery_required')
        OR escrow_released OR stripe_transfer_id IS NOT NULL OR payout_record_status = 'paid' THEN NULL
      ELSE 0::numeric END AS transferred,
    CASE WHEN wallet_credit_id IS NOT NULL THEN wallet_credit_at
      WHEN stripe_transfer_id IS NOT NULL AND escrow_released THEN escrow_released_at
      WHEN payout_record_status = 'paid' THEN payout_record_date ELSE NULL END AS payout_date
  FROM facts f
), amounts AS (
  SELECT a.*,
    CASE WHEN NOT included THEN 0::numeric WHEN invalid_amounts THEN NULL
      ELSE ROUND(gross * retained) END AS net_sale,
    CASE WHEN NOT included THEN 0::numeric WHEN invalid_amounts THEN NULL
      ELSE LEAST(ROUND(original_commission * retained),
        ROUND(gross * retained) - ROUND(original_net * retained)) END AS commission,
    CASE WHEN NOT included THEN 0::numeric WHEN invalid_amounts THEN NULL
      ELSE ROUND(original_net * retained) END AS net,
    CASE WHEN payout_status = 'returned' AND wallet_return IS NOT NULL AND UPPER(currency) = 'USD'
      THEN wallet_return WHEN payout_status = 'returned' THEN NULL ELSE 0::numeric END AS returned,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN customer_refund IS NULL THEN 'missing_refund_evidence' END,
      CASE WHEN refund_currency_mismatch THEN 'refund_currency_mismatch' END,
      CASE WHEN customer_refund > charged THEN 'refund_exceeds_payment' END,
      CASE WHEN gross < 0 OR charged < gross OR original_net < 0 OR original_commission < 0
        OR original_net + original_commission > gross OR
        stripe_verified_status IS NOT NULL AND
          (stripe_verified_status NOT IN ('succeeded','paid') OR stripe_verified_currency IS NULL
            OR UPPER(stripe_verified_currency) <> UPPER(currency) OR stripe_verified_amount_cents IS NULL
            OR stripe_verified_amount_cents <> charged)
        THEN 'historical_amounts_inconsistent' END,
      CASE WHEN payout_status = 'verification_required' THEN 'payout_evidence_missing' END,
      CASE WHEN UPPER(currency) <> 'USD' AND
        (wallet_credit_id IS NOT NULL OR stripe_transfer_id IS NOT NULL OR payout_record_status = 'paid')
        THEN 'payout_currency_unverified' END,
      CASE WHEN settlement_status IN ('refund_recovery_required','dispute_recovery_required') OR
        COALESCE(transferred,0) > COALESCE(ROUND(original_net * retained),transferred)
        AND payout_status <> 'returned' THEN 'recovery_required' END
    ],NULL) AS warnings
  FROM allocated a
), report AS (
  SELECT a.*, (net_sale - commission - net) AS fees,
    CASE WHEN included THEN gross ELSE 0::numeric END AS sale_gross,
    CASE WHEN NOT included THEN 0::numeric WHEN invalid_amounts THEN NULL
      ELSE gross - net_sale END AS sale_refund,
    CASE WHEN payout_status IN ('pending','processing','failed','verification_required') THEN net
      ELSE 0::numeric END AS pending
  FROM amounts a WHERE ($7::text IS NULL OR payout_status = $7)
)
`;

export const REPORT_SUMMARY_SQL = REPORT_CTE_SQL + `
SELECT UPPER(currency) AS currency, exponent, COUNT(*) FILTER (WHERE included)::integer AS "orderCount",
  SUM(sale_gross)::text AS "grossSalesMinor",
  CASE WHEN BOOL_OR(customer_refund IS NULL OR refund_currency_mismatch) THEN NULL ELSE SUM(customer_refund)::text END AS "customerRefundsMinor",
  CASE WHEN BOOL_OR(sale_refund IS NULL) THEN NULL ELSE SUM(sale_refund)::text END AS "refundsMinor",
  CASE WHEN BOOL_OR(fees IS NULL) THEN NULL ELSE SUM(fees)::text END AS "feesMinor",
  CASE WHEN BOOL_OR(commission IS NULL) THEN NULL ELSE SUM(commission)::text END AS "commissionsMinor",
  CASE WHEN BOOL_OR(net IS NULL) THEN NULL ELSE SUM(net)::text END AS "netSellerAmountMinor",
  CASE WHEN BOOL_OR(pending IS NULL) THEN NULL ELSE SUM(pending)::text END AS "pendingAmountMinor",
  CASE WHEN BOOL_OR(net IS NULL AND payout_status = 'processing') THEN NULL
    ELSE COALESCE(SUM(net) FILTER (WHERE payout_status = 'processing'),0)::text END AS "processingAmountMinor",
  CASE WHEN BOOL_OR(transferred IS NULL AND payout_status IN ('transferred','verification_required','returned'))
    THEN NULL ELSE COALESCE(SUM(transferred),0)::text END AS "transferredAmountMinor",
  CASE WHEN BOOL_OR(returned IS NULL) THEN NULL ELSE SUM(returned)::text END AS "returnedAmountMinor",
  BOOL_AND(CARDINALITY(warnings) = 0) AS complete
FROM report GROUP BY UPPER(currency), exponent ORDER BY UPPER(currency)
`;

export const REPORT_ROWS_SQL = REPORT_CTE_SQL + `
SELECT id, listing_id AS "listingId", title, COALESCE(images,ARRAY[]::text[]) AS images,
  (listing_owner_id = $1 AND payment_status = 'completed'
    AND order_status NOT IN ('cancelled','canceled','return_refunded')) IS TRUE AS "canViewOrder",
  original_commission::text AS "originalCommissionMinor", original_net::text AS "originalSellerEarningsMinor",
  created_at AS "createdAt", listing_country AS "listingCountry",
  UPPER(currency) AS currency, exponent,
  gross::text AS "originalSaleMinor", charged::text AS "customerPaymentMinor",
  customer_refund::text AS "customerRefundMinor", sale_refund::text AS "refundsMinor",
  net_sale::text AS "netSaleMinor", fees::text AS "feesMinor", commission::text AS "commissionsMinor",
  net::text AS "netSellerAmountMinor", order_status AS "orderStatus",
  payment_status AS "paymentStatus", payment_method AS "paymentMethod",
  payout_status AS "payoutStatus", destination AS "payoutDestination",
  CASE WHEN payout_status IN ('transferred','returned') THEN payout_date ELSE NULL END AS "payoutDate",
  transferred::text AS "transferredMinor", returned::text AS "returnedMinor",
  refund_evidence AS refunds, warnings
FROM report ORDER BY created_at DESC, id DESC LIMIT $8 OFFSET $9
`;

export const REPORT_COUNT_SQL = REPORT_CTE_SQL + `SELECT COUNT(*)::integer AS total FROM report`;
export const REPORT_PERIODS_SQL = `
SELECT DISTINCT TO_CHAR(t.created_at AT TIME ZONE $2,'YYYY-MM') AS month
FROM transactions t LEFT JOIN listings l ON l.id = t.listing_id
WHERE ${REPORT_OWNER_SQL} ORDER BY month DESC
`;