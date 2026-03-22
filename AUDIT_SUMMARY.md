# Food Wave Pay — Launch Audit Summary

## What Already Works

| Area | Status | Notes |
|------|--------|-------|
| **Customer menu flow** | ✅ Works | MenuPage loads from DB or sample fallback, category tabs, item cards |
| **Item customizer** | ✅ Works | Modifiers, quantities, add to cart |
| **Cart** | ✅ Works | CartDrawer, CartButton, Zustand store |
| **Order placement** | ✅ Works | Checkout submits to Supabase `orders` table |
| **Order confirmation** | ⚠️ Partial | Works in-session; **broken on refresh** (order not fetched by ID) |
| **Kitchen display** | ✅ Works | Kanban columns, realtime, status updates |
| **Menu admin** | ✅ Works | AI capture, save items, branding, modifiers |
| **QR code** | ✅ Works | Generates `/menu/:truckId`, download PNG |
| **Supabase** | ✅ Connected | Client, types, RLS policies |

## What Is Incomplete

| Area | Status | Notes |
|------|--------|-------|
| **Auth** | ❌ Missing | No login/signup; admin/kitchen routes unprotected |
| **Restaurant onboarding** | ❌ Missing | No guided flow after signup |
| **Stripe** | ❌ Missing | Checkout shows Apple/Google Pay UI but no real payment; no subscription |
| **Restaurant ↔ Owner link** | ❌ Missing | `food_trucks` has no `owner_id`; no multi-tenant isolation |
| **Menu edit/delete** | ⚠️ Partial | Can add items; edit/delete existing items is limited |
| **Order number** | ⚠️ Weak | 3-digit random; possible collisions |

## What Is Broken

1. **Confirmation page refresh** — Order is only in Zustand; refresh loses it. Need to fetch by `orderId` from API when not in store.
2. **KitchenDisplay realtime** — Subscription callback uses stale `orders` in closure; should use functional `setOrders`.
3. **BrandingSettings** — Doesn’t load current logo/accent; AdminPage doesn’t pass them.

## Must Do Before Launch

1. **Auth** — Restaurant owner signup/login; protect `/admin`, `/kitchen`, `/admin/dashboard`.
2. **Confirmation fix** — Fetch order by ID when missing from store.
3. **Kitchen realtime fix** — Use functional state update in subscription.
4. **Restaurant ownership** — Add `owner_id` to `food_trucks`; filter admin by owner.
5. **Stripe subscription** — At minimum: checkout session, webhook, subscription status; gate admin if needed.
6. **Onboarding** — Post-signup flow: profile → first category → first items → QR → subscription.
7. **Menu edit** — Inline edit name, price, category, availability; delete items.
8. **Order number** — Use timestamp-based or DB sequence for uniqueness.

---

*Generated during launch prep. See implementation for file-by-file changes.*
