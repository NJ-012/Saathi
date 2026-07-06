/**
 * agent/index.js
 * =========================================================================
 * THE ORCHESTRATOR — handleIncomingMessage(phone, text)
 * =========================================================================
 * This is the one function that ties every other module together. Walk
 * through it top to bottom during judging:
 *
 *   1. Look up grounding data for this message (rag/getContext).
 *   2. Ask the LLM (Groq) to draft a reply, using ONLY that grounding data.
 *   3. Run a quick sentiment check on the customer's message.
 *   4. Run the message + grounding + sentiment through classifier/classify()
 *      to get a GREEN / YELLOW / RED zone.
 *   5. Act on the zone:
 *        GREEN / YELLOW -> send the draft now via the channel adapter.
 *                          YELLOW also gets logged to the review queue
 *                          (visible, non-blocking).
 *        RED            -> nothing is sent to the customer. The draft and
 *                          the reason are parked in the pending-approvals
 *                          queue and the dashboard is notified.
 *
 * Nothing here is clever on purpose — this function is the live demo.
 * =========================================================================
 */

import { getContext } from '../rag/index.js';
import { classify, ZONES } from '../classifier/classify.js';
import { assessSentiment } from '../classifier/sentiment.js';
import { callLLM } from './llm.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { buildLocalFallbackDraft } from './localFallback.js';
import { sendMessage } from '../channels/index.js';
import { pushForApproval, logForReview, logInteraction, recordAutoResolved } from '../dashboard_api/index.js';

/**
 * @param {string} phone - customer's phone number, e.g. "+919876543210"
 * @param {string} text - the incoming customer message
 * @returns {Promise<{zone: string, reason: string, sent: boolean, draftResponse: string, approvalId?: string}>}
 */
export async function handleIncomingMessage(phone, text) {
  const startedAt = Date.now();

  // ---- Step 1: retrieve grounding data ---------------------------------
  // rag/getContext never calls an LLM — it only looks up real product/
  // order/policy data and tells us whether it found anything at all
  // (ragResult.found). The classifier leans on `found` to decide RED (c).
  const ragResult = getContext(text, phone);

  // ---- Step 2: draft a response with the LLM, grounded in ragResult ----
  const systemPrompt = buildSystemPrompt(text, ragResult);
  let draftResponse;
  let llmError = null;

  try {
    draftResponse = await callLLM({
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    });
  } catch (err) {
    // The LLM call itself failed (no API key, network error, timeout,
    // rate limit — see llm.js). This is a SYSTEM failure, not a grounding
    // failure. ragResult may well have found real product/order data —
    // don't touch it. Track the failure separately so the classifier's
    // "no grounding data" reason is never used to describe a different
    // problem.
    llmError = err.message;
    console.error(`[agent] LLM call failed for "${phone}": ${err.message}`);

    // If RAG already found real grounding data, recite it directly rather
    // than falling back to a generic "trouble replying" message — a stiff
    // but accurate answer beats an unnecessary escalation.
    draftResponse = buildLocalFallbackDraft(ragResult);
  }

  // ---- Step 3: sentiment check (keyword fast-path + LLM fallback) ----
  const sentiment = await assessSentiment(text);

  // ---- Step 4: run the traffic-light classifier -----------------------
  let { zone, reason } = classify(text, ragResult, sentiment);

  // An LLM failure with NO grounding data is still unsafe to auto-send —
  // classify() will already have routed this RED via condition (c), but
  // give it an honest, distinct reason instead of implying RAG failed.
  if (llmError && !ragResult?.found) {
    reason = `Could not generate a draft (system error: ${llmError}), and RAG also found no grounding data — a human needs to write this one from scratch.`;
  }
  // An LLM failure WITH grounding data found is safe enough to auto-send
  // using the local fallback template, as long as nothing else (sentiment,
  // monetary action) already forced RED/YELLOW above — classify() decided
  // that from the same ragResult/sentiment inputs, so no override needed
  // here; we just annotate why the draft looks the way it does.
  if (llmError && ragResult?.found && zone !== ZONES.RED) {
    reason = `${reason} (Note: the LLM was unreachable — ${llmError} — so this was answered from a template built directly from the grounding data, not a generated draft.)`;
  }

  const interactionRecord = {
    phone,
    customerMessage: text,
    draftResponse,
    ragResult,
    sentiment,
    zone,
    reason,
    createdAt: new Date().toISOString(),
  };

  // ---- Step 5: act on the zone ------------------------------------------
  if (zone === ZONES.RED) {
    // Do NOT send anything to the customer. Park the draft for a human,
    // and let the dashboard know a new item needs attention.
    const approval = pushForApproval(interactionRecord);
    logInteraction({ ...interactionRecord, sent: false, approvalId: approval.id });

    return { zone, reason, sent: false, draftResponse, approvalId: approval.id };
  }

  // GREEN or YELLOW: safe to send the draft right now.
  console.log(
    `[agent] Sending ${zone} reply to ${phone}: "${draftResponse.slice(0, 40)}${draftResponse.length > 40 ? '…' : ''}"`
  );
  await sendMessage(phone, draftResponse);
  recordAutoResolved(Date.now() - startedAt);

  if (zone === ZONES.YELLOW) {
    // Not blocking the send — just makes it visible on the dashboard.
    logForReview(interactionRecord);
  }

  logInteraction({ ...interactionRecord, sent: true });

  return { zone, reason, sent: true, draftResponse };
}
