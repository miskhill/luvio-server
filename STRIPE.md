# Stripe payments (Luvio)

This repo (`luvio-server`) owns the **Stripe server integration** for the Luvio Shop checkout flow.

The goal is: **the browser never decides price**. The server defines what can be purchased and how much it costs, then redirects users to **Stripe-hosted Checkout**.

## Current status snapshot

As of **February 21, 2026**:
- Integration work is in **Stripe test mode**.
- Changes are **not yet pushed live**.
- Live cutover depends on client Stripe account access + live credentials.

## Current flow

1. `luvio-web` builds a cart UI (items + quantities).
2. `luvio-web` calls `POST /api/stripe/create-checkout-session`.
3. `luvio-server` creates a Stripe Checkout Session and returns `{ url }`.
4. Browser redirects to Stripe Checkout.
5. Stripe calls `POST /api/stripe/webhook` (server verifies signature).

## Security changes made (important)

### 1) Server-side pricing (prevents “edit the price” attacks)

Previously, the server accepted `item.price` from the client and used it to set Stripe `unit_amount`, which is unsafe.

Now:
- The server uses a server-side product catalog and **ignores client price/name**.
- The client can only influence **which product** (by `id`) and **how many** (`quantity`), within limits.

Files:
- `stripe/productCatalog.js`
- `stripe/routes.js`

### 2) Webhook raw body parsing (required for signature verification)

Stripe webhook signatures are computed over the **raw request body**.

Now the server uses:
- `app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))`

Files:
- `server.js`
- `stripe/routes.js`

### 3) Webhook handling updated for Checkout Sessions

For Stripe Checkout (hosted), the most useful webhook event is typically:
- `checkout.session.completed`

File:
- `stripe/paymentService.js`

## Configuration (environment variables)

`luvio-server` expects:

```bash
STRIPE_SECRET_KEY=sk_live_... (or sk_test_... in test mode)
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://luvioband.co.uk
PORT=3001
```

Notes:
- **Never** put `STRIPE_SECRET_KEY` in any frontend (`luvio-web`) environment variables.
- `STRIPE_WEBHOOK_SECRET` is the signing secret for your webhook endpoint (created in Stripe dashboard).

## Stripe Dashboard setup checklist (what the owner needs to do)

### A) Activate the account (live payments)

In Stripe Dashboard:
- Complete business details / bank payout setup (required before taking real payments).
- Switch between **Test mode** and **Live mode** as needed.

### B) Enable payment methods (owner decision)

Payment methods are enabled in Stripe Dashboard.

Where:
- **Settings → Payment methods**

Important:
- The server now attempts to use **automatic payment methods** for Checkout Sessions (Stripe offers the best set of methods you've enabled for the customer/currency).
- If that fails due to account/API constraints, the server falls back to `payment_method_types: ['card']`.

### C) Create the webhook endpoint (required for reliable fulfillment)

Where:
- **Developers → Webhooks → Add endpoint**

Endpoint URL:
- `https://<your-server-domain>/api/stripe/webhook`

Events to select (minimum):
- `checkout.session.completed`

Also consider:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded` (if you support refunds)

Then copy the “Signing secret” (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

## Live access handover checklist (for future go-live)

Use this when client Stripe access is granted and you are ready to move from test to live.

### 1) Credentials / IDs to collect from Stripe

Required:
- **Live secret key**: `sk_live_...` (server only, set as `STRIPE_SECRET_KEY` in `luvio-server`).
- **Live webhook signing secret**: `whsec_...` (for the live webhook endpoint, set as `STRIPE_WEBHOOK_SECRET`).

Usually required in `luvio-web` too:
- **Live publishable key**: `pk_live_...` (frontend env `REACT_APP_STRIPE_PUBLISHABLE_KEY`).

Useful to record for support/troubleshooting:
- **Stripe account ID**: `acct_...`
- **Webhook endpoint ID** (live): `we_...` (or equivalent endpoint identifier in dashboard)

Optional (only if/when migrating to Stripe-managed prices):
- **Stripe Product IDs**: `prod_...`
- **Stripe Price IDs**: `price_...`

### 2) Dashboard confirmations in LIVE mode

- Confirm account is fully activated for live charges/payouts.
- Confirm desired payment methods are enabled.
- Confirm live webhook endpoint exists at:
  - `https://<your-server-domain>/api/stripe/webhook`
- Confirm webhook subscribes to:
  - `checkout.session.completed`
  - `payment_intent.succeeded` (optional but useful)
  - `payment_intent.payment_failed` (optional but useful)

### 3) Deployment values to update

`luvio-server` (production env):
- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `FRONTEND_URL=https://luvioband.co.uk`
- `CHECKOUT_RETURN_ORIGINS=https://luvioband.co.uk,https://www.luvioband.co.uk`

`luvio-web` (production env):
- `REACT_APP_API_URL=<your live API URL>`
- `REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_...`

### 4) Quick post-deploy live verification

- Run one small real transaction and verify:
  - Redirect returns to site with `?checkout=success&session_id=...`
  - Checkout status card shows "Order received"
  - `GET /api/stripe/checkout-session/:sessionId` returns `verifiedPaid: true`
  - Webhook deliveries in Stripe dashboard are successful (`2xx`)

## Day-of-go-live runbook (10-minute checklist)

Use this sequence on release day to reduce mistakes.

### Step 1) Preflight checks (5 minutes before deploy)

- Confirm Stripe dashboard is in **LIVE mode** (not Test mode).
- Confirm you have:
  - `sk_live_...`
  - `pk_live_...`
  - `whsec_...` (for live webhook endpoint)
- Confirm production webhook endpoint exists:
  - `https://<your-server-domain>/api/stripe/webhook`
- Confirm webhook events include:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`

### Step 2) Update production environment variables

`luvio-server`:
- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `FRONTEND_URL=https://luvioband.co.uk`
- `CHECKOUT_RETURN_ORIGINS=https://luvioband.co.uk,https://www.luvioband.co.uk`

`luvio-web`:
- `REACT_APP_API_URL=<your live API URL>`
- `REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_...`

### Step 3) Deploy order (important)

1. Deploy `luvio-server` first.
2. Verify API health endpoint returns `200`:
   - `GET /health`
3. Deploy `luvio-web` second.

### Step 4) Live smoke test (one low-value real payment)

1. Add one item to cart on production site.
2. Complete Stripe Checkout with a real card.
3. Confirm redirect returns with:
   - `?checkout=success&session_id=...`
4. Confirm UI shows "Order received" in checkout status card.
5. Confirm Stripe dashboard shows:
   - Successful `checkout.session.completed` webhook delivery (`2xx`).

### Step 5) Backend confirmation check (optional but recommended)

Use returned `session_id` and verify API response:

```bash
curl -sS https://<your-server-domain>/api/stripe/checkout-session/<session_id>
```

Expected:
- `verifiedPaid: true`
- Correct `amountTotal`
- Correct `currency`

### Step 6) Rollback triggers

Rollback immediately if any of these occur:
- Redirect flow fails for live checkout users.
- Webhook deliveries fail repeatedly (`4xx`/`5xx`).
- `checkout-session` verification endpoint cannot confirm paid sessions.
- Unexpected live payment failures exceed normal decline rates.

Rollback path:
1. Revert `luvio-web` deploy.
2. Revert `luvio-server` deploy.
3. Re-check env values and webhook signing secret.
4. Re-run smoke test in controlled mode before re-release.

### D) Checkout settings / branding (optional but recommended)

You can configure:
- Brand name, logo, accent color
- Customer email receipt settings

Where (varies a bit by Stripe UI):
- **Settings → Branding**
- **Settings → Email receipts**

### E) Shipping & taxes (physical goods)

The server currently **collects** shipping + billing addresses:
- Billing address is required
- Shipping address is limited to `GB` in `stripe/paymentService.js`

However, the server does **not** currently:
- Add shipping costs (Stripe Shipping Rates / `shipping_options`)
- Calculate taxes (Stripe Tax)

If you ship bands, you likely want to add shipping rates and (optionally) Stripe Tax.

## Recommended next hardening (still to do)

These are strong improvements if you want “as little as possible to worry about”:

1. **Use Stripe Products + Prices**
   - Instead of sending `price_data`, pass Stripe Price IDs: `line_items: [{ price: 'price_...', quantity }]`.
   - Benefits: prices are managed in Stripe, easier auditing/changes, and avoids creating ad-hoc price_data on every checkout.
   - Important Stripe nuance: **Price amounts are effectively immutable**. To change a price you typically **create a new Price** in Stripe, then (optionally) set it as the Product’s `default_price`.
   - If the server hardcodes `price_...` IDs, changing prices in Stripe will **not** automatically update checkout until the mapping is updated.
   - For “owner can change price in Stripe and the site updates” you need one of:
     - **Lookup by Product `default_price`** at runtime (server queries Stripe Product and uses its current default price).
     - **Config-driven mapping** (price IDs stored in env/config so the owner can update without a deploy).

2. **Do not accept `successUrl` / `cancelUrl` from the client**
   - Done: the server now ignores client-provided return URLs and uses a configured base URL.
   - The server sets `success_url` to include `?checkout=success&session_id={CHECKOUT_SESSION_ID}` for confirmation flows.
   - Configure `FRONTEND_URL` (recommended) and optionally `CHECKOUT_RETURN_ORIGINS` for dev/multi-domain setups.

3. **Never treat query params as proof of payment**
   - `/?checkout=success` can be faked by typing it in the address bar.
   - Confirm using webhook-driven order state, or fetch the Checkout Session status server-side.

4. **Persist orders**
   - Save an order record when a Checkout Session is created.
   - On `checkout.session.completed`, mark it “paid” and trigger fulfillment/email.

## Testing tips

- Use Stripe **test mode** keys.
- Use Stripe CLI to forward webhooks to local dev:
  - `stripe login`
  - `stripe listen --forward-to localhost:3001/api/stripe/webhook`
  - Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`

## Return URL configuration (important)

To prevent malicious redirects, the server does **not** accept return URLs from the browser.

It chooses the base URL in this order:
1. If `CHECKOUT_RETURN_ORIGINS` is set, and `Origin` matches one of them, use that origin
2. Otherwise use `FRONTEND_URL`
3. Dev fallback: if not production, use request `Origin`

Set these:

```bash
FRONTEND_URL=https://luvioband.co.uk
# Optional, comma-separated allowlist (useful for local dev or multiple domains)
CHECKOUT_RETURN_ORIGINS=http://localhost:3000,https://luvioband.co.uk,https://www.luvioband.co.uk
```

## Pricing: what updates “automatically”

Today:
- The website display prices are hardcoded in `luvio-web`.
- Stripe charge amounts are defined server-side in `stripe/productCatalog.js`.

If you move to Stripe Products/Prices:
- Stripe Checkout will charge whatever price ID (or Product default price) the server uses.
- The website **will not** automatically show updated prices unless the frontend fetches pricing from the server (or Stripe) instead of hardcoding it.
