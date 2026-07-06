/**
 * rag/intent.js
 * -------------
 * Lightweight, deterministic (non-LLM) heuristics for deciding what kind of
 * grounding data a customer message might need: product info, order info,
 * and/or policy info. A message can match more than one — e.g. "can I
 * return my saree order RZ-ORD-1009" needs both order info and policy info.
 *
 * This is intentionally simple keyword/pattern matching, not NLU. It only
 * has to be good enough to decide *what to fetch*; it is not the confidence
 * classifier and doesn't need to be right about tone or sentiment.
 */

const ORDER_ID_PATTERN = /RZ-ORD-\d{3,}/i;

const PRODUCT_KEYWORDS = [
  'kurta', 'kurtas', 'saree', 'sarees', 'sari', 'saris', 'dupatta', 'dupattas',
  'jhumka', 'jhumkas', 'earring', 'earrings', 'necklace', 'choker', 'accessory',
  'accessories', 'price', 'cost', 'costs', 'available', 'availability',
  'stock', 'size', 'sizes', 'buy', 'catalog', 'catalogue', 'product', 'products',
];

const ORDER_KEYWORDS = [
  'order', 'orders', 'track', 'tracking', 'delivery', 'delivered', 'shipped',
  'shipment', 'dispatch', 'dispatched', 'courier', 'status', 'placed',
];

const POLICY_KEYWORDS = [
  'return', 'returns', 'exchange', 'exchanges', 'refund', 'refunds', 'policy',
  'cancel', 'cancellation', 'warranty', 'damaged', 'wrong item', 'defective',
];

function tokenize(message) {
  return message.toLowerCase().split(/\W+/).filter(Boolean);
}

// Common words that are long enough to pass the length filter but are too
// generic to be useful signals, and can produce false-positive substring
// matches (e.g. "and" inside "hand-embroidered").
const STOPWORDS = new Set([
  'and', 'the', 'are', 'you', 'your', 'have', 'has', 'had', 'for', 'what',
  'was', 'were', 'with', 'this', 'that', 'from', 'can', 'will', 'our',
  'their', 'not', 'but', 'all', 'any', 'out', 'get', 'how', 'why', 'when',
  'where', 'please', 'want', 'need', 'about', 'there', 'here', 'just',
  'like', 'also', 'today', 'still', 'yet', 'check', 'now',
]);

/** Extracts an explicit order id (e.g. "RZ-ORD-1009") from the message, if present. */
export function extractOrderId(message) {
  const match = message.match(ORDER_ID_PATTERN);
  return match ? match[0].toUpperCase() : null;
}

export function isProductIntent(message) {
  const tokens = tokenize(message);
  return tokens.some((t) => PRODUCT_KEYWORDS.includes(t));
}

export function isOrderIntent(message) {
  const tokens = tokenize(message);
  return Boolean(extractOrderId(message)) || tokens.some((t) => ORDER_KEYWORDS.includes(t));
}

export function isPolicyIntent(message) {
  const lower = message.toLowerCase();
  const tokens = tokenize(message);
  return tokens.some((t) => POLICY_KEYWORDS.includes(t)) || lower.includes('wrong item');
}

/**
 * Scores every product against the message by counting how many message
 * tokens (length >= 3, to skip noise words) appear in the product's name,
 * category, or description. Returns matches sorted best-first.
 * `products` is injected so this stays a pure function with no I/O.
 */
export function findMatchingProducts(message, products) {
  const tokens = tokenize(message).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  const lowerMessage = message.toLowerCase();

  const scored = products.map((product) => {
    const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();
    let score = 0;

    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += 1;
      } else if (token.endsWith('s') && token.length > 3 && haystack.includes(token.slice(0, -1))) {
        // naive singularization, e.g. "sarees" -> "saree", "kurtas" -> "kurta"
        score += 1;
      }
    }

    // Exact/near id mention is a very strong signal.
    if (lowerMessage.includes(product.id.toLowerCase())) score += 5;

    return { product, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.product);
}
