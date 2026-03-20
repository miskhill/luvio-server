# Stripe payments (Luvio)

This repo (`luvio-server`) owns the server-side Stripe integration for the Luvio Shop checkout flow.

The main rule is simple: the browser must never decide price. The frontend sends product IDs and quantities; the backend decides what those items cost and creates the Stripe Checkout Session.

## Current architecture

Flow:
1. `luvio-web` loads shop data from `GET /api/stripe/catalog`.
2. `luvio-web` shows the returned product prices and shipping summary.
3. `luvio-web` posts cart items to `POST /api/stripe/create-checkout-session`.
4. `luvio-server` resolves the final Stripe line items and shipping options.
5. Stripe hosts payment and redirects back to the site.
6. Stripe sends webhook events to `POST /api/stripe/webhook`.

Important implementation points:
- Product display pricing comes from `GET /api/stripe/catalog`.
- Checkout pricing is built on the backend only.
- Return URLs are chosen by the backend, not accepted from the browser.
- Checkout success in the UI is verified by `GET /api/stripe/checkout-session/:sessionId`, not by query params alone.

Key files:
- `stripe/catalogService.js`
- `stripe/productCatalog.js`
- `stripe/routes.js`
- `stripe/paymentService.js`
- `server.js`

## Environment variables

Backend (`luvio-server`) needs:

```bash
STRIPE_SECRET_KEY=sk_live_or_sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://luvioband.co.uk
CHECKOUT_RETURN_ORIGINS=https://luvioband.co.uk,https://www.luvioband.co.uk

STRIPE_PRODUCT_ID_RED_BAND=prod_...
STRIPE_PRODUCT_ID_YELLOW_BAND=prod_...
STRIPE_PRODUCT_ID_GREEN_BAND=prod_...
STRIPE_PRODUCT_ID_BAND_PACK=prod_...
STRIPE_SHIPPING_RATE_STANDARD_GB=shr_...

PORT=3001
```

Frontend (`luvio-web`) needs:

```bash
REACT_APP_API_URL=https://your-backend-domain
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_or_pk_test_...
```

Notes:
- Never put `STRIPE_SECRET_KEY` in frontend env vars.
- The frontend only needs the publishable key and backend URL.
- If product ID env vars are missing entirely, the backend falls back to the local static catalog in `stripe/productCatalog.js`.
- If shipping rate env vars are missing, checkout is disabled instead of silently omitting postage.

## Stripe dashboard setup

### 1) Products

Create or maintain one Stripe Product for each storefront item:
- Red Wristband
- Yellow Wristband
- Green Wristband
- Luvio Band Pack

The backend stores the Stripe Product IDs in environment variables and resolves each Product's `default_price` at runtime.

Requirements:
- Each product must be active.
- Each product must have an active `default_price`.

### 2) Shipping

Create one Stripe Shipping Rate for UK postage and packaging.

Requirements:
- It must be active.
- It must be a fixed-amount shipping rate.
- Its ID must be stored in `STRIPE_SHIPPING_RATE_STANDARD_GB`.

### 3) Payment methods

Enable the payment methods you want in Stripe Dashboard.

The server tries:
1. `automatic_payment_methods`
2. fallback to `payment_method_types: ['card']` if needed

### 4) Webhook

Create a webhook endpoint in Stripe:
- URL: `https://<your-server-domain>/api/stripe/webhook`

Recommended events:
- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

Then copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## What updates automatically

### Product prices

Yes, product price changes can update the website automatically.

This works because the backend stores Stripe Product IDs, not Stripe Price IDs. On catalog fetch and checkout creation, the backend resolves each Product's current `default_price`.

That means:
- If the client creates a new Price in Stripe and makes it the Product's `default_price`, the website and checkout can pick up the new amount automatically.
- You do not need to change the `prod_...` Product ID for that.
- You do not need to deploy code changes for that.

Current cache behavior:
- Catalog data is cached in the backend for 5 minutes.
- After a product price change in Stripe, the site may take up to about 5 minutes to reflect it unless the backend is restarted first.

When you do need to update config:
- If the client creates a brand new Stripe Product instead of updating the existing Product's `default_price`, the Product ID changes.
- In that case, update the relevant `STRIPE_PRODUCT_ID_*` env var.

### Shipping price

Shipping is different.

The current implementation uses a single configured Stripe Shipping Rate ID:
- `STRIPE_SHIPPING_RATE_STANDARD_GB`

In practice, changing a shipping amount in Stripe usually means creating a new Shipping Rate and replacing the old one.

That means:
- A shipping price change will usually require a new `shr_...` ID.
- When that happens, update `STRIPE_SHIPPING_RATE_STANDARD_GB` in the backend environment and redeploy or restart the backend.

## Return URL rules

To prevent malicious redirects, the backend does not trust browser-provided return URLs.

It chooses the return base URL in this order:
1. If `CHECKOUT_RETURN_ORIGINS` is set and the request `Origin` is in that allowlist, use that origin.
2. Otherwise use `FRONTEND_URL`.
3. In non-production only, fall back to the request origin.

Recommended production values:

```bash
FRONTEND_URL=https://luvioband.co.uk
CHECKOUT_RETURN_ORIGINS=https://luvioband.co.uk,https://www.luvioband.co.uk
```

## Go-live checklist

Before launch, confirm:
- Stripe account is fully activated for live charges and payouts.
- The live secret key is set in `STRIPE_SECRET_KEY`.
- The live publishable key is set in `luvio-web`.
- The live webhook signing secret is set in `STRIPE_WEBHOOK_SECRET`.
- All 4 `STRIPE_PRODUCT_ID_*` env vars are set.
- `STRIPE_SHIPPING_RATE_STANDARD_GB` is set.
- `FRONTEND_URL` and `CHECKOUT_RETURN_ORIGINS` are set correctly.

Deploy order:
1. Deploy `luvio-server`.
2. Verify `GET /health` returns `200`.
3. Deploy `luvio-web`.

## Post-deploy verification

Check the catalog first:

```bash
curl -sS https://<your-server-domain>/api/stripe/catalog
```

Expected:
- `pricingSource` is `"stripe"`
- 4 products are returned
- 1 shipping option is returned
- `checkoutEnabled` is `true`

Then run one small checkout and verify:
- Redirect returns with `?checkout=success&session_id=...`
- The site shows "Order received"
- `GET /api/stripe/checkout-session/:sessionId` returns `verifiedPaid: true`
- Stripe webhook deliveries are `2xx`

## Troubleshooting

If `/api/stripe/catalog` shows static pricing:
- Product env vars are missing, incomplete, or invalid.

If checkout is disabled with a shipping warning:
- `STRIPE_SHIPPING_RATE_STANDARD_GB` is missing, invalid, inactive, or not a fixed-amount shipping rate.

If a real card fails with a test-mode error:
- Frontend and backend Stripe keys are in different modes.

If the site still shows the old product price just after a Stripe change:
- Wait for the 5-minute backend catalog cache to expire, or restart the backend.

If the shipping price changed in Stripe but the site did not update:
- Confirm whether Stripe created a new shipping rate.
- If so, update `STRIPE_SHIPPING_RATE_STANDARD_GB`.

## Still not handled here

This setup does not currently:
- Persist orders in a database
- Trigger fulfillment or email from stored order records
- Calculate tax automatically

If tax automation is needed later, Stripe Tax is the next place to look.
