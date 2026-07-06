# Saathi

**FlowZint AI Hackathon 2026 — Customer Care Bot category**

Most AI customer bots either automate everything or nothing. Saathi knows
the difference, message by message. It sits in a D2C brand's WhatsApp
thread and answers what it can ground in real data — stock, orders,
policy — while routing anything money-moving, angry, or ungrounded
straight to a human, before a single word reaches the customer.

## Problem

Indian D2C fashion brands run sales, support, and post-purchase care
through the same handful of overworked WhatsApp numbers. A single agent
is expected to quote stock, track a shipment, and handle a refund request
in the same breath — and the volume only grows as the brand does. Fully
automating that thread is risky (a bot that confidently mishandles a
refund becomes a chargeback and a bad review); staffing it entirely with
humans doesn't scale past a certain order volume.

## What it does

- **Sells** — answers stock, size, and price questions grounded in the
  real product catalog, and naturally upsells matching products.
- **Supports** — looks up real orders by phone number or order ID and
  gives an honest tracking status, no guessing.
- **Cares** — recognizes refunds, damaged items, and frustration, and
  hands those straight to a human instead of auto-replying.
- All three, in one continuous WhatsApp thread — the customer never
  knows which messages were handled by AI and which were reviewed by a
  person.

## The traffic-light system

Every incoming message is scored and routed before anything is sent.

| Zone | Trigger | Action |
|------|---------|--------|
| 🟢 **Green** | Factual question, grounded in real product/order/policy data, neutral or positive tone, no money involved | Auto-answered instantly, no human in the loop |
| 🟡 **Yellow** | A recommendation/upsell question, a non-monetary order change (size, address, exchange), or mild dissatisfaction | Auto-sent immediately, but logged to a review queue for visibility |
| 🔴 **Red** | Refund / replacement / cancellation requested, angry sentiment, or no grounding data found at all | **Nothing is sent.** Drafted reply is parked for a human to approve, edit, or reject |

Full rule table and rationale: `backend/src/classifier/classify.js`.

## Tech stack

- **Backend**: Node.js + Express (ESM). Google Gemini (`gemini-2.0-flash`,
  free tier) for reply drafting and sentiment fallback.
- **Dashboard**: React + Vite + Tailwind CSS.
- **Data**: local JSON mock store standing in for a Shopify/WooCommerce
  catalog and order history (`data/products.json`, `data/orders.json`).
- **Channel**: a built-in WhatsApp-styled web widget (`/demo`) for the
  live demo; a real WhatsApp Cloud API adapter is already wired behind
  the same interface, switched on with one env var.

## Setup

Requires Node.js ≥ 18 and a free [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone <this-repo-url> saathi
cd saathi

# backend
cd backend
npm install
cp ../.env.example .env
# open .env and set GEMINI_API_KEY=<your key>
npm run dev          # http://localhost:4000

# dashboard (in a second terminal)
cd ../dashboard
npm install
npm run dev          # http://localhost:5173
```

Open **http://localhost:4000/demo** to chat as a customer, and
**http://localhost:5173** to see the human-approval dashboard.

## Live demo

Full step-by-step script, with exact lines to type and what to expect at
each step: [`docs/DEMO_SCRIPT.md`](./DEMO_SCRIPT.md).

## Roadmap (not built yet)

- **Voice / Hindi ASR** — accept voice notes on WhatsApp, transcribe
  Hindi/Hinglish speech, and reply in kind.
- **Real WhatsApp Business integration** — the Cloud API adapter exists
  (`backend/src/channels/whatsapp.js`) but has not been connected to an
  approved WhatsApp Business number; `/demo` is a stand-in for the judged
  build.
- **Multi-brand support** — today's mock store and prompt are scoped to
  one brand (Rangrez); multi-tenant catalogs, policies, and branding are
  future work.
