import type { ImportedMenuItem } from '@/lib/menuImport';

export const SCAN_DRAFT_KEY = 'kk-scan-draft';
export const SCAN_DRAFT_VERSION = 1 as const;

export type ScanDraft = {
  version: typeof SCAN_DRAFT_VERSION;
  createdAt: string;
  campaign: string | null;
  items: ImportedMenuItem[];
};

function canUseStorage(): boolean {
  return typeof sessionStorage !== 'undefined';
}

export function saveScanDraft(items: ImportedMenuItem[], campaign: string | null = null): ScanDraft {
  const draft: ScanDraft = {
    version: SCAN_DRAFT_VERSION,
    createdAt: new Date().toISOString(),
    campaign,
    items,
  };
  if (canUseStorage()) {
    sessionStorage.setItem(SCAN_DRAFT_KEY, JSON.stringify(draft));
  }
  return draft;
}

export function loadScanDraft(): ScanDraft | null {
  if (!canUseStorage()) return null;
  const raw = sessionStorage.getItem(SCAN_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScanDraft;
    if (parsed?.version !== SCAN_DRAFT_VERSION || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearScanDraft(): void {
  if (!canUseStorage()) return;
  sessionStorage.removeItem(SCAN_DRAFT_KEY);
}

export function hasScanDraft(): boolean {
  return loadScanDraft() !== null;
}
