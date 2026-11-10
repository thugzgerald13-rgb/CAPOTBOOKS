-- Add Purchases-style attachment metadata to Income (sales) records.
-- Files themselves remain in the existing private `client-files` Supabase Storage bucket.
-- Safe to run more than once.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_original_type text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint,
  ADD COLUMN IF NOT EXISTS attachment_original_size bigint,
  ADD COLUMN IF NOT EXISTS attachment_compression text,
  ADD COLUMN IF NOT EXISTS attachment_storage_path text;

CREATE INDEX IF NOT EXISTS idx_sales_attachment_storage_path
  ON public.sales (attachment_storage_path)
  WHERE attachment_storage_path IS NOT NULL;
