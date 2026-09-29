import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export const PRODUCT_EVENTS = [
  'signup_started',
  'signup_completed',
  'restaurant_created',
  'menu_upload_started',
  'menu_extraction_completed',
  'menu_review_completed',
  'menu_published',
  'qr_downloaded',
  'public_menu_viewed',
  'checkout_started',
  'order_completed',
  'upgrade_clicked',
  'voice_session_started',
  'voice_order_item_added',
  'voice_clarification_requested',
  'voice_order_abandoned',
  'voice_order_confirmed',
  'voice_order_completed',
  'voice_upsell_offered',
  'voice_upsell_accepted',
  'phone_call_started',
  'phone_call_completed',
  'phone_order_started',
  'phone_order_completed',
  'phone_order_abandoned',
  'phone_handoff',
  'phone_clarification',
  'phone_upsell_offered',
  'phone_upsell_accepted',
  'drive_thru_session_started',
  'drive_thru_order_completed',
  'drive_thru_order_abandoned',
  'drive_thru_takeover',
  'drive_thru_clarification',
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export function isProductEventName(value: string): value is ProductEventName {
  return (PRODUCT_EVENTS as readonly string[]).includes(value);
}

/**
 * Best-effort product event. Failures are logged and never block the UI.
 * Rows are insert-only; this client cannot read them back.
 */
export function track(
  eventName: ProductEventName,
  properties?: Record<string, string | number | boolean | null>
): void {
  const restaurantSlug = typeof properties?.restaurant_slug === 'string' ? properties.restaurant_slug : null;
  void supabase
    .from('product_events')
    .insert({
      event_name: eventName,
      restaurant_slug: restaurantSlug,
      properties: (properties ?? {}) as Json,
    })
    .then(({ error }) => {
      if (error) console.warn('[analytics]', eventName, error.message);
    });
}
