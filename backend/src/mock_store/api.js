/**
 * mock_store/api.js
 * ------------------
 * This is a MOCK e-commerce API standing in for a real Shopify / WooCommerce
 * store integration. It exposes HTTP routes over the plain data functions in
 * `store.js`, which read/write local JSON files in `/data` (products.json,
 * orders.json) instead of calling a real store's REST or GraphQL API.
 *
 * Response shapes are written to look like what a real store API would return
 * (nested customer/items objects, ids, tracking info, etc.) so anything built
 * against this contract (RAG layer, agent, dashboard) doesn't need to change
 * when a real store is swapped in.
 *
 * SWAP-IN POINT: when a real store is connected, replace the implementations
 * in `store.js` with actual HTTP calls to Shopify's Admin API (or WooCommerce's
 * REST API) — e.g. `GET /admin/api/2024-01/products.json`,
 * `GET /admin/api/2024-01/orders.json?query=phone:...`,
 * `POST /admin/api/2024-01/orders/{id}/refunds.json` — and keep the same
 * router paths (/products, /products/:id, /orders, /orders/:id, /orders/:id/refund)
 * so nothing upstream (agent, rag, dashboard_api) needs to change.
 */

import express from 'express';
import {
  getAllProducts,
  getProductById,
  getOrdersByPhone,
  getOrderById,
  initiateRefund,
} from './store.js';

const router = express.Router();

/**
 * GET /products
 * Returns the full product catalog.
 */
router.get('/products', (req, res) => {
  const products = getAllProducts();
  res.json({
    count: products.length,
    products,
  });
});

/**
 * GET /products/:id
 * Returns a single product by id, or 404 if not found.
 */
router.get('/products/:id', (req, res) => {
  const product = getProductById(req.params.id);

  if (!product) {
    return res.status(404).json({
      error: 'not_found',
      message: `No product found with id ${req.params.id}`,
    });
  }

  res.json({ product });
});

/**
 * GET /orders?phone=...
 * Returns all orders for a given customer phone number.
 * Phone match is exact on the stored format (e.g. "+919876543210").
 */
router.get('/orders', (req, res) => {
  const { phone } = req.query;

  if (!phone) {
    return res.status(400).json({
      error: 'missing_param',
      message: 'Query param "phone" is required, e.g. /orders?phone=+919876543210',
    });
  }

  const matches = getOrdersByPhone(phone);

  res.json({
    phone,
    count: matches.length,
    orders: matches,
  });
});

/**
 * GET /orders/:id
 * Returns a single order by id, or 404 if not found.
 */
router.get('/orders/:id', (req, res) => {
  const order = getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({
      error: 'not_found',
      message: `No order found with id ${req.params.id}`,
    });
  }

  res.json({ order });
});

/**
 * POST /orders/:id/refund
 * Marks an order as refund-initiated and returns a mock confirmation.
 * Does not actually move money — this only mutates the local mock data
 * so the demo can show a full "customer asks for refund -> agent/human
 * approves -> refund confirmation" loop.
 */
router.post('/orders/:id/refund', (req, res) => {
  const result = initiateRefund(req.params.id);

  if (result.status === 'not_found') {
    return res.status(404).json({
      error: 'not_found',
      message: `No order found with id ${req.params.id}`,
    });
  }

  if (result.status === 'already_refunded') {
    return res.status(409).json({
      error: 'already_refunded',
      message: `Order ${result.order.id} already has a refund in progress.`,
      order: result.order,
    });
  }

  res.json({
    confirmation: result.confirmation,
    order: result.order,
  });
});

export default router;
