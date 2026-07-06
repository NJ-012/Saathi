/**
 * rag/retrieval.js
 * ----------------
 * Pure retrieval layer. Given a customer message (and optionally their
 * phone number), this decides what grounding data is needed — product info,
 * order info, and/or policy info — fetches it from mock_store, and returns
 * a compact context string plus a list of exactly what was fetched.
 *
 * IMPORTANT: this module never calls an LLM. It only retrieves and formats
 * real data. The agent is responsible for taking `context` and building a
 * prompt; the classifier is responsible for reading `found`/`sources` to
 * decide whether the agent had real grounding or would be guessing.
 *
 * `found` semantics (this is the part the classifier leans on):
 *   - true  -> we successfully looked something up AND have a definite
 *              answer to hand the agent, even if that answer is "no orders
 *              found for this phone" or "no product matched" — those are
 *              still real facts, not guesses.
 *   - false -> we never even attempted a lookup because the message didn't
 *              match any known intent (product / order / policy). In that
 *              case there is nothing to ground a response in, and the agent
 *              would be guessing if it answered anyway.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllProducts, getOrdersByPhone, getOrderById } from '../mock_store/store.js';
import { extractOrderId, isProductIntent, isOrderIntent, isPolicyIntent, findMatchingProducts } from './intent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POLICY_PATH = path.join(__dirname, 'data', 'policy.md');

const MAX_PRODUCT_MATCHES = 3;
const MAX_ORDER_MATCHES = 5;

function loadPolicyDoc() {
  return fs.readFileSync(POLICY_PATH, 'utf-8');
}

function formatProduct(p) {
  return `${p.id} | ${p.name} | ₹${p.price} | sizes: ${p.sizes.join(', ')} | stock: ${p.stock} | ${p.description}`;
}

function formatOrder(o) {
  const items = o.items.map((i) => `${i.name} x${i.qty}${i.size ? ` (${i.size})` : ''}`).join('; ');
  const refundNote = o.refund_status ? ` | refund_status: ${o.refund_status}` : '';
  return `${o.id} | status: ${o.status} | tracking: ${o.tracking_id || 'none yet'} | total: ₹${o.total_amount} | items: ${items}${refundNote}`;
}

/**
 * Retrieves product context. Returns { section, sources } or null if the
 * message showed no product intent at all (nothing attempted).
 */
function retrieveProductContext(message) {
  if (!isProductIntent(message)) return null;

  const products = getAllProducts();
  const matches = findMatchingProducts(message, products).slice(0, MAX_PRODUCT_MATCHES);

  if (matches.length === 0) {
    return {
      section: '[PRODUCTS]\nNo matching product found in catalog for this query.',
      sources: ['product-lookup:no-match'],
    };
  }

  return {
    section: `[PRODUCTS]\n${matches.map((p) => `- ${formatProduct(p)}`).join('\n')}`,
    sources: matches.map((p) => `product:${p.id}`),
  };
}

/**
 * Retrieves order context. Returns { section, sources } or null if the
 * message showed no order intent at all (nothing attempted).
 */
function retrieveOrderContext(message, customerPhone) {
  const orderId = extractOrderId(message);
  const hasOrderIntent = isOrderIntent(message);

  if (!orderId && !hasOrderIntent) return null;

  // Explicit order id in the message takes priority over a phone lookup.
  if (orderId) {
    const order = getOrderById(orderId);

    if (!order) {
      return {
        section: `[ORDERS]\nNo order found with id ${orderId}.`,
        sources: [`order-lookup:not-found:${orderId}`],
      };
    }

    return {
      section: `[ORDERS]\n- ${formatOrder(order)}`,
      sources: [`order:${order.id}`],
    };
  }

  // Otherwise, fall back to phone-based lookup if we have a phone number.
  if (!customerPhone) {
    return {
      section: '[ORDERS]\nCustomer asked about an order but no phone number or order id was available to look one up.',
      sources: ['order-lookup:no-identifier'],
    };
  }

  const orders = getOrdersByPhone(customerPhone).slice(0, MAX_ORDER_MATCHES);

  if (orders.length === 0) {
    return {
      section: `[ORDERS for ${customerPhone}]\nNo orders found for this phone number.`,
      sources: [`order-lookup:no-results:${customerPhone}`],
    };
  }

  return {
    section: `[ORDERS for ${customerPhone}]\n${orders.map((o) => `- ${formatOrder(o)}`).join('\n')}`,
    sources: orders.map((o) => `order:${o.id}`),
  };
}

/**
 * Retrieves policy context. Returns { section, sources } or null if the
 * message showed no policy intent.
 */
function retrievePolicyContext(message) {
  if (!isPolicyIntent(message)) return null;

  const policyDoc = loadPolicyDoc();

  return {
    section: `[POLICY: Returns & Exchange]\n${policyDoc.trim()}`,
    sources: ['policy:returns-exchange'],
  };
}

/**
 * Main entry point. Given a customer message and (optional) phone number,
 * returns { context, sources, found }.
 */
export function getContext(customerMessage, customerPhone) {
  if (!customerMessage || !customerMessage.trim()) {
    return { context: '', sources: [], found: false };
  }

  const parts = [
    retrieveProductContext(customerMessage),
    retrieveOrderContext(customerMessage, customerPhone),
    retrievePolicyContext(customerMessage),
  ].filter(Boolean);

  if (parts.length === 0) {
    return { context: '', sources: [], found: false };
  }

  const context = parts.map((p) => p.section).join('\n\n');
  const sources = parts.flatMap((p) => p.sources);

  return { context, sources, found: true };
}
