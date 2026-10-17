# Luvio Server

Express.js server for the Luvio application.

## Charity fundraising counter

`GET /api/stripe/charity-impact` returns the cumulative amount pledged to Mind. The server
calculates eligible band quantities when creating Stripe Checkout Sessions and stores the trusted
quantity in Checkout metadata. The public total is rebuilt from completed, paid Stripe Checkout
Sessions, so it survives restarts and webhook retries without a separate mutable counter.

Older paid Checkout Sessions are included when their Stripe product IDs match the configured
Luvio products. The `band-pack` catalog item represents three individual bands; each other band
represents one.

Completed monthly donations are recorded separately in `charity/donations.json` and do not reduce
the cumulative pledge. Only add an entry after the transfer has evidence, using this shape:

```json
{
  "period": "2026-10",
  "amountPence": 2500,
  "paidAt": "2026-11-05T00:00:00.000Z",
  "confirmationReference": "internal-reference-not-returned-by-the-public-api"
}
```

### Production operation

- The website reads the same public total for the homepage card and `/charity` page.
- The total is cached for five minutes and invalidated by successful Checkout webhooks.
- Subscribe the deployed Stripe webhook to `checkout.session.completed` and
  `checkout.session.async_payment_succeeded` so card and delayed-payment sales refresh promptly.
- Deploy server API changes before dependent website changes.
- After deployment, verify that `GET /api/stripe/charity-impact` returns integer pence, `GBP`, an
  eligible-band count, and no customer or payment details.

