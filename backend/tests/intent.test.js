import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProductIntent, findMatchingProducts } from '../src/rag/intent.js';
import { getAllProducts } from '../src/mock_store/store.js';

test('isProductIntent recognizes a Hinglish stock question', () => {
  assert.equal(isProductIntent('Yeh Chikankari kurta size M mein available hai kya?'), true);
});

test('isProductIntent recognizes a plain English stock question', () => {
  assert.equal(isProductIntent('Do you have this in a size L?'), true);
});

test('isProductIntent returns false for an unrelated order-status question', () => {
  assert.equal(isProductIntent('Where is my order, it has not arrived'), false);
});

test('findMatchingProducts finds the chikankari kurta for a Hinglish query', () => {
  const products = getAllProducts();
  const matches = findMatchingProducts('Yeh Chikankari kurta size M mein available hai kya?', products);
  assert.ok(matches.length > 0, 'expected at least one match');
  assert.ok(
    matches.some((p) => /chikankari/i.test(p.name)),
    'expected the Chikankari kurta to be among the matches'
  );
});

test('findMatchingProducts returns nothing for a product category that does not exist', () => {
  // Deliberately avoids any color/fabric word that could legitimately
  // fuzzy-match a real product (e.g. "pink" would match a pink dupatta) —
  // this is testing the "genuinely nothing found" path, not color matching.
  const products = getAllProducts();
  const matches = findMatchingProducts('Do you sell branded sports sneakers in size XXL?', products);
  assert.equal(matches.length, 0);
});
