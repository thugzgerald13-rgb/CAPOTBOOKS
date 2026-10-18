# Cloudflare R2 Integration — Setup

Replaces Supabase Storage (`client-files`, `receipts`) with Cloudflare R2.
Fully backward-compatible: with `VITE_R2_ENABLED` unset, every call falls back
to Supabase Storage unchanged. Toggle it per deploy.

## 1. Create the R2 bucket
Cloudflare dashboard → R2 → Create bucket → name it `capotbooks-files`
(or any name; reference it in the binding below).

## 2. Bind the bucket to your Pages project
Pages → `capotbooks` → Settings → Functions → R2 bucket bindings → Add:
- Variable name: `FILES`
- Bucket: `capotbooks-files`

(For direct-upload deploys via `wrangler pages deploy`, the `[[r2_buckets]]`
block in `wrangler.toml` does the same thing.)

## 3. Add the auth secret
Pages → Settings → Environment variables → Production → Add:
- `SUPABASE_JWT_SECRET` = Supabase → Project Settings → API → JWT Settings → Secret
  (Encrypt it. The gateway verifies the user's Supabase access token locally with
  HS256; without it, it falls back to calling Supabase `/auth/v1/user`.)

## 4. Enable R2 in the app
Pages → Environment variables → Production → Add:
- `VITE_R2_ENABLED` = `true`

Vite bakes this in at build time, so trigger a new deploy after setting it.

## 5. (Optional) Migrate existing files
Object keys map 1:1: `<bucket>/<storagePath>` (e.g.
`client-files/<clientId>/registration/<id>/COR.pdf`). Use `rclone` or the AWS
S3-compatible API to copy `client-files/*` and `receipts/*` from Supabase
Storage into the R2 bucket under the same prefixed keys. Until migrated, leave
`VITE_R2_ENABLED=false` and new uploads go to Supabase as before.

## Files
- `functions/api/r2/[[path]].ts` — Pages Function gateway (PUT/GET/DELETE + auth).
- `src/lib/r2Storage.ts` — drop-in client wrapper (`storageBucket()`).
- `src/db/storageCache.ts`, `src/lib/supabaseUtils.ts`,
  `src/components/FileManager.tsx`, `src/components/Extras.tsx`,
  `src/components/PaymentApproval.tsx` — call sites switched to `storageBucket()`.
- `wrangler.toml`, `.env.example` — binding + env var documentation.

## Notes
- Uploads proxy through the Pages Function (100 MB body cap — plenty for
  receipts/invoices). For larger files, add a presigned-URL endpoint.
- Download URLs carry the Supabase access token in `?token=` so `<img src>`
  works; tokens expire in ~1h and auto-refresh. For fully public buckets,
  connect an R2 custom domain and point `getPublicUrl` at it instead.
- Existing Dexie blob cache (`storageCache.ts`) still works — repeat views
  never hit the network.
