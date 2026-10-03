import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { clearScanDraft, loadScanDraft, saveScanDraft, SCAN_DRAFT_KEY } from './scanDraft.ts';
import type { ImportedMenuItem } from './menuImport.ts';

const memory = new Map<string, string>();

const sample: ImportedMenuItem[] = [
  {
    name: 'Taco',
    description: 'Beef',
    price: 4.5,
    category: 'Mains',
    modifiers: [],
    available: true,
  },
];

describe('scanDraft', () => {
  beforeEach(() => {
    memory.clear();
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
      clear: () => memory.clear(),
      key: () => null,
      get length() {
        return memory.size;
      },
    };
  });

  afterEach(() => {
    memory.clear();
  });

  it('saves and loads a flyer scan draft', () => {
    saveScanDraft(sample, 'door-to-door');
    const loaded = loadScanDraft();
    assert.ok(loaded);
    assert.equal(loaded.campaign, 'door-to-door');
    assert.equal(loaded.items[0]?.name, 'Taco');
    assert.ok(sessionStorage.getItem(SCAN_DRAFT_KEY));
  });

  it('clears the draft after claim', () => {
    saveScanDraft(sample, null);
    clearScanDraft();
    assert.equal(loadScanDraft(), null);
  });

  it('rejects empty drafts', () => {
    sessionStorage.setItem(SCAN_DRAFT_KEY, JSON.stringify({ version: 1, createdAt: '', campaign: null, items: [] }));
    assert.equal(loadScanDraft(), null);
  });
});
