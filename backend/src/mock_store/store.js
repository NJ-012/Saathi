/**
 * mock_store/store.js
 * --------------------
 * Plain data-access functions backing the mock store. This is the single
 * source of truth for reading/writing products.json and orders.json.
 *
 * `api.js` wraps these functions in HTTP routes for the dashboard/external
 * callers. `rag/` (and later `agent/`) import these functions directly and
 * call them in-process — no HTTP round-trip needed since everything runs
 * in the same Node process for this demo. If the backend is ever split into
 * separate services, rag/agent would switch to calling the HTTP endpoints
 * in api.js instead, but the function signatures here would stay the same.
 *
 * SWAP-IN POINT: when a real store is connected, this file is what gets
 * replaced with actual Shopify Admin API / WooCommerce REST API calls —
 * everything importing from here (api.js, rag/) keeps working unchanged
 * as long as these function signatures are preserved.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// backend/src/mock_store -> backend/src -> backend -> saathi (project root) -> data
const DATA_DIR = path.resolve(__dirname, '../../../data');
const PRODUCTS_FILE = 'products.json';
const ORDERS_FILE = 'orders.json';

function readJSON(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function writeJSON(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/** Returns the full product catalog. */
export function getAllProducts() {
  return readJSON(PRODUCTS_FILE);
}

/** Returns a single product by id, or null if not found. */
export function getProductById(id) {
  return getAllProducts().find((p) => p.id === id) || null;
}

/** Returns all orders for a given customer phone number (exact match). */
export function getOrdersByPhone(phone) {
  return readJSON(ORDERS_FILE).filter((o) => o.customer.phone === phone);
}

/** Returns a single order by id, or null if not found. */
export function getOrderById(id) {
  return readJSON(ORDERS_FILE).find((o) => o.id === id) || null;
}

/**
 * Marks an order as refund-initiated and persists it.
 * Returns:
 *   { status: 'not_found' }
 *   { status: 'already_refunded', order }
 *   { status: 'ok', order, confirmation }
 */
export function initiateRefund(id) {
  const orders = readJSON(ORDERS_FILE);
  const orderIndex = orders.findIndex((o) => o.id === id);

  if (orderIndex === -1) {
    return { status: 'not_found' };
  }

  const order = orders[orderIndex];

  if (order.refund_status === 'refund-initiated') {
    return { status: 'already_refunded', order };
  }

  const refundId = `RF-${Date.now()}`;
  const refundedAt = new Date().toISOString();

  order.refund_status = 'refund-initiated';
  order.refund_id = refundId;
  order.refund_requested_at = refundedAt;

  orders[orderIndex] = order;
  writeJSON(ORDERS_FILE, orders);

  const confirmation = {
    refund_id: refundId,
    order_id: order.id,
    amount: order.total_amount,
    currency: order.currency,
    status: 'refund-initiated',
    requested_at: refundedAt,
    eta: '5-7 business days',
    message: `Refund of ${order.currency} ${order.total_amount} initiated for order ${order.id}. This is a mock confirmation — no real money movement occurs.`,
  };

  return { status: 'ok', order, confirmation };
}
