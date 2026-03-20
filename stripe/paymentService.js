const stripe = require('./config');

class PaymentService {
  /**
   * Create a checkout session for hosted Stripe checkout
   * @param {Array} lineItems - Array of line items for the checkout
   * @param {string} successUrl - URL to redirect to after successful payment
   * @param {string} cancelUrl - URL to redirect to if payment is cancelled
   * @param {object} metadata - Additional metadata for the payment
   * @param {object} options - Additional checkout session options
   * @returns {Promise<object>} Checkout session with URL
   */
  async createCheckoutSession(lineItems, successUrl, cancelUrl, metadata = {}, options = {}) {
    const basePayload = {
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['GB'], // UK only currently this might change in the future
      },
    };

    if (Array.isArray(options.shippingOptions) && options.shippingOptions.length > 0) {
      basePayload.shipping_options = options.shippingOptions;
    }

    let session;
    try {
      // Let Stripe choose the best set of enabled payment methods for this Checkout Session.
      session = await stripe.checkout.sessions.create({
        ...basePayload,
        automatic_payment_methods: { enabled: true },
      });
    } catch (error) {
      // Backwards-compatible fallback if the account/API config doesn't support automatic payment methods.
      session = await stripe.checkout.sessions.create({
        ...basePayload,
        payment_method_types: ['card'],
      });
    }

    return {
      sessionId: session.id,
      url: session.url
    };
  }



  /**
   * Get payment status by payment intent ID
   * @param {string} paymentIntentId - The payment intent ID
   * @returns {Promise<object>} Payment status information
   */
  async getPaymentStatus(paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    return {
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      created: new Date(paymentIntent.created * 1000).toISOString()
    };
  }

  /**
   * Get checkout session status by checkout session ID
   * @param {string} sessionId - The checkout session ID
   * @returns {Promise<object>} Checkout session status information
   */
  async getCheckoutSessionStatus(sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details'],
    });

    return {
      sessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: typeof session.amount_total === 'number' ? session.amount_total / 100 : null,
      currency: session.currency || null,
      customerEmail: session.customer_details?.email || session.customer_email || null,
      created: new Date(session.created * 1000).toISOString(),
      verifiedPaid: session.payment_status === 'paid' && session.status === 'complete',
    };
  }

  /**
   * Process webhook event
   * @param {object} event - Stripe webhook event
   * @returns {Promise<void>}
   */
  async processWebhookEvent(event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('Checkout session completed:', session.id);
        await this.handleCompletedCheckoutSession(session);
        break;
      }

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('Payment succeeded:', paymentIntent.id);
        await this.handleSuccessfulPayment(paymentIntent);
        break;
        
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('Payment failed:', failedPayment.id);
        await this.handleFailedPayment(failedPayment);
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  }

  async handleCompletedCheckoutSession(session) {
    const amountTotal = typeof session.amount_total === 'number' ? session.amount_total / 100 : null;
    console.log(
      `Processing completed checkout session: ${session.id} (payment_status=${session.payment_status}, amount_total=${amountTotal ?? 'n/a'})`
    );
  }

  /**
   * Handle successful payment
   * @param {object} paymentIntent - The successful payment intent
   */
  async handleSuccessfulPayment(paymentIntent) {
    // TODO: If we scale we could add the following
    // - Update database records
    // - Send confirmation emails
    // - Fulfill orders
    // - Update user accounts
    // - Better logging
    console.log(`Processing successful payment: ${paymentIntent.id} for $${paymentIntent.amount / 100}`);
  }

  /**
   * Handle failed payment  
   * @param {object} paymentIntent - The failed payment intent
   */
  async handleFailedPayment(paymentIntent) {
    // TODO: If we scale we could add the following
    // - Update database records
    // - Send confirmation emails
    // - Fulfill orders
    // - Update user accounts
    // - Better logging
    // - Log failure reasons
    // - Update payment status in database
    // - Send failure emails
    console.log(`Processing failed payment: ${paymentIntent.id}`);
  }
}

module.exports = new PaymentService();
