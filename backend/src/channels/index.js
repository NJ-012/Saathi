/**
 * channels/index.js
 * ------------------
 * The channel INTERFACE — sendMessage(phone, text) and
 * onIncomingMessage(callback) — plus the switch between the two
 * implementations that satisfy it:
 *
 *   webchat.js  — default. A WhatsApp-styled widget served at /demo,
 *                 zero external dependencies, zero approval process.
 *   whatsapp.js — the real WhatsApp Cloud API, used only when
 *                 WHATSAPP_ENABLED=true and its env vars are filled in.
 *
 * Everything else in the codebase (agent/, dashboard_api/) imports
 * sendMessage/onIncomingMessage from HERE, never from whatsapp.js or
 * webchat.js directly — so which channel is actually live is a one-line
 * env var flip, not a code change.
 */

import 'dotenv/config';
import * as whatsapp from './whatsapp.js';
import * as webchat from './webchat.js';

function whatsappEnabled() {
  return String(process.env.WHATSAPP_ENABLED).toLowerCase() === 'true';
}

function activeChannel() {
  return whatsappEnabled() ? whatsapp : webchat;
}

export function activeChannelName() {
  return whatsappEnabled() ? 'whatsapp' : 'webchat';
}

/** Send a message to a customer over whichever channel is active. */
export async function sendMessage(phone, text) {
  return activeChannel().sendMessage(phone, text);
}

/** Register the function to call whenever a customer message arrives. */
export function onIncomingMessage(callback) {
  return activeChannel().onIncomingMessage(callback);
}

/**
 * The active channel's HTTP routes (webhook for WhatsApp, the /demo
 * widget + its send/poll API for webchat). index.js mounts this at the
 * app root.
 */
export function activeRouter() {
  return activeChannel().router;
}
