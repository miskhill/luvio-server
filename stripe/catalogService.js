const stripe = require('./config');
const { PRODUCT_CATALOG, SHIPPING_RATE_CONFIG } = require('./productCatalog');

const CACHE_TTL_MS = 5 * 60 * 1000;
const SHIPPING_CONFIGURATION_ERROR =
  'Shipping is not configured. Set STRIPE_SHIPPING_RATE_STANDARD_GB before accepting orders.';

let cachedCatalog = null;
let cacheExpiresAt = 0;

function cloneCatalog(catalog) {
  return {
    ...catalog,
    products: catalog.products.map((product) => ({ ...product })),
    shippingOptions: catalog.shippingOptions.map((option) => ({ ...option })),
  };
}

function getStaticProducts() {
  return Object.values(PRODUCT_CATALOG).map((product) => ({
    id: product.id,
    name: product.name,
    color: product.hexColor,
    description: product.description,
    currency: product.currency,
    price: product.unitAmount / 100,
    unitAmount: product.unitAmount,
    metadataColor: product.color,
    stripeProductId: null,
    stripePriceId: null,
  }));
}

async function getStripeManagedProducts() {
  const configuredProducts = Object.values(PRODUCT_CATALOG).map((product) => ({
    ...product,
    stripeProductId: process.env[product.stripeProductEnvVar] || null,
  }));

  if (configuredProducts.every((product) => !product.stripeProductId)) {
    return null;
  }

  const missingConfig = configuredProducts.filter((product) => !product.stripeProductId);
  if (missingConfig.length > 0) {
    const missingEnvVars = missingConfig.map((product) => product.stripeProductEnvVar).join(', ');
    throw new Error(`Stripe product configuration is incomplete. Missing: ${missingEnvVars}`);
  }

  return Promise.all(
    configuredProducts.map(async (product) => {
      const stripeProduct = await stripe.products.retrieve(product.stripeProductId, {
        expand: ['default_price'],
      });

      if (!stripeProduct.active) {
        throw new Error(`Stripe product ${product.id} is inactive`);
      }

      const defaultPrice = stripeProduct.default_price;
      if (!defaultPrice || typeof defaultPrice === 'string') {
        throw new Error(`Stripe product ${product.id} is missing an expanded default price`);
      }

      if (!defaultPrice.active) {
        throw new Error(`Stripe default price for ${product.id} is inactive`);
      }

      if (typeof defaultPrice.unit_amount !== 'number') {
        throw new Error(`Stripe default price for ${product.id} is missing a unit amount`);
      }

      return {
        id: product.id,
        name: stripeProduct.name || product.name,
        color: product.hexColor,
        description: product.description,
        currency: defaultPrice.currency || product.currency,
        price: defaultPrice.unit_amount / 100,
        unitAmount: defaultPrice.unit_amount,
        metadataColor: product.color,
        stripeProductId: stripeProduct.id,
        stripePriceId: defaultPrice.id,
      };
    })
  );
}

async function getConfiguredShippingOptions() {
  const configuredOptions = SHIPPING_RATE_CONFIG.map((option) => ({
    ...option,
    stripeShippingRateId: process.env[option.envVar] || null,
  })).filter((option) => option.stripeShippingRateId);

  if (configuredOptions.length === 0) {
    return [];
  }

  return Promise.all(
    configuredOptions.map(async (option) => {
      const shippingRate = await stripe.shippingRates.retrieve(option.stripeShippingRateId);

      if (!shippingRate.active) {
        throw new Error(`Stripe shipping rate ${option.id} is inactive`);
      }

      if (shippingRate.type !== 'fixed_amount' || !shippingRate.fixed_amount) {
        throw new Error(`Stripe shipping rate ${option.id} must use a fixed amount`);
      }

      return {
        id: option.id,
        displayName: shippingRate.display_name || option.fallbackDisplayName,
        amount: shippingRate.fixed_amount.amount / 100,
        unitAmount: shippingRate.fixed_amount.amount,
        currency: shippingRate.fixed_amount.currency,
        stripeShippingRateId: shippingRate.id,
      };
    })
  );
}

async function fetchCatalog() {
  const stripeProducts = await getStripeManagedProducts();
  const products = stripeProducts || getStaticProducts();
  const shippingOptions = await getConfiguredShippingOptions();
  const checkoutEnabled = shippingOptions.length > 0;

  return {
    pricingSource: stripeProducts ? 'stripe' : 'static',
    products,
    shippingOptions,
    checkoutEnabled,
    checkoutDisabledReason: checkoutEnabled ? null : SHIPPING_CONFIGURATION_ERROR,
  };
}

async function getShopCatalog({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cachedCatalog && cacheExpiresAt > now) {
    return cloneCatalog(cachedCatalog);
  }

  const catalog = await fetchCatalog();
  cachedCatalog = catalog;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cloneCatalog(cachedCatalog);
}

async function getProductForCheckout(productId) {
  const catalog = await getShopCatalog();
  return catalog.products.find((product) => product.id === productId) || null;
}

async function buildCheckoutConfig(cartItems) {
  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Cart items are required');
  }

  const MAX_CART_ITEMS = 25;
  const MAX_QUANTITY_PER_ITEM = 50;

  if (cartItems.length > MAX_CART_ITEMS) {
    throw new Error('Too many cart items');
  }

  const catalog = await getShopCatalog();
  const lineItems = [];

  for (const item of cartItems) {
    const product = catalog.products.find((catalogItem) => catalogItem.id === item?.id);
    if (!product) {
      throw new Error(`Unknown product id: ${item?.id}`);
    }

    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      throw new Error(`Invalid quantity for ${product.id}`);
    }

    if (catalog.pricingSource === 'stripe' && product.stripePriceId) {
      lineItems.push({
        price: product.stripePriceId,
        quantity,
      });
      continue;
    }

    lineItems.push({
      price_data: {
        currency: product.currency,
        product_data: {
          name: product.name,
          metadata: {
            color: product.metadataColor,
            item_id: product.id,
          },
        },
        unit_amount: product.unitAmount,
      },
      quantity,
    });
  }

  const shippingOptions = catalog.shippingOptions.map((option) => ({
    shipping_rate: option.stripeShippingRateId,
  }));

  if (shippingOptions.length === 0) {
    throw new Error(SHIPPING_CONFIGURATION_ERROR);
  }

  return {
    lineItems,
    pricingSource: catalog.pricingSource,
    shippingOptions,
  };
}

async function getPublicCatalog() {
  const catalog = await getShopCatalog();

  return {
    pricingSource: catalog.pricingSource,
    products: catalog.products.map((product) => ({
      id: product.id,
      name: product.name,
      color: product.color,
      description: product.description,
      currency: product.currency,
      price: product.price,
    })),
    shippingOptions: catalog.shippingOptions.map((option) => ({
      id: option.id,
      displayName: option.displayName,
      amount: option.amount,
      currency: option.currency,
    })),
    checkoutEnabled: catalog.checkoutEnabled,
    checkoutDisabledReason: catalog.checkoutDisabledReason,
  };
}

module.exports = {
  buildCheckoutConfig,
  getPublicCatalog,
  getProductForCheckout,
  getShopCatalog,
};
