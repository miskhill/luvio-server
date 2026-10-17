const stripe = require('./config');
const { PRODUCT_CATALOG } = require('./productCatalog');
const donations = require('../charity/donations.json');

const CONTRIBUTION_PENCE_PER_BAND = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

function parseRecordedBandQuantity(session) {
  if (session?.metadata?.charity_schema_version !== '1') return null;

  const quantity = Number(session.metadata.charity_eligible_bands);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

function getProductId(lineItem) {
  const product = lineItem?.price?.product;
  return typeof product === 'string' ? product : product?.id || null;
}

function getCatalogItemId(lineItem) {
  const product = lineItem?.price?.product;
  return typeof product === 'object' && product !== null
    ? product.metadata?.item_id || null
    : null;
}

function eligibleBandsForLineItem(lineItem, stripeProductIdToCatalogItem) {
  const catalogItemId =
    getCatalogItemId(lineItem) || stripeProductIdToCatalogItem.get(getProductId(lineItem));
  const catalogItem = PRODUCT_CATALOG[catalogItemId];
  const quantity = Number(lineItem?.quantity);

  if (!catalogItem || !Number.isSafeInteger(quantity) || quantity < 1) return 0;
  return catalogItem.eligibleBandQuantity * quantity;
}

function publicDonations() {
  return donations.map(({ period, amountPence, paidAt }) => ({
    period,
    amountPence,
    paidAt,
  }));
}

function cloneImpact(impact) {
  return {
    ...impact,
    donations: impact.donations.map((donation) => ({ ...donation })),
  };
}

class CharityService {
  constructor(stripeClient = stripe, now = () => Date.now()) {
    this.stripe = stripeClient;
    this.now = now;
    this.cachedImpact = null;
    this.cacheExpiresAt = 0;
    this.cacheGeneration = 0;
  }

  invalidateCache() {
    this.cachedImpact = null;
    this.cacheExpiresAt = 0;
    this.cacheGeneration += 1;
  }

  async listAllPaidSessions() {
    const sessions = [];
    let startingAfter;

    do {
      const page = await this.stripe.checkout.sessions.list({
        status: 'complete',
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      sessions.push(...page.data.filter((session) => session.payment_status === 'paid'));
      startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    } while (startingAfter);

    return sessions;
  }

  async countLegacySessionBands(session) {
    const stripeProductIdToCatalogItem = new Map(
      Object.values(PRODUCT_CATALOG)
        .map((product) => [process.env[product.stripeProductEnvVar], product.id])
        .filter(([productId]) => Boolean(productId))
    );
    let total = 0;
    let startingAfter;

    do {
      const page = await this.stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ['data.price.product'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      total += page.data.reduce(
        (sum, item) => sum + eligibleBandsForLineItem(item, stripeProductIdToCatalogItem),
        0
      );
      startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    } while (startingAfter);

    return total;
  }

  async calculateImpact() {
    const paidSessions = await this.listAllPaidSessions();
    let eligibleBandsSold = 0;
    let latestContributionTimestamp = null;

    for (const session of paidSessions) {
      const recordedQuantity = parseRecordedBandQuantity(session);
      const sessionQuantity =
        recordedQuantity === null
          ? await this.countLegacySessionBands(session)
          : recordedQuantity;

      eligibleBandsSold += sessionQuantity;
      if (sessionQuantity > 0 && Number.isFinite(session.created)) {
        latestContributionTimestamp = Math.max(
          latestContributionTimestamp || 0,
          session.created * 1000
        );
      }
    }

    return {
      totalPledgedPence: eligibleBandsSold * CONTRIBUTION_PENCE_PER_BAND,
      currency: 'GBP',
      eligibleBandsSold,
      lastUpdated: latestContributionTimestamp
        ? new Date(latestContributionTimestamp).toISOString()
        : null,
      donations: publicDonations(),
    };
  }

  async getPublicImpact({ forceRefresh = false } = {}) {
    const now = this.now();
    if (!forceRefresh && this.cachedImpact && this.cacheExpiresAt > now) {
      return cloneImpact(this.cachedImpact);
    }

    const generation = this.cacheGeneration;
    const impact = await this.calculateImpact();

    if (generation === this.cacheGeneration) {
      this.cachedImpact = impact;
      this.cacheExpiresAt = now + CACHE_TTL_MS;
    }

    return cloneImpact(impact);
  }
}

const charityService = new CharityService();

module.exports = charityService;
module.exports.CharityService = CharityService;
module.exports.eligibleBandsForLineItem = eligibleBandsForLineItem;
module.exports.parseRecordedBandQuantity = parseRecordedBandQuantity;
