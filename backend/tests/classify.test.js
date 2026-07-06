import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, ZONES } from '../src/classifier/classify.js';

const grounded = { found: true, context: 'Chikankari kurta, size M, in stock, ₹1,899.', sources: ['product:RZ-KUR-001'] };
const ungrounded = { found: false, context: '', sources: [] };
const neutral = { label: 'neutral' };
const angry = { label: 'angry', reason: 'ALL CAPS + exclamation marks' };
const mildNegative = { label: 'mild_negative', reason: 'one negative word, no anger markers' };

test('GREEN: factual question, grounded, neutral sentiment, no monetary action', () => {
  const result = classify('Is the chikankari kurta available in size M?', grounded, neutral);
  assert.equal(result.zone, ZONES.GREEN);
});

test('RED: refund request always wins, even with positive/neutral sentiment', () => {
  const result = classify('Can I get a refund for this order please, thank you!', grounded, neutral);
  assert.equal(result.zone, ZONES.RED);
  assert.match(result.reason, /refund/i);
});

test('RED: refund request wins over grounded data too', () => {
  const result = classify('I want a replacement for my kurta', grounded, neutral);
  assert.equal(result.zone, ZONES.RED);
});

test('RED: angry sentiment escalates even on a plain factual question', () => {
  const result = classify('WHERE IS MY ORDER!! this is ridiculous', grounded, angry);
  assert.equal(result.zone, ZONES.RED);
  assert.match(result.reason, /angry|frustrated/i);
});

test('RED: no grounding data found, regardless of sentiment', () => {
  const result = classify('Do you have a Banarasi saree in olive green?', ungrounded, neutral);
  assert.equal(result.zone, ZONES.RED);
  assert.match(result.reason, /no grounding data/i);
});

test('YELLOW: recommendation/upsell question, grounded, neutral sentiment', () => {
  const result = classify('What would you recommend to go with this kurta?', grounded, neutral);
  assert.equal(result.zone, ZONES.YELLOW);
});

test('YELLOW: non-monetary account action (size change)', () => {
  const result = classify('Can you change the size on my order to L?', grounded, neutral);
  assert.equal(result.zone, ZONES.YELLOW);
});

test('YELLOW: mild negative sentiment without anger', () => {
  const result = classify('This took longer than I expected, kind of annoying', grounded, mildNegative);
  assert.equal(result.zone, ZONES.YELLOW);
});

test('evaluation order: RED conditions are checked before YELLOW ones', () => {
  // A recommendation-style phrase ("what should I do") combined with an
  // explicit refund word must still be RED — money-moving intent always
  // outranks a recommendation-shaped sentence.
  const result = classify('What should I do to get a refund for this?', grounded, neutral);
  assert.equal(result.zone, ZONES.RED);
});
