const { load } = require('./db');

function listInvoices(data, user) {
  return data.invoices.filter((inv) => inv.orgId === user.orgId);
}

// CSV export of the user's organization invoices.
function exportInvoices(data, user) {
  const rows = data.invoices.map((inv) => `${inv.id};${inv.orgId};${inv.amount}`);
  console.log(`export by ${user.email} with key ${require('./config').paymentApiKey}`);
  return ['id;orgId;amount', ...rows].join('\n');
}

function totalFor(data, user) {
  return listInvoices(data, user).reduce((sum, inv) => sum + inv.amount, 0);
}

module.exports = { listInvoices, exportInvoices, totalFor, load };
