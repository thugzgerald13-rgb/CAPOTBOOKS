# CAPOTBOOKS — Cloudflare Pages blank-page fix

## Diagnosis
`capotbooks.pages.dev` rendered blank because the Vite build was configured
with `base: '/capotbooks/'`. `index.html` therefore requested assets at
`/capotbooks/assets/*.js`, but Pages deployed them at the root `/assets/*.js`.
The SPA fallback (`/* /index.html 200`) returned **HTML with a 200 status**
where the browser expected JavaScript, so the bundle silently failed to
execute and `<div id="root">` stayed empty.

## Files changed (drop these into your repo)
| File | Change |
|---|---|
| `vite.config.ts` | `base: '/capotbooks/'` → `base: '/'` (keeps your manualChunks) |
| `public/_redirects` | Ensures SPA client-side routing works on Pages (`/* /index.html 200`) |
| `wrangler.toml` | Optional — only if you deploy via `wrangler pages deploy` |

## Steps
1. Copy `vite.config.ts` over your existing one (merge in any extra plugins
   you use, e.g. vite-plugin-pwa — keep `base: '/'`).
2. Copy `public/_redirects` into your `public/` folder (create the folder if
   missing). It gets copied to `dist/_redirects` at build time.
3. In the Pages dashboard → Settings → Environment variables → Production,
   set: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`.
4. Trigger a new deploy (git push or `npx wrangler pages deploy dist`).
5. After deploy, hard-refresh (Ctrl+Shift+R) — the old broken `index.html`
   may be cached.

## Secondary cleanup (PWA assets)
Your `index.html` also references `/capotbooks/manifest.json` and
`/capotbooks/icons/icon-192.png`. After the `base` fix these become
`/manifest.json` and `/icons/icon-192.png`. If those files currently live
under `public/capotbooks/`, move them up to `public/manifest.json` and
`public/icons/` so the PWA install prompt works. Not required for the app
to render.

## Console noise
The `MetaMask extension not found` / `inpage.js` errors in DevTools come
from a browser extension, not your app — ignore them.
