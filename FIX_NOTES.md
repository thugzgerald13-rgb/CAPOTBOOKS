# CAPOTBOOKS — Infinite Spinner Fix

## Root Cause
`src/context/AuthContext.tsx` — the `AuthContext.Provider` `value` object was **missing the `accountReady` field**.
As a result `useAuth().accountReady` was always `undefined` (falsy). In `src/App.tsx` the loading gate is:

```ts
if (loading || (user && !accountReady)) { /* full-screen spinner */ }
```

- Logged-out users (`user === null`) → condition is false → login page renders normally.
- Logged-in users (`user !== null`) → `user && !undefined` is **always true** → the cyan spinner
  spins forever. Every watchdog (`setAccountReady(true)`, 10 s / 15 s timers) updated state that
  consumers never received, so none of them could break the loop.

This is why the app "kept on loading / spinning" only for users who were already signed in.

## Fixes Applied

### 1. `src/context/AuthContext.tsx` (root cause + hardening)
- Added `accountReady` to the `AuthContext.Provider` value so `setAccountReady(true)` actually
  reaches consumers and the gate opens.
- Added a never-cleared **hard backstop** (`gateBackstop`, 12 s) that forces the auth gate open and
  keeps it open (`gateForcedOpen` ref), so a hung Supabase call or a storm of
  `SIGNED_IN` / `TOKEN_REFRESHED` events can never again keep the spinner up.
- Guarded both `setAccountReady(false)` call-sites with `if (!gateForcedOpen.current)` so once the
  backstop fires, later auth events cannot re-close the gate.

### 2. `src/context/AccountingContext.tsx` (hardening)
- The 12 s cloud-sync timeout previously set only an error message and left `isReady = false`,
  leaving the "Syncing your data..." spinner up until the separate 15 s `forceReady` watchdog.
  It now also calls `setIsReady(true)` so local/cached data renders immediately.
- `initClients()` / `initBizProfile()` were fire-and-forget with no `.catch()`; a Supabase rejection
  left `isReady` false forever. Wrapped them so a rejection still opens the data gate.

### 3. `.env` (new — required)
The project shipped with only an empty `.env.example`. Without real `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, the app falls back to a mock anon key and every cloud call fails/hangs,
which is what triggered the spinner in the first place. Fill in your Supabase project values
(Project Settings → API) in `.env`.

## Files Changed
- `src/context/AuthContext.tsx`
- `src/context/AccountingContext.tsx`
- `.env` (new)

## Verify
```bash
npm install
npm run build    # should exit 0
npm run dev      # open http://localhost:3000/capotbooks/
```
Signed-in users now reach the workspace (or Role Selection) instead of spinning forever.
