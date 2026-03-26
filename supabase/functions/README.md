# Supabase Edge Functions

## extract-menu

Extracts menu items from a menu image using Google Gemini AI.

**Env (Edge secrets):** `GOOGLE_GEMINI_API_KEY` (preferred) or `GEMINI_API_KEY` — same value, either name works. Keys are trimmed on read; no quotes or newlines in the dashboard.

**Deploy:**
```bash
supabase secrets set GOOGLE_GEMINI_API_KEY=your_key
supabase functions deploy extract-menu
```

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

**Response:** `{ "url": "https://checkout.stripe.com/..." }`
