/**
 * backend/src/index.js
 * ----------------------
 * Server entrypoint. Wires the mock store, the dashboard API, the active
 * messaging channel, and a small direct-test route into one Express app.
 *
 *   /api/store/*    -> mock_store/api.js    (products, orders)
 *   /api/*           -> dashboard_api/api.js (approvals, review-queue, log, stats)
 *   /api/messages    -> POST — inject a customer message directly (handy
 *                       for curl/testing without the chat widget)
 *   /demo  or /webhook -> whichever channel is active (see channels/index.js):
 *                       webchat.js by default (WhatsApp-styled widget +
 *                       its send/poll API), or whatsapp.js's Cloud API
 *                       webhook if WHATSAPP_ENABLED=true.
 *
 * Real customer messages arrive through the active channel, which is
 * wired to the agent via onIncomingMessage() below — the channel itself
 * never needs to know the agent exists.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import mockStoreApi from './mock_store/api.js';
import dashboardApi from './dashboard_api/api.js';
import { handleIncomingMessage } from './agent/index.js';
import { callLLM } from './agent/llm.js';
import { onIncomingMessage, activeRouter, activeChannelName } from './channels/index.js';

/**
 * One-time ping to the LLM provider at boot. This exists so a bad/expired
 * key, an unreachable network, or (as happened with a previous Gemini
 * setup) a zero-quota free tier shows up as a clear ✅/❌ line in the
 * terminal the moment the server starts — not three messages into a live
 * demo when the dashboard mysteriously stops auto-resolving anything.
 */
async function selfTestLLM() {
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️  [startup] GROQ_API_KEY is not set — every message will fall back to the local template drafter.');
    return;
  }
  try {
    await callLLM({ messages: [{ role: 'user', content: 'Reply with the single word: ok' }], maxTokens: 10 });
    console.log('✅ [startup] Groq self-test passed — LLM drafting is live.');
  } catch (err) {
    console.warn(`❌ [startup] Groq self-test FAILED: ${err.message}`);
    console.warn('    Messages will still work via the local fallback drafter (grounded data only), but nothing will be LLM-generated until this is fixed.');
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', channel: activeChannelName() }));

app.use('/api/store', mockStoreApi);
app.use('/api', dashboardApi);

// Whichever channel is active gets to add its own routes at the app root
// (e.g. GET /demo + its send/poll API, or GET+POST /webhook for WhatsApp).
app.use('/', activeRouter());

/**
 * POST /api/messages
 * Body: { phone: string, text: string }
 * Direct-test route: injects a message into the agent pipeline without
 * going through a channel at all. RAG -> draft -> sentiment -> classify
 * -> act. GREEN/YELLOW get auto-sent; RED lands in the approval queue.
 */
app.post('/api/messages', async (req, res) => {
  const { phone, text } = req.body || {};

  if (!phone || !text) {
    return res.status(400).json({ error: 'missing_fields', message: '"phone" and "text" are both required.' });
  }

  try {
    const result = await handleIncomingMessage(phone, text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'agent_error', message: err.message });
  }
});

// Wire the active channel's incoming messages straight into the agent.
onIncomingMessage(handleIncomingMessage);

app.listen(PORT, () => {
  const channel = activeChannelName();
  console.log(`Saathi backend listening on http://localhost:${PORT}`);
  console.log(
    channel === 'webchat'
      ? `[channels] Using the webchat demo — open http://localhost:${PORT}/demo to chat as a customer. (Set WHATSAPP_ENABLED=true once your WhatsApp Cloud API number is approved.)`
      : `[channels] Using the WhatsApp Cloud API — webhook is at http://localhost:${PORT}/webhook.`
  );
  selfTestLLM();
});
