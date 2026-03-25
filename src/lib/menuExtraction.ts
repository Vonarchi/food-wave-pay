/**
 * KioKitchen — normalize extract-menu edge function responses.
 * Supports legacy flat arrays and structured OCR-first drafts with optional modifier_groups.
 */

import type { ModifierGroup, ModifierOption } from '@/types';

export type ApiModifierOption = { name?: string; price_delta?: number };
export type ApiModifierGroup = {
  name?: string;
  required?: boolean;
  min_select?: number;
  max_select?: number;
  options?: ApiModifierOption[];
};

/** Raw item shape from API (before UI selection flag) */
export type DraftMenuItem = {
  name: string;
  description?: string;
  price: number;
  category: string;
  modifier_groups?: ApiModifierGroup[];
};

function stableId(prefix: string, i: number, j?: number) {
  return `${prefix}-${i}-${j ?? 0}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Map API modifier draft → app ModifierGroup (for DB JSONB + ItemCustomizer) */
export function mapApiModifiersToApp(groups: ApiModifierGroup[] | undefined): ModifierGroup[] {
  if (!groups?.length) return [];
  return groups
    .filter((g) => g?.name && String(g.name).trim())
    .map((g, gi) => {
      const maxSel = typeof g.max_select === 'number' ? g.max_select : 1;
      const opts = (g.options || [])
        .filter((o) => o?.name && String(o.name).trim())
        .map(
          (o, oi): ModifierOption => ({
            id: stableId('opt', gi, oi),
            name: String(o.name).trim(),
            price: typeof o.price_delta === 'number' ? o.price_delta : 0,
          })
        );
      return {
        id: stableId('grp', gi),
        name: String(g.name).trim(),
        required: Boolean(g.required),
        maxSelections: Math.max(1, maxSel),
        options: opts,
      };
    });
}

type LegacyRow = {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  category_name?: string;
  modifier_groups?: ApiModifierGroup[];
};

function rowToDraft(row: LegacyRow, fallbackCategory: string): DraftMenuItem | null {
  const name = row?.name?.trim();
  if (!name) return null;
  const price = typeof row.price === 'number' && !Number.isNaN(row.price) ? row.price : 0;
  const category = (row.category || row.category_name || fallbackCategory || 'Main').trim() || 'Main';
  return {
    name,
    description: row.description?.trim() || '',
    price,
    category,
    modifier_groups: row.modifier_groups,
  };
}

/**
 * Parses edge function `items` payload: legacy array, structured object, or nested menu_items.
 */
export function normalizeExtractionPayload(payload: unknown): DraftMenuItem[] {
  if (payload == null) return [];

  // Gemini may return a single object instead of array when using JSON mode
  let root: unknown = payload;
  if (!Array.isArray(payload) && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.menu_items)) root = o.menu_items;
    else if (Array.isArray(o.items)) root = o.items;
    else if (Array.isArray(o.menuItems)) root = o.menuItems;
    else return [];
  }

  if (!Array.isArray(root)) return [];

  const out: DraftMenuItem[] = [];
  for (const row of root) {
    if (!row || typeof row !== 'object') continue;
    const draft = rowToDraft(row as LegacyRow, 'Main');
    if (draft) out.push(draft);
  }
  return out;
}
