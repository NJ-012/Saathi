/**
 * channels/whatsapp.js
 * ----------------------
 * Real channel implementation using the WhatsApp Cloud API. This is what
 * a production deployment uses, but it depends on Meta approving a
 * business/sandbox number — something that can slip past a hackathon
 * deadline. So this module is defensive on purpose:
 *
 *   - It's only wired up at all if WHATSAPP_ENABLED=true (see
 *     channels/index.js, which picks between this and webchat.js).
 *   - Even then, if the required env vars aren't set, sendMessage()
 *     no-ops with a console warning instead of throwing — the rest of
 *     the pipeline (classifier, dashboard) keeps working.
 *
 * Same contract as webchat.js: sendMessage(phone, text) and
 * onIncomingMessage(callback). agent/ and dashboard_api/ only ever talk
 * to channels/index.js, so neither needs to know which of these two is
 * actually active.
 */

import 'dotenv/config';
import express from 'express';

const GRAPH_API_VERSION = 'v20.0';

function isConfigured() {
  return Boolean(process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Send a WhatsApp text message via the Cloud API. */
export async function sendMessage(phone, text) {
  if (!isConfigured()) {
    console.warn(
      `[channels:whatsapp] WHATSAPP_CLOUD_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set — ` +
        `message NOT sent to ${phone}. (Set WHATSAPP_ENABLED=false to use the webchat demo instead.)`
    );
    return { status: 'not_configured', mode: 'whatsapp' };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/\D/g, ''),
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[channels:whatsapp] send failed (${response.status}): ${errorBody}`);
      return { status: 'error', mode: 'whatsapp', error: errorBody };
    }

    return { status: 'sent', mode: 'whatsapp' };
  } catch (err) {
    console.error('[channels:whatsapp] send failed:', err.message);
    return { status: 'error', mode: 'whatsapp', error: err.message };
  }
}

let incomingCallback = null;

/** Register the function to call whenever a customer message arrives. */
export function onIncomingMessage(callback) {
  incomingCallback = callback;
}

/**
 * HTTP routes for the WhatsApp Cloud API webhook: GET handles Meta's
 * verification handshake, POST delivers incoming messages.
 * Mounted at the app root by index.js (only when WHATSAPP_ENABLED=true),
 * so the final path is /webhook.
 */
export const router = express.Router();

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/webhook', express.json(), async (req, res) => {
  // Acknowledge immediately — WhatsApp retries aggressively on non-2xx
  // responses, and we don't want a slow agent pipeline to trigger dupes.
  res.sendStatus(200);

  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return; // delivery/read receipts etc. — nothing to do

    const phone = message.from;
    const text = message.text?.body;
    if (!phone || !text) return;

    if (incomingCallback) {
      await incomingCallback(phone, text);
    } else {
      console.warn('[channels:whatsapp] Message arrived but no onIncomingMessage callback is registered — dropped.');
    }
  } catch (err) {
    console.error('[channels:whatsapp] webhook handling failed:', err.message);
  }
});
