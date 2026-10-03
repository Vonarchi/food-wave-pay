/** Application names for a food_trucks row. The database table is unchanged. */

export type MenuStatus = 'draft' | 'published' | 'paused';

export const RESTAURANT_TYPES = [
  'Restaurant',
  'Cafe',
  'Food truck',
  'Quick service',
  'Carryout',
  'Bar',
  'Concession',
  'Other',
] as const;

export function slugifyRestaurantName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  if (!slug || slug === 'demo') return '';
  return slug;
}

export function readMenuStatus(row: {
  menu_status?: string | null;
  is_published?: boolean | null;
}): MenuStatus {
  if (row.menu_status === 'published' || row.menu_status === 'paused' || row.menu_status === 'draft') {
    return row.menu_status;
  }
  return row.is_published ? 'published' : 'draft';
}

export function menuStatusLabel(status: MenuStatus): string {
  if (status === 'published') return 'Published';
  if (status === 'paused') return 'Paused';
  return 'Draft';
}

/** Fields written together so is_published stays aligned even before the trigger runs. */
export function menuStatusPatch(status: MenuStatus): { menu_status: MenuStatus; is_published: boolean } {
  return { menu_status: status, is_published: status === 'published' };
}

export function isLowConfidenceItem(item: { price: number; confidence?: number | null }): boolean {
  if (!Number.isFinite(item.price) || item.price <= 0) return true;
  if (typeof item.confidence === 'number' && item.confidence < 0.65) return true;
  return false;
}

export function restaurantMenuUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}/menu/${slug}`;
}

export function friendlySupabaseError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : fallback;
  const lower = message.toLowerCase();
  if (lower.includes('duplicate') || lower.includes('unique') || lower.includes('23505')) {
    return 'That restaurant link is already taken. Try a slightly different name.';
  }
  if (lower.includes('row-level security') || lower.includes('permission denied') || lower.includes('42501')) {
    return 'You don’t have permission to change that. Sign in as the restaurant owner and try again.';
  }
  if (lower.includes('timed out') || lower.includes('failed to fetch') || lower.includes('network')) {
    return 'The connection dropped. Check your signal and try again.';
  }
  if (lower.includes('does not exist') || lower.includes('42703')) {
    return 'The restaurant database is missing a required field. Ask support to apply the latest migrations.';
  }
  if (lower.includes('restaurant link cannot be changed') || lower.includes('restaurant owner cannot be changed')) {
    return 'This restaurant link is already saved and can’t be reassigned.';
  }
  return message || fallback;
}
