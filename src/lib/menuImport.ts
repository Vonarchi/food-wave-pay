import { supabase } from '@/integrations/supabase/client';
import { formatEdgeFunctionFailure } from '@/lib/edgeFunctionErrors';
import { mapApiModifiersToApp, normalizeExtractionPayload, type DraftMenuItem } from '@/lib/menuExtraction';
import type { ModifierGroup } from '@/types';

export const MENU_UPLOAD_TIMEOUT_MS = 60_000;
export const MENU_EXTRACTION_TIMEOUT_MS = 180_000;

export type ImportedMenuItem = {
  name: string;
  description: string;
  price: number;
  category: string;
  modifiers: ModifierGroup[];
  confidence?: number;
  available: boolean;
};

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  if (file.type === 'application/pdf') return 'pdf';
  return 'jpg';
}

export function assertMenuFile(file: File): void {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');
  if (!isPdf && !isImage) {
    throw new Error('Upload a photo or a PDF of your menu.');
  }
  const maxBytes = isPdf ? 8 * 1024 * 1024 : 4 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(isPdf ? 'That PDF is over 8MB. Export a smaller file and try again.' : 'That photo is over 4MB. Take a closer photo and try again.');
  }
}

export function draftsToImportedItems(drafts: DraftMenuItem[]): ImportedMenuItem[] {
  return drafts.map((draft) => ({
    name: draft.name,
    description: draft.description || '',
    price: draft.price,
    category: draft.category || 'Main',
    modifiers: mapApiModifiersToApp(draft.modifier_groups),
    confidence: draft.confidence,
    available: true,
  }));
}

/** Uploads into menu-images/{userId}/ and returns unreviewed draft items. Does not write menu_items. */
export async function importMenuFromFile(file: File, userId: string): Promise<ImportedMenuItem[]> {
  assertMenuFile(file);
  const fileName = `${userId}/menu-${Date.now()}.${extensionFor(file)}`;

  const upload = await Promise.race([
    supabase.storage.from('menu-images').upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Upload timed out. Check your connection and try a smaller file.')), MENU_UPLOAD_TIMEOUT_MS)
    ),
  ]);

  if (upload.error) {
    throw new Error(`Upload failed: ${upload.error.message}`);
  }

  const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
  const invokeResult = await supabase.functions.invoke('extract-menu', {
    body: { imageUrl: urlData.publicUrl },
    timeout: MENU_EXTRACTION_TIMEOUT_MS,
  });

  if (invokeResult.error) {
    const detail = await formatEdgeFunctionFailure(invokeResult.error, invokeResult.response);
    throw new Error(detail || 'Menu reading failed. Try a clearer photo.');
  }

  if (invokeResult.data?.error && (!Array.isArray(invokeResult.data?.items) || invokeResult.data.items.length === 0)) {
    const raw = invokeResult.data.error;
    throw new Error(typeof raw === 'string' ? raw : 'No menu items could be read. Try a clearer photo.');
  }

  const items = draftsToImportedItems(normalizeExtractionPayload(invokeResult.data?.items));
  if (items.length === 0) {
    throw new Error('No menu items could be read. Retake the photo so prices and names are easy to see.');
  }
  return items;
}
