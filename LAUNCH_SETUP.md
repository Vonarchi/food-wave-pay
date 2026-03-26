# Launch Setup Guide

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon key |
| `GOOGLE_GEMINI_API_KEY` | For AI extraction | Set in Supabase secrets for `extract-menu` function |

## Setup Steps

### 1. Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run migrations in order:
   - `supabase/migrations/20251219193816_*.sql`
   - `supabase/migrations/20251219194418_*.sql`
   - `supabase/migrations/20260304095720_*.sql`
   - `supabase/migrations/20260304154503_*.sql`
   - `supabase/migrations/20260304163235_*.sql`
   - `supabase/migrations/20260321000000_auth_and_ownership.sql`
   - `supabase/migrations/20260325120000_menu_publish_paywall.sql` (published menus + paywall RLS)
3. Or run the consolidated `schema.sql` on a fresh project (then run the auth migration)
4. Enable Email auth in Supabase Auth settings
5. Add site URL and redirect URLs for auth

### 2. AI Menu Extraction (optional)

```bash
supabase secrets set GOOGLE_GEMINI_API_KEY=your_key
supabase functions deploy extract-menu
```

Get key from [Google AI Studio](https://aistudio.google.com/apikey)

### 3. Local / Vercel

- Local: Create `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- Vercel: Add the same vars in **Project → Settings → Environment Variables** and enable them for **Production** *and* **Preview** (Vite bakes them in at build time). If only one random `*.vercel.app` URL works, the others were usually built **without** these vars or before you added them—**Redeploy** Production and the `main` preview after saving.
- **Idle / ~10 min “everything spins slowly”:** The Supabase client refreshes access tokens over the network; an unbounded hang on `/auth/v1/*` can block other calls. This repo’s Supabase `fetch` uses **per-route timeouts** (short for auth, longer for storage/functions). If you still see stalls, check the Network tab for pending `token?grant_type=refresh_token` and any proxy/VPN blocking Supabase.
- **`manifest.json` 401 / `forwardRef` runtime errors:** Preview URLs with **Vercel Deployment Protection** can return **401** on standalone fetches to `/manifest.json`. The build **inlines** the web app manifest as a `data:` URL in `index.html` (see `vite.config.ts`), so the browser no longer requests `/manifest.json` for the PWA link. **`forwardRef` undefined** in a `vendor-*.js` chunk was caused by **custom `manualChunks` splitting** React incorrectly; that splitting is **disabled** so production uses one main JS chunk (larger file, stable React). After deploy, hard-refresh or clear site data so old hashed chunks are not cached.

#### Only one of several Vercel URLs works (common with this project)

You will often see **three** hostnames for the same app (example from the Joseph Miles Dyson team project):

| URL | Typical role |
|-----|----------------|
| `https://food-wave-pay-pgbf.vercel.app` | **Production** deployment (default domain) |
| `https://food-wave-pay-pgbf-git-main-joseph-miles-dyson.vercel.app` | **Preview** build for branch `main` |
| `https://food-wave-pay-pgbf-<hash>-joseph-miles-dyson.vercel.app` | **Preview** for a specific git commit / PR |

Each is a **separate build**. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are embedded when that build runs. If **Production** is unchecked for those variables in Vercel, the short `…pgbf.vercel.app` build will point at empty/wrong Supabase and fail (blank API, spinners, or `ERR_NAME_NOT_RESOLVED` in Network). If an old **hash** preview was built before env vars existed, that URL stays broken until you **Redeploy** it.

**Fix (do in order):**

1. **Vercel → Settings → Environment Variables** — Edit each `VITE_*` variable and ensure **both** checkboxes are on: **Production** and **Preview** (and Development if you use `vercel dev`).
2. **Redeploy everything you care about:** Deployments → open latest **Production** → ⋯ → **Redeploy**. Repeat for a broken preview, merge to `main`, or push a small commit so hash URLs get a fresh build.
3. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** your canonical public URL (usually `https://food-wave-pay-pgbf.vercel.app` once production is healthy).
   - **Redirect URLs:** must cover every origin end users hit, otherwise login/signup/email links return **400/422**. Add at least:
     - `https://food-wave-pay-pgbf.vercel.app/**`
     - `https://food-wave-pay-pgbf-git-main-joseph-miles-dyson.vercel.app/**`
     - `https://*.vercel.app/**` — optional single wildcard if your Supabase project allows it (covers hash previews like `…-ienbmmkya-…`), **or** add each preview URL explicitly after it appears in Vercel.

Signup uses `emailRedirectTo: <current origin>/onboarding`, so **the tab’s origin must appear in Redirect URLs.**

### 4. Vercel Deployment — Joseph Miles Dyson Account Only

**Important:** Deploy only from the **Joseph Miles Dyson** Vercel account. Do not deploy to James' Project.

1. Log into [vercel.com](https://vercel.com) as **Joseph Miles Dyson**
2. Import the GitHub repo or connect the existing project
3. Ensure env vars are set (see above)
4. Deployments will auto-run on push if the repo is connected

To deploy via CLI, ensure you're logged in as Joseph Miles Dyson:
```bash
vercel whoami   # Verify account
vercel link     # Link to project under Joseph's account
vercel --prod   # Deploy
```

## What’s Mocked / Placeholder

- **Stripe**: Checkout (`create-checkout-session`) and webhooks (`stripe-webhook`) are wired; ensure Edge secrets **`STRIPE_SECRET_KEY`**, **`STRIPE_PRICE_ID`**, **`STRIPE_WEBHOOK_SECRET`** and deployed functions. Owners **Subscribe** on `/admin/billing`, return to **Menu Admin** to **Publish**. Unpublished menus are hidden from the public directory and guest menu URLs until published; subscription lapse **unpublishes** via webhook.
- **Customer payment**: Checkout shows payment UI but does not charge; order is submitted and sent to kitchen.
- **notification.mp3**: KitchenDisplay references `/notification.mp3`; add to `public/` if you want sounds.

## Routes Summary

| Route | Auth | Purpose |
|-------|------|---------|
| `/` | Public | Landing |
| `/menu/:truckId` | Public | Customer menu |
| `/checkout/:truckId` | Public | Customer checkout |
| `/confirmation/:orderId` | Public | Order confirmation |
| `/login` | Public | Restaurant login |
| `/signup` | Public | Restaurant signup |
| `/onboarding` | Protected | Post-signup setup |
| `/admin` | Protected | Menu admin |
| `/admin/dashboard` | Protected | System overview |
| `/admin/billing` | Protected | Billing placeholder |
| `/kitchen` | Protected | Kitchen display |

## Recommended Next Steps After Launch

1. **Stripe**: Implement checkout session, webhook, Customer Portal
2. **Customer payments**: Integrate Stripe Payment Intents or Checkout for orders
3. **Kitchen filter**: Filter orders by owner’s truck(s)
4. **Table numbers**: Add `table_number` to orders if needed
5. **Email confirmations**: Enable Supabase email confirmation
6. **Domain**: Point custom domain in Vercel and Supabase
7. **Referral tracking**: Use `referral_code`, `referred_by`, `partner_id` in profiles for reporting
