'use strict';

const { formatPrice } = require('./format-price.cjs');

function checkoutTotal(order) {
  if (!Number.isFinite(order.totalCents)) {
    throw new Error('Checkout requires a total price.');
  }
  return formatPrice(order.totalCents);
}

module.exports = { checkoutTotal };
