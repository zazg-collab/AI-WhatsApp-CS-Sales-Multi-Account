-- No-op: this migration originally ran `ALTER TABLE "products" ADD COLUMN
-- "currency"`, but Prisma applies migrations in lexical folder-name order and
-- the "products" table isn't created until migration `19_products` — so this
-- always failed with "relation products does not exist" in any fresh
-- database (CI never passed on this). The actual column add now lives in
-- `23_product_currency`, which runs after `19_products`. Kept as a no-op
-- (rather than deleted/renamed) so any environment that already has this
-- migration name in its `_prisma_migrations` history doesn't drift.
SELECT 1;
