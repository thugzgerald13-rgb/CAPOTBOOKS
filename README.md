<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/52f2e039-a5f2-44bd-8c31-450a6b2b63a0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and set:
   - `GEMINI_API_KEY` — your Gemini API key
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — from your Supabase project (Project Settings > API)
3. In your Supabase project, enable the **Google** provider under Authentication > Providers if you want Google sign-in to work
4. Run the app:
   `npm run dev`

## Backend

Auth and data storage run on [Supabase](https://supabase.com) (Postgres + Auth + Realtime). Schema lives in three tables: `profiles`, `clients`, and `business_profiles`, each protected by Row Level Security so users can only read/write their own rows.

## Database schema

The normalized Supabase target schema is in `schema.sql`. It separates client-owned accounting entities into tables, applies shared client-owner RLS, stores runtime journals as `values jsonb`, and moves file bytes to the private `client-files` Storage bucket. See `MIGRATION_PLAN.md` before applying it to an existing production database.
