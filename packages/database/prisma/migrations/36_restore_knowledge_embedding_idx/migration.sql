-- >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): index HNSW pgvector di
-- knowledge_items.embedding (dibuat migrasi `20_knowledge_embeddings`) SEMPAT
-- kehapus TANPA SENGAJA hari ini. Sebabnya: `packages/database/package.json`
-- script "migrate" itu `prisma migrate dev`, BUKAN `prisma migrate deploy`.
-- `migrate dev` membandingkan skema live vs `schema.prisma`; index vector ini
-- tidak bisa dideklarasikan di schema.prisma (keterbatasan Prisma utk tipe
-- pgvector), jadi ia dianggap "drift" dan otomatis dibuat migrasi utk
-- MENGHAPUSNYA (lihat migrasi
-- `20260804083540_docker_compose_up_d_build_apidocker_compose_up_d_build_web`
-- — namanya berantakan karena ke-generate dari prompt interaktif `migrate dev`).
-- `docker-entrypoint.sh` API sendiri SUDAH BENAR pakai `migrate deploy` (aman,
-- cuma jalankan migrasi yang belum diterapkan, tidak pernah drift-fixing) —
-- yang salah cuma script npm "migrate" ini. JANGAN PERNAH jalankan
-- `npm run migrate` di folder ini lagi terhadap database sungguhan — pakai
-- `npx prisma migrate deploy` langsung.
--
-- Migrasi ini mengembalikan index yang kehapus itu. Isinya identik migrasi
-- `20_knowledge_embeddings`.
CREATE INDEX IF NOT EXISTS "knowledge_items_embedding_idx"
  ON "knowledge_items"
  USING hnsw ("embedding" vector_cosine_ops);
