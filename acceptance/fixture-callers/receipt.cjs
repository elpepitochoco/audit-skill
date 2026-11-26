'use strict';

const { formatPrice: displayPrice } = require('./format-price.cjs');

function receiptRow(record) {
  return [record.label, displayPrice(record.amountCents)];
}

module.exports = { receiptRow };
