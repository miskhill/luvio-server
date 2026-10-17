const test = require('node:test');
const assert = require('node:assert/strict');

const catalogService = require('../stripe/catalogService');

test('calculates one eligible band for each single-band item', () => {
  const quantity = catalogService.calculateEligibleBandQuantity([
    { id: 'red-band', quantity: 1 },
    { id: 'yellow-band', quantity: 2 },
  ]);

  assert.equal(quantity, 3);
});

test('calculates three eligible bands for every band pack', () => {
  const quantity = catalogService.calculateEligibleBandQuantity([
    { id: 'band-pack', quantity: 2 },
  ]);

  assert.equal(quantity, 6);
});
