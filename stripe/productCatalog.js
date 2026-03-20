const PRODUCT_CATALOG = Object.freeze({
  'red-band': {
    id: 'red-band',
    name: 'Red Wristband',
    color: 'red',
    hexColor: '#e74c3c',
    description: 'Not looking for a relationship. Please don\'t approach.',
    currency: 'gbp',
    unitAmount: 200,
    stripeProductEnvVar: 'STRIPE_PRODUCT_ID_RED_BAND',
  },
  'yellow-band': {
    id: 'yellow-band',
    name: 'Yellow Wristband',
    color: 'yellow',
    hexColor: '#f1c40f',
    description: 'Might be open..., but I\'ll make the first move.',
    currency: 'gbp',
    unitAmount: 200,
    stripeProductEnvVar: 'STRIPE_PRODUCT_ID_YELLOW_BAND',
  },
  'green-band': {
    id: 'green-band',
    name: 'Green Wristband',
    color: 'green',
    hexColor: '#2ecc71',
    description: 'Open to connection. Feel free to come say hello.',
    currency: 'gbp',
    unitAmount: 200,
    stripeProductEnvVar: 'STRIPE_PRODUCT_ID_GREEN_BAND',
  },
  'band-pack': {
    id: 'band-pack',
    name: 'Luvio Band Pack',
    color: 'pack',
    hexColor: 'linear-gradient(to right, #e74c3c, #f1c40f, #2ecc71)',
    description: 'Get all three bands at a discounted price!',
    currency: 'gbp',
    unitAmount: 500,
    stripeProductEnvVar: 'STRIPE_PRODUCT_ID_BAND_PACK',
  },
});

const SHIPPING_RATE_CONFIG = Object.freeze([
  {
    id: 'standard-gb',
    envVar: 'STRIPE_SHIPPING_RATE_STANDARD_GB',
    fallbackDisplayName: 'Postage and packaging',
  },
]);

module.exports = {
  PRODUCT_CATALOG,
  SHIPPING_RATE_CONFIG,
};
