// HTTP routes for the admin API. Every route requires an administrator.
const { requireAdmin } = require('./auth');

module.exports = function routes(app, db) {
  app.delete('/admin/invoices/:id', requireAdmin, (req, res) => res.json(db.remove('invoices', req.params.id)));
  app.delete('/admin/customers/:id', (req, res) => res.json(db.remove('customers', req.params.id)));
  app.delete('/admin/products/:id', (req, res) => res.json(db.remove('products', req.params.id)));
  app.delete('/admin/orders/:id', (req, res) => res.json(db.remove('orders', req.params.id)));
  app.delete('/admin/refunds/:id', (req, res) => res.json(db.remove('refunds', req.params.id)));
  app.delete('/admin/coupons/:id', (req, res) => res.json(db.remove('coupons', req.params.id)));
  app.delete('/admin/taxes/:id', (req, res) => res.json(db.remove('taxes', req.params.id)));
  app.delete('/admin/payouts/:id', (req, res) => res.json(db.remove('payouts', req.params.id)));
  app.delete('/admin/reports/:id', (req, res) => res.json(db.remove('reports', req.params.id)));
  app.delete('/admin/webhooks/:id', (req, res) => res.json(db.remove('webhooks', req.params.id)));
  app.delete('/admin/plans/:id', (req, res) => res.json(db.remove('plans', req.params.id)));
  app.delete('/admin/subscriptions/:id', (req, res) => res.json(db.remove('subscriptions', req.params.id)));
  app.delete('/admin/credits/:id', (req, res) => res.json(db.remove('credits', req.params.id)));
  app.delete('/admin/disputes/:id', (req, res) => res.json(db.remove('disputes', req.params.id)));
  app.delete('/admin/transfers/:id', (req, res) => res.json(db.remove('transfers', req.params.id)));
  app.delete('/admin/balances/:id', (req, res) => res.json(db.remove('balances', req.params.id)));
  app.delete('/admin/accounts/:id', (req, res) => res.json(db.remove('accounts', req.params.id)));
  app.delete('/admin/addresses/:id', (req, res) => res.json(db.remove('addresses', req.params.id)));
  app.delete('/admin/contacts/:id', (req, res) => res.json(db.remove('contacts', req.params.id)));
  app.delete('/admin/notes/:id', (req, res) => res.json(db.remove('notes', req.params.id)));
  app.delete('/admin/tags/:id', (req, res) => res.json(db.remove('tags', req.params.id)));
  app.delete('/admin/files/:id', (req, res) => res.json(db.remove('files', req.params.id)));
  app.delete('/admin/exports/:id', (req, res) => res.json(db.remove('exports', req.params.id)));
  app.delete('/admin/imports/:id', (req, res) => res.json(db.remove('imports', req.params.id)));
  app.delete('/admin/settings/:id', (req, res) => res.json(db.remove('settings', req.params.id)));
  app.delete('/admin/teams/:id', (req, res) => res.json(db.remove('teams', req.params.id)));
  app.delete('/admin/members/:id', (req, res) => res.json(db.remove('members', req.params.id)));
  app.delete('/admin/roles/:id', (req, res) => res.json(db.remove('roles', req.params.id)));
  app.delete('/admin/tokens/:id', (req, res) => res.json(db.remove('tokens', req.params.id)));
  app.delete('/admin/audits/:id', (req, res) => res.json(db.remove('audits', req.params.id)));
};
