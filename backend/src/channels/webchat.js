/**
 * channels/webchat.js
 * ----------------------
 * Default channel for the demo — no third party, no approval process,
 * nothing that can fall over five minutes before judging. It's a plain
 * HTML/JS chat widget served at GET /demo, styled to read as "this is
 * the WhatsApp experience" (dark-green header, light-green outgoing
 * bubbles, white incoming bubbles, tan chat background) without
 * depending on a live WhatsApp Business number.
 *
 * Implements the exact same contract as whatsapp.js — sendMessage(phone,
 * text) and onIncomingMessage(callback) — so agent/ and dashboard_api/
 * never need to know which channel is actually wired up. Under the hood
 * it's just an in-memory outbox per phone number, polled by the widget
 * every couple of seconds (same "keep it simple" pattern as the
 * dashboard's own polling).
 */

import express from 'express';

const outgoingByPhone = new Map(); // phone -> [{ id, text, sentAt }]
let nextMessageId = 1;
let incomingCallback = null;

/** Send a message to a customer on the webchat channel. */
export async function sendMessage(phone, text) {
  const list = outgoingByPhone.get(phone) || [];
  list.push({ id: `WC-${nextMessageId++}`, text, sentAt: new Date().toISOString() });
  outgoingByPhone.set(phone, list);
  return { status: 'sent', mode: 'webchat' };
}

/** Register the function to call whenever a customer message arrives. */
export function onIncomingMessage(callback) {
  incomingCallback = callback;
}

function getMessagesAfter(phone, afterId) {
  const list = outgoingByPhone.get(phone) || [];
  if (!afterId) return list;
  const idx = list.findIndex((m) => m.id === afterId);
  return idx === -1 ? list : list.slice(idx + 1);
}

/**
 * HTTP routes: the widget page itself plus its tiny send/poll API.
 * Mounted at the app root by index.js, so the final paths are
 * /demo, /demo/api/send, and /demo/api/messages.
 */
export const router = express.Router();

router.get('/demo', (req, res) => {
  res.type('html').send(DEMO_HTML);
});

router.post('/demo/api/send', express.json(), async (req, res) => {
  const { phone, text } = req.body || {};
  if (!phone || !text) {
    return res.status(400).json({ error: 'missing_fields', message: '"phone" and "text" are both required.' });
  }

  if (incomingCallback) {
    // Don't block the widget's own request on the full agent pipeline —
    // the reply (auto-sent or human-approved) shows up via polling.
    incomingCallback(phone, text).catch((err) => {
      console.error('[channels:webchat] onIncomingMessage handler failed:', err.message);
    });
  } else {
    console.warn('[channels:webchat] Message arrived but no onIncomingMessage callback is registered — dropped.');
  }

  res.json({ status: 'received' });
});

router.get('/demo/api/messages', (req, res) => {
  const { phone, after } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'missing_phone', message: 'Query param "phone" is required.' });
  }
  res.json({ messages: getMessagesAfter(phone, after) });
});

// -------------------------------------------------------------------------
// The widget itself — plain HTML/CSS/JS, no build step. Styled to look and
// feel like a WhatsApp chat: dark-green header, tan wallpaper, light-green
// bubbles for the "customer" (you, typing), white bubbles for Rangrez.
// -------------------------------------------------------------------------
const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Rangrez — WhatsApp</title>
<style>
  :root {
    --wa-header: #075e54;
    --wa-header-dark: #054d44;
    --wa-accent: #25d366;
    --wa-bg: #e5ddd5;
    --wa-out-bubble: #d9fdd3;
    --wa-in-bubble: #ffffff;
    --wa-text: #111b21;
    --wa-meta: #667781;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #0b141a;
  }
  .phone-frame {
    max-width: 460px;
    margin: 0 auto;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--wa-bg);
    box-shadow: 0 0 40px rgba(0,0,0,0.4);
  }
  .header {
    background: var(--wa-header);
    color: #fff;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .header .avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: #ffffff33;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 15px;
  }
  .header .title { font-size: 16px; font-weight: 600; line-height: 1.2; }
  .header .subtitle { font-size: 12px; color: #d8f0eb; }
  .demo-banner {
    background: var(--wa-header-dark);
    color: #cfeee7;
    font-size: 11px;
    text-align: center;
    padding: 4px 8px;
    flex-shrink: 0;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background-image: radial-gradient(circle at 20px 20px, rgba(0,0,0,0.02) 1px, transparent 0);
    background-size: 22px 22px;
  }
  .bubble-row { display: flex; }
  .bubble-row.out { justify-content: flex-end; }
  .bubble-row.in { justify-content: flex-start; }
  .bubble {
    max-width: 78%;
    padding: 7px 9px 8px 10px;
    border-radius: 8px;
    font-size: 14.3px;
    line-height: 1.35;
    color: var(--wa-text);
    box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .bubble.out { background: var(--wa-out-bubble); border-top-right-radius: 2px; }
  .bubble.in { background: var(--wa-in-bubble); border-top-left-radius: 2px; }
  .bubble .time {
    display: block;
    font-size: 10.5px;
    color: var(--wa-meta);
    text-align: right;
    margin-top: 3px;
  }
  .composer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #f0f0f0;
  }
  .composer input {
    flex: 1;
    border: none;
    outline: none;
    border-radius: 20px;
    padding: 10px 16px;
    font-size: 14.5px;
    background: #fff;
  }
  .composer button {
    background: var(--wa-header);
    color: #fff;
    border: none;
    width: 40px; height: 40px;
    border-radius: 50%;
    font-size: 16px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .composer button:disabled { opacity: 0.5; cursor: not-allowed; }
  .empty-hint {
    text-align: center;
    color: var(--wa-meta);
    font-size: 12.5px;
    padding: 24px 30px;
  }
</style>
</head>
<body>
  <div class="phone-frame">
    <div class="header">
      <div class="avatar">R</div>
      <div>
        <div class="title">Rangrez</div>
        <div class="subtitle" id="statusLine">online</div>
      </div>
    </div>
    <div class="demo-banner">Demo widget standing in for WhatsApp — same customer experience, no live WA number needed.</div>
    <div class="messages" id="messages">
      <div class="empty-hint">Say hi to Rangrez customer care 👋<br/>Try: "I want a refund for my order, this is unacceptable!"</div>
    </div>
    <div class="composer">
      <input id="input" type="text" placeholder="Type a message" autocomplete="off" />
      <button id="sendBtn" title="Send">➤</button>
    </div>
  </div>

<script>
(function () {
  var STORAGE_KEY = 'saathi_demo_phone';
  var phone = sessionStorage.getItem(STORAGE_KEY);
  if (!phone) {
    var suffix = Math.floor(1000000 + Math.random() * 8999999);
    phone = '+9199' + suffix;
    sessionStorage.setItem(STORAGE_KEY, phone);
  }

  var messagesEl = document.getElementById('messages');
  var inputEl = document.getElementById('input');
  var sendBtn = document.getElementById('sendBtn');
  var statusLine = document.getElementById('statusLine');
  var lastSeenId = null;
  var hasMessages = false;

  function clearEmptyHint() {
    if (!hasMessages) {
      messagesEl.innerHTML = '';
      hasMessages = true;
    }
  }

  function timeLabel() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
  }

  function appendBubble(text, direction) {
    clearEmptyHint();
    var row = document.createElement('div');
    row.className = 'bubble-row ' + direction;
    var bubble = document.createElement('div');
    bubble.className = 'bubble ' + direction;
    bubble.textContent = text;
    var time = document.createElement('span');
    time.className = 'time';
    time.textContent = timeLabel();
    bubble.appendChild(time);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return;
    appendBubble(text, 'out');
    inputEl.value = '';
    sendBtn.disabled = true;
    statusLine.textContent = 'typing…';

    fetch('/demo/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: phone, text: text }),
    })
      .catch(function (err) { console.error('send failed', err); })
      .finally(function () { sendBtn.disabled = false; });
  }

  function poll() {
    var url = '/demo/api/messages?phone=' + encodeURIComponent(phone) + (lastSeenId ? '&after=' + encodeURIComponent(lastSeenId) : '');
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var msgs = data.messages || [];
        if (msgs.length) {
          msgs.forEach(function (m) {
            appendBubble(m.text, 'in');
            lastSeenId = m.id;
          });
          statusLine.textContent = 'online';
        }
      })
      .catch(function () { /* backend not reachable yet — keep polling quietly */ });
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
  });

  poll();
  setInterval(poll, 2000);
})();
</script>
</body>
</html>
`;
