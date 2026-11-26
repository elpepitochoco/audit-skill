// Resets the working database with demo data.
const { save } = require('../src/db');

save({
  users: [
    { id: 'u1', orgId: 'org-a', role: 'admin', email: 'alice@example.test' },
    { id: 'u2', orgId: 'org-b', role: 'member', email: 'bob@example.test' },
  ],
  invoices: [
    { id: 'f1', orgId: 'org-a', amount: 120 },
    { id: 'f2', orgId: 'org-b', amount: 80 },
  ],
});
console.log('data/app.json reset');
