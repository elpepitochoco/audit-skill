const test = require('node:test');
const assert = require('node:assert');
const { listInvoices, totalFor } = require('../src/billing');

const data = {
  invoices: [
    { id: 'f1', orgId: 'org-a', amount: 120 },
    { id: 'f2', orgId: 'org-b', amount: 80 },
  ],
};
const alice = { id: 'u1', orgId: 'org-a', email: 'alice@example.test' };

test('listInvoices only returns the organization invoices', () => {
  assert.deepStrictEqual(listInvoices(data, alice).map((i) => i.id), ['f1']);
});

test('totalFor sums the organization invoices', () => {
  assert.strictEqual(totalFor(data, alice), 120);
});
