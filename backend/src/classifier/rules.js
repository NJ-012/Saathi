/**
 * classifier/rules.js
 * --------------------
 * Small, explicit keyword/phrase detectors used by classify.js. Each one
 * answers exactly one yes/no question and says *what* it matched, so the
 * classifier's reasons are always traceable back to a concrete word or
 * phrase in the customer's message — never a black box.
 *
 * These are deliberately simple substring/keyword checks, not NLU. That's
 * fine here: this module's job is narrow (money vs. non-money vs.
 * recommendation), and simple rules are what you can actually explain and
 * defend live in front of judges.
 */

function tokenize(message) {
  return message.toLowerCase().split(/\W+/).filter(Boolean);
}

// --- a) Refund / replacement / cancellation — the RED "monetary action" trigger.
const MONETARY_ACTION_WORDS = ['refund', 'refunds', 'reimburse', 'reimbursement', 'chargeback'];
const REPLACEMENT_WORDS = ['replacement', 'replace'];
const CANCELLATION_WORDS = ['cancel', 'cancels', 'cancelled', 'canceling', 'cancelling', 'cancellation'];
const MONETARY_ACTION_PHRASES = ['money back', 'give me my money', 'return my money', 'want my money'];

/**
 * Does this message ask for a refund, replacement, or cancellation?
 * Returns { requested: boolean, matched: string|null }.
 */
export function detectMonetaryActionRequest(message) {
  const tokens = tokenize(message);
  const lower = message.toLowerCase();

  const wordHit = [...MONETARY_ACTION_WORDS, ...REPLACEMENT_WORDS, ...CANCELLATION_WORDS].find((w) =>
    tokens.includes(w)
  );
  const phraseHit = MONETARY_ACTION_PHRASES.find((p) => lower.includes(p));
  const matched = wordHit || phraseHit || null;

  return { requested: Boolean(matched), matched };
}

// --- Non-monetary account actions — a YELLOW trigger (no money moves, but
// something on the order/account does change).
const ACCOUNT_ACTION_PHRASES = [
  'change my address', 'update my address', 'change delivery address',
  'change the size', 'change size', 'exchange', 'update my email',
  'update my phone number', 'edit my order', 'modify my order',
  'resend the', 'change the color', 'change the colour',
];

// Broader signal: an "action" verb applied to an "account/order field" noun,
// in either order and regardless of what sits between them (e.g. "please
// change my delivery address" or "can you update the phone number on file").
const ACCOUNT_ACTION_VERBS = ['change', 'update', 'edit', 'modify', 'correct'];
const ACCOUNT_ACTION_FIELDS = ['address', 'size', 'email', 'phone', 'colour', 'color', 'name'];

/**
 * Does this message ask for a non-monetary account/order change?
 * Returns { requested: boolean, matched: string|null }.
 */
export function detectNonMonetaryAccountAction(message) {
  const lower = message.toLowerCase();
  const tokens = tokenize(message);

  const phraseMatch = ACCOUNT_ACTION_PHRASES.find((p) => lower.includes(p));
  if (phraseMatch) return { requested: true, matched: phraseMatch };

  const verbHit = ACCOUNT_ACTION_VERBS.find((v) => tokens.includes(v));
  const fieldHit = ACCOUNT_ACTION_FIELDS.find((f) => tokens.includes(f));
  if (verbHit && fieldHit) return { requested: true, matched: `${verbHit} ... ${fieldHit}` };

  return { requested: false, matched: null };
}

// --- Recommendation / upsell questions — a YELLOW trigger (auto-answerable,
// but worth a human glancing at what the bot is suggesting customers buy).
const RECOMMENDATION_PHRASES = [
  'recommend',
  'suggestion',
  'suggest',
  'what goes well with',
  'pairs well',
  'pair with',
  'goes with',
  'similar to',
  'something like',
  'better option',
  'should i buy',
  'which one should i',
  'styling tip',
  'what should i wear',
  'match with',
  'worth buying',
  'anything else i should',
];

/**
 * Does this message ask for a recommendation / styling suggestion / upsell?
 * Returns { requested: boolean, matched: string|null }.
 */
export function detectRecommendationIntent(message) {
  const lower = message.toLowerCase();
  const matched = RECOMMENDATION_PHRASES.find((p) => lower.includes(p)) || null;
  return { requested: Boolean(matched), matched };
}
