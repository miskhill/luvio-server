const express = require('express');
const stripe = require('./config');
const catalogService = require('./catalogService');
const paymentService = require('./paymentService');

const router = express.Router();

function normalizeAllowedOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getReturnBaseUrl(req) {
  const allowedOrigins = normalizeAllowedOrigins(process.env.CHECKOUT_RETURN_ORIGINS);
  const requestOrigin = req.headers.origin;

  if (allowedOrigins.length > 0 && requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }

  // Dev fallback to keep local setup working, but only outside production.
  if (process.env.NODE_ENV !== 'production' && requestOrigin) {
    return requestOrigin;
  }

  return null;
}

function joinUrl(base, path) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};

  const MAX_KEYS = 20;
  const MAX_VALUE_LEN = 500;

  const entries = Object.entries(metadata)
    .slice(0, MAX_KEYS)
    .map(([key, value]) => [String(key), typeof value === 'string' ? value : String(value)]);

  return Object.fromEntries(entries.map(([k, v]) => [k, v.slice(0, MAX_VALUE_LEN)]));
}

router.post('/create-checkout-session', async (req, res) => {
  try {
    const { cartItems, metadata = {} } = req.body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart items are required' });
    }
    const { lineItems, pricingSource, shippingOptions } = await catalogService.buildCheckoutConfig(cartItems);

    const returnBaseUrl = getReturnBaseUrl(req);
    if (!returnBaseUrl) {
      return res.status(500).json({ error: 'Checkout return URL is not configured' });
    }

    const successUrl = joinUrl(returnBaseUrl, '/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
    const cancelUrl = joinUrl(returnBaseUrl, '/?checkout=cancelled');

    const result = await paymentService.createCheckoutSession(
      lineItems,
      successUrl,
      cancelUrl,
      sanitizeMetadata(metadata),
      {
        pricingSource,
        shippingOptions,
      }
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error creating checkout session:', error);

    const errorMessage = error.message || 'Failed to create checkout session';
    if (
      errorMessage === 'Cart items are required' ||
      errorMessage === 'Too many cart items' ||
      errorMessage === 'Shipping is not configured. Set STRIPE_SHIPPING_RATE_STANDARD_GB before accepting orders.' ||
      errorMessage.startsWith('Unknown product id:') ||
      errorMessage.startsWith('Invalid quantity for')
    ) {
      return res.status(400).json({ error: errorMessage });
    }

    res.status(500).json({ error: errorMessage });
  }
});

router.get('/catalog', async (req, res) => {
  try {
    const catalog = await catalogService.getPublicCatalog();
    res.json(catalog);
  } catch (error) {
    console.error('Error retrieving Stripe catalog:', error);
    res.status(500).json({ error: error.message || 'Failed to retrieve product catalog' });
  }
});


// Get payment status
router.get('/payment-status/:paymentIntentId', async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const result = await paymentService.getPaymentStatus(paymentIntentId);
    res.json(result);
  } catch (error) {
    console.error('Error retrieving payment:', error);
    res.status(500).json({ error: 'Failed to retrieve payment status' });
  }
});

router.get('/checkout-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return res.status(400).json({ error: 'A valid checkout session ID is required' });
    }

    const result = await paymentService.getCheckoutSessionStatus(sessionId);
    res.json(result);
  } catch (error) {
    if (error?.type === 'StripeInvalidRequestError' && error?.code === 'resource_missing') {
      return res.status(404).json({ error: 'Checkout session not found' });
    }

    console.error('Error retrieving checkout session:', error);
    res.status(500).json({ error: 'Failed to retrieve checkout session' });
  }
});

// Stripe webhook endpoint
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await paymentService.processWebhookEvent(event);
    res.json({received: true});
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({error: 'Webhook processing failed'});
  }
});

module.exports = router;
