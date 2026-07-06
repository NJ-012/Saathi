/**
 * agent/llm.js
 * -------------
 * Thin wrapper around the Groq API (free tier, OpenAI-compatible chat
 * completions format). Every LLM call in the project — draft generation
 * in agent/, and the sentiment check in classifier/sentiment.js — goes
 * through this one function, so there is exactly one place that knows
 * about API keys, the model name, and error handling.
 *
 * WHY GROQ, NOT GEMINI: Gemini's free tier is inconsistently provisioned
 * by Google account/region — some projects get a real quota, some get
 * `limit: 0` regardless of usage, which is a billing/eligibility issue,
 * not a bug in this code. Groq's free tier is flat and predictable
 * (30 requests/min, 14,400/day, no credit card, same limits for everyone)
 * and is also noticeably faster, which matters for a live chat demo.
 *
 * For a real deployment, set GROQ_API_KEY in backend/.env (see
 * .env.example). Get a free key at https://console.groq.com/keys —
 * nothing else needs to change. Swapping providers again later only
 * means editing this one file, not the agent or classifier.
 */

import 'dotenv/config';

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MAX_TOKENS = 1000;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Anthropic-style { role, content } messages -> OpenAI-style messages.
 * Groq's chat completions endpoint is OpenAI-compatible, so this is
 * mostly a pass-through; the one addition is folding `system` in as the
 * first message, since that's how the OpenAI-style schema expects it
 * (Gemini's API took system instructions as a separate top-level field —
 * this is the one real shape difference between the two providers).
 */
function toGroqMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  return out;
}

/**
 * @param {{system?: string, messages: {role: 'user'|'assistant', content: string}[], maxTokens?: number}} params
 * @returns {Promise<string>} the text of the model's reply
 */
export async function callLLM({ system, messages, maxTokens = DEFAULT_MAX_TOKENS }) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set. Add it to backend/.env to enable live LLM calls.');
  }

  const body = {
    model: GROQ_MODEL,
    messages: toGroqMessages(system, messages),
    max_tokens: maxTokens,
  };

  // Without a timeout, a stalled connection (flaky venue wifi, a
  // provider-side hiccup) hangs this call indefinitely — fail fast so the
  // caller's catch block (and the local fallback draft) kicks in within a
  // bounded time instead of freezing the conversation.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Groq API call timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new Error(`Groq API network error: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Groq API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error('Groq API response had no text content.');
  }

  return text;
}
