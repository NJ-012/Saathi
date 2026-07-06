/**
 * agent/localFallback.js
 * -----------------------
 * A deterministic, template-based reply used ONLY when the LLM call
 * fails (bad key, rate limit, no network) AND the RAG layer already found
 * real grounding data (ragResult.found === true).
 *
 * Why this exists: without it, ANY LLM-provider outage forces every message —
 * even a plain "is this in stock" question we already have the answer to
 * — into the RED queue, because there's nothing safe to auto-send. That
 * makes the whole demo (and the whole product) hostage to one third-party
 * API's uptime. This function means a grounded answer can still go out
 * automatically even when the LLM is down; only genuinely un-grounded or
 * risky messages still need a human.
 *
 * This is deliberately dumb and literal — it just recites what RAG found,
 * it does not paraphrase, translate, or add tone. That's fine: an honest,
 * slightly stiff reply beats either a hallucination or total silence.
 */

export function buildLocalFallbackDraft(ragResult) {
  if (!ragResult?.found) {
    return "I'm having a little trouble putting together a full reply right now — a member of our team will follow up with you shortly.";
  }

  const context = (ragResult.context || '').trim();
  if (!context) {
    return "I'm having a little trouble putting together a full reply right now — a member of our team will follow up with you shortly.";
  }

  return `Here's what I have on file for you:\n\n${context}\n\n(Our system is having trouble phrasing this more naturally right now, but the details above are accurate.)`;
}
