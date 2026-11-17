-- A driver backs out of an accepted order because of the CUSTOMER (product
-- decision, 2026-11-17): «the customer will call back» (new reason) or «the
-- customer declined». The driver is released at once and his fee refunded;
-- the order goes to an operator — no automatic search, the customer has not
-- decided — under the new attention kind CUSTOMER_PENDING (no driver attached).
--
-- Additive only. ADD VALUE inside a transaction is fine on PostgreSQL ≥ 12 as
-- long as the new value is not USED in the same transaction — it is not.
ALTER TYPE "OrderCancelReason" ADD VALUE IF NOT EXISTS 'CUSTOMER_WILL_CALL';
ALTER TYPE "OrderAttentionKind" ADD VALUE IF NOT EXISTS 'CUSTOMER_PENDING';
