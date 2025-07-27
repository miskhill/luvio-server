const express = require('express');
const stripe = require('./config');
const paymentService = require('./paymentService');

const router = express.Router();

router.post('/create-checkout-session', async (req, res) => {
  try {
    const { cartItems, successUrl, cancelUrl, metadata = {} } = req.body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart items are required' });
    }

    const lineItems = cartItems.map(item => ({
      price_data: {
        currency: 'gbp',
        product_data: {
          name: item.name,
          metadata: {
            color: item.color,
            item_id: item.id
          }
        },
        unit_amount: Math.round(item.price * 100), // Convert to pence
      },
      quantity: item.quantity,
    }));

    const result = await paymentService.createCheckoutSession(
      lineItems,
      successUrl || `${req.headers.origin || process.env.FRONTEND_URL}?payment=success`,
      cancelUrl || `${req.headers.origin || process.env.FRONTEND_URL}?payment=cancelled`,
      metadata
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
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

// Stripe webhook endpoint
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
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
