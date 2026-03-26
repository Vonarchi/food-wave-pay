/** Profile.subscription_status from Stripe webhook / checkout flow. */
export function isPaidSubscriptionActive(status: string | null | undefined): boolean {
  return status === "active";
}
