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
- Vercel: Add same vars in Project Settings → Environment Variables

## What’s Mocked / Placeholder

- **Stripe**: Billing page is a placeholder. No checkout, webhooks, or subscription logic.
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
