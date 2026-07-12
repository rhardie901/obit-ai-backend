# Obit AI — Backend

Express backend for Obit AI. Handles AI generation (server-side, key hidden), Word/PDF export with cover photo, and Stripe payment.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `ANTHROPIC_MODEL` — a model alias (e.g. `claude-haiku-latest`) so you don't need to redeploy when Anthropic updates models. Confirm the current alias name in Anthropic's docs before deploying.
- `STRIPE_SECRET_KEY` — from your Stripe dashboard (use a test key while developing)
- `STRIPE_WEBHOOK_SECRET` — generated when you set up the webhook endpoint in Stripe
- `ALLOWED_ORIGINS` — your frontend's URL(s), comma-separated

## Run locally

```bash
npm start
```

Server runs on `http://localhost:3000` by default.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/generate/:outputType` | `outputType` is `program`, `obituary`, or `eulogy`. Body: `{ intake, tone }` |
| POST | `/api/export` | Generates Word doc (or PDF if `format: "pdf"`). Body: `{ fullName, dateBirth, datePassing, program, obituary, eulogy, photoBase64, format }` |
| POST | `/api/payment/create-checkout-session` | Starts Stripe Checkout. Body: `{ fullName }` |
| GET | `/api/payment/verify/:sessionId` | Confirms payment before allowing export |
| POST | `/api/payment/webhook` | Stripe webhook endpoint — register this URL in your Stripe dashboard |
| GET | `/api/health` | Returns `{ status: "ok" }` — useful for checking the server is up after deploy |

## What this does NOT store

No intake content, generated text, or photos are written to disk or a database outside the brief lifespan of generating an export file (which is deleted immediately after the response is sent). The only thing logged is the Stripe session ID and amount on successful payment — no personal or memorial content.

## Deploying to Vercel

This is a standard Express app — Vercel needs a small adapter to run it as serverless functions, or you can deploy to a platform that runs long-lived Node servers natively (Railway, Render, Fly.io) which requires zero extra configuration. If staying with Vercel, add a `vercel.json` routing config — ask for this when you're ready to deploy and it can be added.

## Rate limiting

Basic in-memory rate limiting is included (12 requests/minute per IP) to prevent runaway API costs during testing. This resets if the server restarts and won't scale across multiple server instances — replace with a proper store (Redis) before meaningful traffic.

## Connecting the frontend

The frontend (`obit-ai-form.html`) currently calls Anthropic directly from the browser. Before deploying, that needs to change to call this backend instead:

- Replace the `callAPI` function's `fetch('https://api.anthropic.com/v1/messages', ...)` with `fetch('<your-backend-url>/api/generate/' + outputType, { method: 'POST', body: JSON.stringify({ intake, tone: selectedTone }) })`
- Remove the API key and system prompt building entirely from the frontend — both now live server-side
