# Supabase Edge Functions

## extract-menu

Extracts menu items from a menu image using Google Gemini AI.

**Env (Edge secrets):** `GOOGLE_GEMINI_API_KEY` (preferred) or `GEMINI_API_KEY` — same value, either name works. Keys are trimmed on read; no quotes or newlines in the dashboard.

**Deploy:**
```bash
supabase secrets set GOOGLE_GEMINI_API_KEY=your_key
supabase functions deploy extract-menu
```

Signed-in scans still require a file URL under `menu-images/{that user's id}/`.

**Guest / flyer scan-first:** `POST` with `{ "imageBase64": "...", "mimeType": "image/jpeg" }` (no storage upload). Rate-limited by IP. Used by `/scan` before signup. Redeploy `extract-menu` after pulling this change.

Create the key in [Google AI Studio](https://aistudio.google.com/apikey) (not a random Google Cloud key unless it has Generative Language API enabled). If Gemini returns **API_KEY_INVALID**, replace the secret with a new AI Studio key and redeploy.

If the app shows **no dishes parsed** but no API error: redeploy this function so normalization + Gemini response handling match the repo, then check **Logs** for lines `zero items after normalize` or `Raw Gemini content`.

**Request:** `POST` with `{ "imageUrl": "https://..." }` (public URL of uploaded menu image)

---

## stripe-webhook

Handles Stripe webhook events for subscription lifecycle.

**Env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Deploy:**
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase functions deploy stripe-webhook --no-verify-jwt
```

**Stripe Dashboard:** Add webhook endpoint `https://<project>.supabase.co/functions/v1/stripe-webhook`  
Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## create-checkout-session

Creates a Stripe Checkout Session for subscription. Requires auth.

**Env:** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` (optional)

**Deploy:**
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_PRICE_ID=price_...   # Your monthly plan price ID
supabase secrets set SITE_URL=https://your-app.vercel.app
supabase functions deploy create-checkout-session
```

**Request:** `POST` with `Authorization: Bearer <supabase_access_token>`  
Optional body: `{ "returnUrl": "https://your-app.com" }`

---

## voice-order

Interprets a spoken or typed order for one published restaurant. The model only proposes menu ids. Prices and modifiers are checked against `menu_items` (the demo slug uses the built-in sample menu).

**Env:** `GOOGLE_GEMINI_API_KEY` or `GEMINI_API_KEY`, plus the usual `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. No new browser variable.

**Deploy:**
```bash
supabase functions deploy voice-order --no-verify-jwt
```

Apply migration `20260928181003_phase2_voice_ordering` first. Guests call it with the anon key. `verify_jwt` stays off because customers are not signed in; the function rate-limits by IP and session.

---

## channel-order

Phone and drive-thru adapter around the same ordering engine. It does not price items itself.

**Env:** `PHONE_WEBHOOK_SECRET` (required before the carrier webhook accepts calls), `DRIVE_THRU_DEVICE_SECRET` (optional device header), `PUBLIC_APP_URL` (optional absolute payment link). Gemini uses the same key as voice-order. No card data is collected.

**Deploy:**
```bash
supabase functions deploy channel-order --project-ref awryxczjacqrgjlctrjc --no-verify-jwt
```

Apply migration `20260928194500_phase3_channels` first. Drive-thru starts only for the restaurant owner or a device that presents the secret. The phone webhook returns 503 until `PHONE_WEBHOOK_SECRET` is set.

**Response:** `{ "url": "https://checkout.stripe.com/..." }`
