-- >>> ANGGA: berat satuan produk (gram) untuk modul Shipping Service Mengantar.
-- Nullable dan sengaja DIBIARKAN KOSONG untuk seluruh produk: katalog Cordova
-- saat ini sama rata 1000 g, jadi fallback config `shipping.defaultWeightGrams`
-- sudah benar untuk semua kasus. Tidak ada backfill di migration ini.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_grams" INTEGER;
