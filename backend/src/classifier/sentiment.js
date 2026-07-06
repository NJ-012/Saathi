/**
 * classifier/sentiment.js
 * -------------------------------------------------------------------
 * Produces a sentiment label the classifier can act on:
 *   'positive' | 'neutral' | 'mild_negative' | 'angry'
 *
 * This is the ONE place an LLM is used for sentiment, and it's used as
 * narrowly as possible:
 *
 *   Stage 1 (keyword fast-path): obvious anger and obvious mild
 *   dissatisfaction are caught with plain keyword/pattern matching —
 *   free, instant, and easy to explain ("it matched the word X").
 *
 *   Stage 2 (LLM fallback): only messages that pass Stage 1 with no
 *   signal go to a tiny, single-purpose LLM call that returns exactly
 *   one word. This catches politely-worded anger and subtle frustration
 *   that keywords miss, without asking the LLM to do the whole
 *   classifier's job.
 *
 * If the LLM call fails (no API key, network error, etc.) this fails
 * safe to 'neutral' rather than blocking the pipeline — but says so in
 * the returned `reason`, so it's visible during a demo or in logs.
 */

import { callLLM } from '../agent/llm.js';

const ALLOWED_LABELS = ['positive', 'neutral', 'mild_negative', 'angry'];

function tokenize(message) {
  return message.toLowerCase().split(/\W+/).filter(Boolean);
}

// --- Stage 1a: obvious anger / frustration -----------------------------
const ANGRY_WORDS = ['furious', 'angry', 'outrageous', 'disgusted', 'infuriating', 'appalling'];
const ANGRY_PHRASES = [
  'never buying',
  'never ordering',
  'never order from you',
  'waste of money',
  'fed up',
  'sick of',
  'scam',
  'fraud',
  'pathetic',
  'disgusting',
  'horrible service',
  'worst experience',
  'worst service',
  'unacceptable',
  'rubbish service',
  'trash service',
  'so angry',
  'extremely disappointed',
  'ridiculous',
  'useless support',
  'file a complaint',
  'consumer court',
  'legal action',
];

function hasAngrySignal(message) {
  const lower = message.toLowerCase();
  const tokens = tokenize(message);

  const wordHit = ANGRY_WORDS.find((w) => tokens.includes(w));
  const phraseHit = ANGRY_PHRASES.find((p) => lower.includes(p));
  const repeatedExclamation = /!{2,}/.test(message);

  // Shouting: 2+ all-caps words of length >= 4 (skips short acronyms like "RZ").
  const shoutingWords = message.split(/\s+/).filter((w) => w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const isShouting = shoutingWords.length >= 2;

  const matched = wordHit || phraseHit || (repeatedExclamation && '(repeated "!")') || (isShouting && '(ALL CAPS)');

  return { hit: Boolean(matched), matched: matched || null };
}

// --- Stage 1b: mild dissatisfaction, not anger --------------------------
const MILD_NEGATIVE_WORDS = ['disappointed', 'annoyed', 'frustrated', 'frustrating', 'unhappy', 'delayed', 'delay', 'problem', 'issue', 'concerned'];
const MILD_NEGATIVE_PHRASES = [
  'not happy',
  'not satisfied',
  'a bit disappointed',
  'kind of frustrated',
  'still waiting',
  'this is delayed',
  'not working properly',
  "doesn't work properly",
  'does not work properly',
];

function hasMildNegativeSignal(message) {
  const lower = message.toLowerCase();
  const tokens = tokenize(message);

  const wordHit = MILD_NEGATIVE_WORDS.find((w) => tokens.includes(w));
  const phraseHit = MILD_NEGATIVE_PHRASES.find((p) => lower.includes(p));
  const matched = wordHit || phraseHit || null;

  return { hit: Boolean(matched), matched };
}

// --- Stage 2: one small, single-purpose LLM call -------------------------
async function classifySentimentWithLLM(message) {
  const raw = await callLLM({
    system:
      'You classify the sentiment of a single customer-support message. ' +
      'Respond with exactly one word, lowercase, no punctuation: ' +
      'positive, neutral, mild_negative, or angry. ' +
      '"mild_negative" means mildly unhappy or disappointed but still civil. ' +
      '"angry" means genuinely angry, frustrated, or hostile in tone, even if politely worded.',
    messages: [{ role: 'user', content: message }],
    maxTokens: 5,
  });

  const label = raw.trim().toLowerCase();
  return ALLOWED_LABELS.includes(label) ? label : 'neutral';
}

/**
 * Main entry point. Returns { label, source, reason }.
 *   source is 'keyword' | 'llm' | 'default', for traceability.
 */
export async function assessSentiment(customerMessage) {
  const message = customerMessage || '';

  if (!message.trim()) {
    return { label: 'neutral', source: 'default', reason: 'Empty message treated as neutral.' };
  }

  const angry = hasAngrySignal(message);
  if (angry.hit) {
    return {
      label: 'angry',
      source: 'keyword',
      reason: `Keyword/pattern match for anger: ${angry.matched}.`,
    };
  }

  const mildNegative = hasMildNegativeSignal(message);
  if (mildNegative.hit) {
    return {
      label: 'mild_negative',
      source: 'keyword',
      reason: `Keyword match for mild dissatisfaction: "${mildNegative.matched}".`,
    };
  }

  // No keyword signal either way — ask the LLM instead of assuming neutral,
  // so politely-worded anger and subtle frustration don't slip through.
  try {
    const label = await classifySentimentWithLLM(message);
    return {
      label,
      source: 'llm',
      reason: `No strong keyword signal; LLM sentiment check classified this as "${label}".`,
    };
  } catch (err) {
    return {
      label: 'neutral',
      source: 'default',
      reason: `LLM sentiment check failed (${err.message}); defaulted to neutral.`,
    };
  }
}
