/**
 * classifier/classify.js
 * =========================================================================
 * THE TRAFFIC-LIGHT ROUTER — the single most important file in Saathi.
 * =========================================================================
 * classify(customerMessage, ragResult, sentiment) reads three inputs that
 * have ALREADY been computed elsewhere (RAG lookup in rag/, sentiment in
 * classifier/sentiment.js) and returns which of three zones this message
 * belongs in. No LLM call happens here — this file is pure, explicit
 * if/else, on purpose, so it can be read top to bottom and explained live
 * in about 30 seconds.
 *
 * -------------------------------------------------------------------------
 * RULE TABLE (plain English — this is what gets screenshotted)
 * -------------------------------------------------------------------------
 *
 *  ZONE    | CONDITION (checked top to bottom; first match wins)         | ACTION
 *  --------|---------------------------------------------------------------|---------------------------------
 *  RED     | a) Refund / replacement / cancellation requested             | Draft is written but NOT sent.
 *          | b) Sentiment is angry / frustrated                           | Goes to the human approval
 *          | c) RAG found no grounding data (ragResult.found === false)   | queue via dashboard_api.
 *  --------|---------------------------------------------------------------|---------------------------------
 *  YELLOW  | Recommendation / upsell question, OR                        | Auto-sent immediately, but
 *          | a non-monetary account action (address/size/exchange), OR   | logged to a review queue —
 *          | sentiment is mildly negative (but not angry)                | visible, not blocking.
 *  --------|---------------------------------------------------------------|---------------------------------
 *  GREEN   | Factual question, AND RAG found grounding data, AND         | Auto-answered immediately.
 *          | sentiment is neutral/positive, AND no monetary action asked | No queue.
 *
 * Evaluation order matters: RED is checked first because it represents
 * hard "a human must be in the loop" conditions that override everything
 * else. E.g. a recommendation question ("what pairs well with this kurta?")
 * asked in an angry tone is still RED, not YELLOW — anger always wins.
 * Likewise, a refund request with a happy tone is still RED — money-moving
 * actions always need a human, regardless of sentiment.
 * =========================================================================
 */

import { detectMonetaryActionRequest, detectNonMonetaryAccountAction, detectRecommendationIntent } from './rules.js';

export const ZONES = Object.freeze({ GREEN: 'GREEN', YELLOW: 'YELLOW', RED: 'RED' });

/**
 * @param {string} customerMessage - the raw customer message
 * @param {{found: boolean, context?: string, sources?: string[]}} ragResult - output of rag/getContext()
 * @param {{label: 'positive'|'neutral'|'mild_negative'|'angry', source?: string}} sentiment - output of classifier/sentiment.js assessSentiment()
 * @returns {{zone: 'GREEN'|'YELLOW'|'RED', reason: string}}
 */
export function classify(customerMessage, ragResult, sentiment) {
  const message = customerMessage || '';
  const sentimentLabel = sentiment?.label || 'neutral';

  const monetaryAction = detectMonetaryActionRequest(message);
  const accountAction = detectNonMonetaryAccountAction(message);
  const recommendation = detectRecommendationIntent(message);

  // ---------------------------------------------------------------------
  // RED — hard stop. A human sees the draft before it goes anywhere.
  // ---------------------------------------------------------------------

  // (a) Refund / replacement / cancellation requested.
  if (monetaryAction.requested) {
    return {
      zone: ZONES.RED,
      reason: `Customer is asking for a refund/replacement/cancellation (matched "${monetaryAction.matched}") — money-moving actions always need human sign-off.`,
    };
  }

  // (b) Sentiment is angry / frustrated.
  if (sentimentLabel === 'angry') {
    return {
      zone: ZONES.RED,
      reason: `Sentiment check flagged this message as angry/frustrated (${sentiment?.reason || 'no detail provided'}) — escalating so a human handles the tone, not just the facts.`,
    };
  }

  // (c) RAG found nothing to ground a response in.
  if (!ragResult?.found) {
    return {
      zone: ZONES.RED,
      reason: 'RAG found no grounding data for this message — the agent has nothing real to answer from and would be guessing on order/refund-specific claims, so a human reviews the draft first.',
    };
  }

  // ---------------------------------------------------------------------
  // YELLOW — auto-send, but keep a human in the loop for visibility.
  // ---------------------------------------------------------------------

  if (recommendation.requested) {
    return {
      zone: ZONES.YELLOW,
      reason: `Looks like a recommendation/upsell question (matched "${recommendation.matched}") — sent automatically, logged for review since it touches what we suggest customers buy.`,
    };
  }

  if (accountAction.requested) {
    return {
      zone: ZONES.YELLOW,
      reason: `Customer is asking for a non-monetary account/order change (matched "${accountAction.matched}") — sent automatically, logged for review since it changes something on their order.`,
    };
  }

  if (sentimentLabel === 'mild_negative') {
    return {
      zone: ZONES.YELLOW,
      reason: `Sentiment check flagged mild dissatisfaction, not anger (${sentiment?.reason || 'no detail provided'}) — sent automatically, logged for review to keep an eye on the tone.`,
    };
  }

  // ---------------------------------------------------------------------
  // GREEN — everything checks out, safe to auto-answer with no queue.
  // ---------------------------------------------------------------------
  return {
    zone: ZONES.GREEN,
    reason: 'Factual question with real grounding data and neutral/positive sentiment, no monetary action requested — safe to auto-answer.',
  };
}
