/**
 * dashboard_api/index.js
 * ------------------------
 * In-process functions the agent calls directly — no HTTP round-trip
 * needed since everything runs in one Node process for the demo, same
 * pattern as mock_store. api.js wraps these in HTTP routes for the
 * dashboard frontend to poll and act on.
 */

import { addPendingApproval, addReviewEntry, addInteractionLog, recordEscalation, recordAutoResolved } from './store.js';

/** RED zone: park a draft for human approval and notify the dashboard. */
export function pushForApproval(record) {
  const approval = addPendingApproval(record);
  recordEscalation();
  notifyDashboard('new_pending_approval', approval);
  return approval;
}

/** YELLOW zone: non-blocking visibility log — the message has already been sent. */
export function logForReview(record) {
  return addReviewEntry(record);
}

/** Every interaction, regardless of zone, for the activity log view. */
export function logInteraction(record) {
  return addInteractionLog(record);
}

/**
 * Stand-in for a real-time push (websocket/SSE) to the dashboard UI. For
 * the demo this just logs to the console; the dashboard polls the HTTP
 * routes in api.js in the meantime.
 */
function notifyDashboard(event, approval) {
  console.log(`[dashboard_api] ${event}: ${approval.id} (zone: ${approval.zone})`);
}

export { recordAutoResolved };
export { getPendingApprovals, getApprovalById, resolveApproval, getReviewQueue, getInteractionLog, getStats } from './store.js';
