import assert from 'node:assert/strict';
import test from 'node:test';
import {
  friendlySupabaseError,
  isLowConfidenceItem,
  menuStatusPatch,
  readMenuStatus,
  slugifyRestaurantName,
} from './restaurant.ts';

test('slugifyRestaurantName builds a public link and reserves demo', () => {
  assert.equal(slugifyRestaurantName("Mario's Pizza"), 'mario-s-pizza');
  assert.equal(slugifyRestaurantName('demo'), '');
  assert.equal(slugifyRestaurantName('  '), '');
});

test('menu status maps publish and pause without a second flag', () => {
  assert.equal(readMenuStatus({ menu_status: 'paused', is_published: false }), 'paused');
  assert.equal(readMenuStatus({ is_published: true }), 'published');
  assert.deepEqual(menuStatusPatch('published'), { menu_status: 'published', is_published: true });
  assert.deepEqual(menuStatusPatch('paused'), { menu_status: 'paused', is_published: false });
  assert.deepEqual(menuStatusPatch('draft'), { menu_status: 'draft', is_published: false });
});

test('low confidence flags missing prices and weak readings', () => {
  assert.equal(isLowConfidenceItem({ price: 0 }), true);
  assert.equal(isLowConfidenceItem({ price: 12, confidence: 0.4 }), true);
  assert.equal(isLowConfidenceItem({ price: 12 }), false);
  assert.equal(isLowConfidenceItem({ price: 12, confidence: 0.9 }), false);
});

test('duplicate restaurant links get a readable error', () => {
  assert.match(friendlySupabaseError(new Error('duplicate key value'), 'fallback'), /already taken/);
});
