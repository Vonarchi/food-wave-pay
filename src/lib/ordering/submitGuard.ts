/** Synchronous guard so a double tap cannot place the same voice order twice. */
export function claimOnce(alreadyClaimed: boolean): { claimed: true; accepted: boolean } {
  if (alreadyClaimed) return { claimed: true, accepted: false };
  return { claimed: true, accepted: true };
}
