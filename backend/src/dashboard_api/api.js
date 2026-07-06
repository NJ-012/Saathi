/**
 * dashboard_api/api.js
 * ----------------------
 * HTTP routes for the approval dashboard frontend. Wraps the in-process
 * functions in index.js the same way mock_store/api.js wraps store.js.
 */

import express from 'express';
import { getPendingApprovals, getApprovalById, resolveApproval, getReviewQueue, getInteractionLog, getStats } from './index.js';
import { sendMessage } from '../channels/index.js';

const router = express.Router();

/** GET /stats — header pill counters for the dashboard (auto-resolved today, escalated today, avg response time). */
router.get('/stats', (req, res) => {
  res.json(getStats());
});

/** GET /approvals — everything currently pending human review (RED zone). */
router.get('/approvals', (req, res) => {
  res.json({ approvals: getPendingApprovals() });
});

/** GET /approvals/:id */
router.get('/approvals/:id', (req, res) => {
  const approval = getApprovalById(req.params.id);
  if (!approval) return res.status(404).json({ error: 'not_found' });
  res.json({ approval });
});

/**
 * POST /approvals/:id/approve
 * Body: { editedResponse?: string }
 * Sends the (optionally edited) draft to the customer via the channel
 * adapter, then marks the approval resolved.
 */
router.post('/approvals/:id/approve', async (req, res) => {
  const { editedResponse } = req.body || {};
  const approval = getApprovalById(req.params.id);

  if (!approval) return res.status(404).json({ error: 'not_found' });
  if (approval.status !== 'pending') {
    return res.status(409).json({ error: 'already_resolved', status: approval.status });
  }

  const finalResponse = editedResponse || approval.draftResponse;
  await sendMessage(approval.phone, finalResponse);
  const resolved = resolveApproval(req.params.id, editedResponse ? 'edited' : 'approved', finalResponse);

  res.json({ approval: resolved });
});

/** POST /approvals/:id/reject — discard the draft, nothing is sent. */
router.post('/approvals/:id/reject', (req, res) => {
  const approval = getApprovalById(req.params.id);
  if (!approval) return res.status(404).json({ error: 'not_found' });
  if (approval.status !== 'pending') {
    return res.status(409).json({ error: 'already_resolved', status: approval.status });
  }

  const resolved = resolveApproval(req.params.id, 'rejected');
  res.json({ approval: resolved });
});

/** GET /review-queue — YELLOW zone messages, already sent, for visibility only. */
router.get('/review-queue', (req, res) => {
  res.json({ reviewQueue: getReviewQueue() });
});

/** GET /log — every interaction across all zones. */
router.get('/log', (req, res) => {
  res.json({ log: getInteractionLog() });
});

export default router;
