const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CharityService,
  eligibleBandsForLineItem,
  parseRecordedBandQuantity,
} = require('../stripe/charityService');
const { PaymentService } = require('../stripe/paymentService');

function fakeStripe({ sessionPages, lineItemPages = {} }) {
  return {
    checkout: {
      sessions: {
        async list({ starting_after: startingAfter }) {
          return sessionPages[startingAfter || 'first'];
        },
        async listLineItems(sessionId, { starting_after: startingAfter }) {
          return lineItemPages[`${sessionId}:${startingAfter || 'first'}`];
        },
      },
    },
  };
}

test('reads a server-recorded quantity only from the supported schema', () => {
  assert.equal(
    parseRecordedBandQuantity({
      metadata: { charity_schema_version: '1', charity_eligible_bands: '4' },
    }),
    4
  );
  assert.equal(parseRecordedBandQuantity({ metadata: { charity_eligible_bands: '4' } }), null);
  assert.equal(
    parseRecordedBandQuantity({
      metadata: { charity_schema_version: '1', charity_eligible_bands: '-1' },
    }),
    null
  );
});

test('derives legacy bundle quantities from Stripe product metadata', () => {
  assert.equal(
    eligibleBandsForLineItem(
      {
        quantity: 2,
        price: { product: { id: 'prod_pack', metadata: { item_id: 'band-pack' } } },
      },
      new Map()
    ),
    6
  );
});

test('totals only completed paid sessions and follows pagination', async () => {
  const stripe = fakeStripe({
    sessionPages: {
      first: {
        data: [
          {
            id: 'cs_paid_1',
            payment_status: 'paid',
            created: 100,
            metadata: { charity_schema_version: '1', charity_eligible_bands: '3' },
          },
          {
            id: 'cs_unpaid',
            payment_status: 'unpaid',
            created: 200,
            metadata: { charity_schema_version: '1', charity_eligible_bands: '99' },
          },
        ],
        has_more: true,
      },
      cs_unpaid: {
        data: [
          {
            id: 'cs_paid_2',
            payment_status: 'paid',
            created: 300,
            metadata: { charity_schema_version: '1', charity_eligible_bands: '2' },
          },
        ],
        has_more: false,
      },
    },
  });
  const service = new CharityService(stripe);

  const impact = await service.getPublicImpact();

  assert.equal(impact.eligibleBandsSold, 5);
  assert.equal(impact.totalPledgedPence, 500);
  assert.equal(impact.lastUpdated, new Date(300000).toISOString());
});

test('falls back to legacy line items without double-counting metadata sessions', async () => {
  const stripe = fakeStripe({
    sessionPages: {
      first: {
        data: [
          { id: 'cs_legacy', payment_status: 'paid', created: 100, metadata: {} },
          {
            id: 'cs_current',
            payment_status: 'paid',
            created: 200,
            metadata: { charity_schema_version: '1', charity_eligible_bands: '1' },
          },
        ],
        has_more: false,
      },
    },
    lineItemPages: {
      'cs_legacy:first': {
        data: [
          {
            id: 'li_pack',
            quantity: 1,
            price: { product: { id: 'prod_pack', metadata: { item_id: 'band-pack' } } },
          },
        ],
        has_more: false,
      },
    },
  });
  const service = new CharityService(stripe);

  const impact = await service.getPublicImpact();

  assert.equal(impact.eligibleBandsSold, 4);
  assert.equal(impact.totalPledgedPence, 400);
});

test('replaying a successful webhook never changes the source total', async () => {
  let listCalls = 0;
  const stripe = fakeStripe({
    sessionPages: {
      first: {
        get data() {
          listCalls += 1;
          return [
            {
              id: 'cs_paid',
              payment_status: 'paid',
              created: 100,
              metadata: { charity_schema_version: '1', charity_eligible_bands: '2' },
            },
          ];
        },
        has_more: false,
      },
    },
  });
  const service = new CharityService(stripe, () => 1000);
  const paymentService = new PaymentService(stripe, service);

  const initial = await service.getPublicImpact();
  assert.equal(listCalls, 1);

  const event = {
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_paid', payment_status: 'paid', amount_total: 200 } },
  };
  await paymentService.processWebhookEvent(event);
  await paymentService.processWebhookEvent(event);
  const refreshed = await service.getPublicImpact();
  assert.equal(listCalls, 2);
  assert.equal(initial.totalPledgedPence, 200);
  assert.equal(refreshed.totalPledgedPence, 200);
});

test('does not cache an in-flight calculation invalidated by a webhook', async () => {
  let releaseFirstRequest;
  let listCalls = 0;
  const stripe = {
    checkout: {
      sessions: {
        async list() {
          listCalls += 1;
          if (listCalls === 1) {
            await new Promise((resolve) => {
              releaseFirstRequest = resolve;
            });
          }

          return {
            data: [
              {
                id: 'cs_paid',
                payment_status: 'paid',
                created: 100,
                metadata: {
                  charity_schema_version: '1',
                  charity_eligible_bands: String(listCalls),
                },
              },
            ],
            has_more: false,
          };
        },
      },
    },
  };
  const service = new CharityService(stripe, () => 1000);

  const inFlight = service.getPublicImpact();
  await Promise.resolve();
  service.invalidateCache();
  releaseFirstRequest();
  await inFlight;

  const refreshed = await service.getPublicImpact();
  assert.equal(listCalls, 2);
  assert.equal(refreshed.totalPledgedPence, 200);
});
