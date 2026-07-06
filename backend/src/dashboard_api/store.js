/**
 * dashboard_api/store.js
 * ------------------------
 * In-memory storage backing the human-approval dashboard. Good enough for
 * a demo; swap for a real database later without changing the function
 * signatures other modules import — same pattern as mock_store/store.js.
 */

let nextId = 1;
const pendingApprovals = new Map(); // id -> approval record
const reviewQueue = [];
const interactionLog = [];

// --- Stats counters, used by dashboard_api/api.js GET /stats ------------
// Simple in-memory event lists (fine for a demo/single-process backend).
// Each entry is timestamped so /stats can filter down to "today".
const autoResolvedEvents = []; // { at: ISOString, responseTimeMs: number } — GREEN/YELLOW, sent immediately
const escalatedEvents = []; // { at: ISOString } — RED, pushed to the approval queue
const humanResolvedEvents = []; // { at: ISOString, responseTimeMs: number } — RED approvals a human approved/edited & sent

function isToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** GREEN/YELLOW: recorded right after the draft is auto-sent. */
export function recordAutoResolved(responseTimeMs) {
  autoResolvedEvents.push({ at: new Date().toISOString(), responseTimeMs });
}

/** RED: recorded right when a message is parked in the approval queue. */
export function recordEscalation() {
  escalatedEvents.push({ at: new Date().toISOString() });
}

/** Stats for the dashboard header pills — counts reset naturally at midnight. */
export function getStats() {
  const autoToday = autoResolvedEvents.filter((e) => isToday(e.at));
  const escalatedToday = escalatedEvents.filter((e) => isToday(e.at));
  const humanResolvedToday = humanResolvedEvents.filter((e) => isToday(e.at));

  const responseTimes = [...autoToday, ...humanResolvedToday].map((e) => e.responseTimeMs);
  const avgResponseTimeMs = responseTimes.length
    ? Math.round(responseTimes.reduce((sum, ms) => sum + ms, 0) / responseTimes.length)
    : 0;

  return {
    autoResolvedToday: autoToday.length,
    escalatedToday: escalatedToday.length,
    avgResponseTimeMs,
  };
}

/** RED zone: park a draft for human approval. */
export function addPendingApproval(record) {
  const id = `APP-${nextId++}`;
  const approval = { id, status: 'pending', ...record };
  pendingApprovals.set(id, approval);
  return approval;
}

export function getPendingApprovals() {
  return Array.from(pendingApprovals.values()).filter((a) => a.status === 'pending');
}

export function getApprovalById(id) {
  return pendingApprovals.get(id) || null;
}

/** status: 'approved' | 'edited' | 'rejected' */
export function resolveApproval(id, status, finalResponse) {
  const approval = pendingApprovals.get(id);
  if (!approval) return null;

  approval.status = status;
  approval.resolvedAt = new Date().toISOString();
  if (finalResponse) approval.finalResponse = finalResponse;

  // The message actually went out to the customer for 'approved'/'edited' —
  // count the full customer-facing wait (from their message to our reply)
  // toward the "avg response time" stat. Rejections send nothing, so they
  // don't count.
  if (status === 'approved' || status === 'edited') {
    const responseTimeMs = Date.parse(approval.resolvedAt) - Date.parse(approval.createdAt);
    humanResolvedEvents.push({ at: approval.resolvedAt, responseTimeMs });
  }

  return approval;
}

/** YELLOW zone: non-blocking visibility entry — message already sent. */
export function addReviewEntry(record) {
  const entry = { id: `REV-${nextId++}`, ...record };
  reviewQueue.push(entry);
  return entry;
}

export function getReviewQueue() {
  return reviewQueue;
}

/** Every interaction, regardless of zone — for the activity log view. */
export function addInteractionLog(record) {
  const entry = { id: `LOG-${nextId++}`, ...record };
  interactionLog.push(entry);
  return entry;
}

export function getInteractionLog() {
  return interactionLog;
}
