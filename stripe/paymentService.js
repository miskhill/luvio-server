const stripe = require('./config');

class PaymentService {
  /**
   * Create a checkout session for hosted Stripe checkout
   * @param {Array} lineItems - Array of line items for the checkout
   * @param {string} successUrl - URL to redirect to after successful payment
   * @param {string} cancelUrl - URL to redirect to if payment is cancelled
   * @param {object} metadata - Additional metadata for the payment
   * @returns {Promise<object>} Checkout session with URL
   */
  async createCheckoutSession(lineItems, successUrl, cancelUrl, metadata = {}) {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['GB'], // UK only currently this might change in the future
      },
    });

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
   * Process webhook event
   * @param {object} event - Stripe webhook event
   * @returns {Promise<void>}
   */
  async processWebhookEvent(event) {
    switch (event.type) {
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
