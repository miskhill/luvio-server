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

