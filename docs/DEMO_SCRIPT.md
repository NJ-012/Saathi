# Demo Script (3 minutes)

This script assumes zero familiarity with the codebase. Follow it in order —
every message, click, and thing to say is written out. Total runtime: ~3:00.

## Before you go on stage (do this once, not on the clock)

1. **Get a free Gemini key** and put it in `backend/.env` as `GEMINI_API_KEY=...`
   (see `docs/README.md` → Setup). Without a key, every message falls back
   to RED with a placeholder reply — the demo will look broken.
2. Start both processes:
   ```
   cd backend && npm run dev      # http://localhost:4000
   cd dashboard && npm run dev    # http://localhost:5173
   ```
3. Open two browser windows side by side:
   - **Left**: `http://localhost:4000/demo` (the WhatsApp-style chat widget)
   - **Right**: `http://localhost:5173` (the approval dashboard)
4. **Pin the chat widget to a seeded customer.** The widget normally
   generates a random phone number per browser session, which won't match
   any seed data. Open devtools on the left window, go to the Console tab,
   and run:
   ```js
   sessionStorage.setItem('saathi_demo_phone', '+919876543210');
   location.reload();
   ```
   This locks the widget to **Ananya Sharma's number, +919876543210**, who
   has two seeded orders (`data/orders.json`): a delivered kurta and a
   shipped dupatta order. Everything below assumes this phone number.
5. Confirm the dashboard's queue is empty and the stat pills all read 0 —
   if you've tested earlier, restart the backend or just note the starting
   numbers so the deltas you narrate still make sense.

You're ready. Everything from here is the live 3 minutes.

---

## 0:00 – 0:15 — Open

Say: *"Saathi is the customer-care agent for an Indian D2C fashion brand,
Rangrez. It doesn't just auto-reply to everything — it knows which
messages are safe to answer on its own, and which ones need a human. Let's
just talk to it."*

Click into the chat widget (left window).

## 0:15 – 1:00 — Beat 1: stock check + a natural upsell

**Type and send:**
```
Yeh Chikankari kurta size M mein available hai kya?
```

Wait for the reply bubble (a couple of seconds). It will confirm the kurta
is in stock in size M, with the real price and stock count pulled straight
from `data/products.json` (₹1899, size M is in stock — Saathi is grounded
in the actual catalog, not guessing). Point out: this is the **GREEN**
zone — factual, grounded, safe, answered instantly, nothing touches the
dashboard.

**Type and send:**
```
Isse match karne ke liye dupatta suggest karo
```

The reply comes back just as fast — no visible delay — and now upsells a
matching dupatta from the catalog. Say: *"That felt identical to the last
one, but it wasn't the same zone."* Switch to the dashboard window and
explain: this second message asked for a **recommendation**, so it was
classified **YELLOW** — still auto-sent immediately (that's why there was
no visible delay), but logged in the background as a human-visible review
item because it touches what the bot is suggesting customers buy. It never
blocks the reply — it's visibility, not a gate.

*(Note: the exact wording of both replies comes from a live Gemini call,
so it won't be word-for-word identical every run — the stock numbers,
price, and zone will be.)*

## 1:00 – 1:35 — Beat 2: order tracking

**Type and send:**
```
Mera order kaha hai?
```

Reply comes back instantly with real tracking info for Ananya Sharma's
orders — pulled by phone number from `data/orders.json`, most likely
surfacing the shipped dupatta order (tracking `SPX998455IN`). Say: *"Same
customer, same thread — Saathi already knows who she is and what she
ordered, no order number needed."* This is another **GREEN**.

## 1:35 – 2:30 — Beat 3: damaged item + refund (this is the one that stops)

**Type and send:**
```
Product damaged aaya hai, bahut frustrating hai yaar, mujhe refund chahiye abhi!
```

**Nothing appears in the chat.** Let that sit for a second — this is the
point. Say: *"No auto-reply. The moment money is on the line, Saathi
refuses to just answer — a human has to see it first."*

Switch to the dashboard (right window). Within ~3 seconds of polling, a
new card appears in the approval queue. Point at:
- The red-tinted **"Money on the line"** chip at the top of the card.
- The **"Why it's here"** line at the bottom of the card, which reads
  exactly:
  > Customer is asking for a refund/replacement/cancellation (matched
  > "refund") — money-moving actions always need human sign-off.

Say: *"That's not a black-box confidence score — it's a rule, and it tells
you exactly which word triggered it. You can read the entire classifier
in about thirty seconds; it's in `backend/src/classifier/classify.js`."*

Read the drafted reply in the card out loud — it will reference the real
returns policy (48-hour damaged-item window, free replacement or refund),
grounded in `backend/src/rag/data/policy.md`.

Click **"Approve & send."**

Switch back to the chat widget: the reply has now landed in the
customer's thread, exactly as if it had been sent instantly — except a
human actually saw it first.

## 2:30 – 3:00 — Beat 4: why this scales

Stay on the dashboard. Point at the three stat pills at the top:

- **Auto-resolved today** — should read **3** (both stock/upsell messages
  and the order-tracking message never touched a human).
- **Escalated today** — should read **1** (only the refund needed one).
- **Avg response time** — a small number of seconds, pulled up slightly by
  the one human-approved reply — still fast, because 3 out of 4 messages
  needed zero human time.

Close with: *"Three out of four messages, Saathi handled completely on its
own. The fourth, it correctly refused to touch. That ratio is the product —
most bots either automate everything or nothing. Saathi knows the
difference, message by message."*

**End.**
