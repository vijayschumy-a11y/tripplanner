import { Router } from 'express';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { computeBalances, settlements } from '../lib/settle.js';

const router = Router();
router.use(requireAuth);

function isMember(tripId, userId) {
  return db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId);
}

// List expenses for a trip (with their shares)
router.get('/trip/:tripId', (req, res) => {
  if (!isMember(req.params.tripId, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  const expenses = db
    .prepare(
      `SELECT e.*, u.name AS payer_name, u.avatar_color AS payer_color
       FROM expenses e JOIN users u ON u.id = e.paid_by
       WHERE e.trip_id = ? ORDER BY e.created_at DESC`
    )
    .all(req.params.tripId);
  const shareRows = db
    .prepare(
      `SELECT s.* FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ?`
    )
    .all(req.params.tripId);
  const byExpense = {};
  for (const s of shareRows) (byExpense[s.expense_id] ||= []).push(s);
  for (const e of expenses) e.shares = byExpense[e.id] || [];
  res.json({ expenses });
});

// Create expense with split
router.post('/trip/:tripId', (req, res) => {
  const tripId = req.params.tripId;
  if (!isMember(tripId, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  const { title, amount, category, paid_by, split_type = 'equal', participants, shares } = req.body || {};
  if (!title || !amount || !paid_by) return res.status(400).json({ error: 'title, amount, paid_by required' });

  const members = db.prepare('SELECT user_id FROM trip_members WHERE trip_id = ?').all(tripId).map((r) => r.user_id);
  let shareMap = {}; // userId -> amount owed

  if (split_type === 'custom' && shares) {
    // shares: { userId: amount }
    const sum = Object.values(shares).reduce((a, b) => a + Number(b || 0), 0);
    if (Math.abs(sum - amount) > 0.05) return res.status(400).json({ error: 'Custom shares must sum to amount' });
    shareMap = shares;
  } else {
    const people = (participants && participants.length ? participants : members).filter((u) => members.includes(u));
    const each = Math.round((amount / people.length) * 100) / 100;
    let allocated = 0;
    people.forEach((u, i) => {
      const val = i === people.length - 1 ? Math.round((amount - allocated) * 100) / 100 : each;
      allocated += each;
      shareMap[u] = val;
    });
  }

  const id = nanoid();
  const insertExpense = db.prepare(
    'INSERT INTO expenses (id, trip_id, title, category, amount, paid_by, split_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertShare = db.prepare('INSERT INTO expense_shares (expense_id, user_id, share) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    insertExpense.run(id, tripId, title, category || 'general', amount, paid_by, split_type);
    for (const [uid, val] of Object.entries(shareMap)) insertShare.run(id, uid, Number(val));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'Could not save expense' });
  }

  res.json({ expense: db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) });
});

router.delete('/:expenseId', (req, res) => {
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.expenseId);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  if (!isMember(exp.trip_id, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.expenseId);
  res.json({ ok: true });
});

// Balances + who-owes-whom settlement plan
router.get('/trip/:tripId/summary', (req, res) => {
  const tripId = req.params.tripId;
  if (!isMember(tripId, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  const expenses = db.prepare('SELECT id, amount, paid_by FROM expenses WHERE trip_id = ?').all(tripId);
  const shares = db
    .prepare('SELECT s.user_id, s.share FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ?')
    .all(tripId);
  const members = db
    .prepare(`SELECT u.id, u.name, u.avatar_color FROM trip_members m JOIN users u ON u.id = m.user_id WHERE m.trip_id = ?`)
    .all(tripId);

  const balances = computeBalances(expenses, shares);
  for (const m of members) if (!(m.id in balances)) balances[m.id] = 0;

  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const nameOf = Object.fromEntries(members.map((m) => [m.id, m]));

  res.json({
    total: Math.round(total * 100) / 100,
    perHead: members.length ? Math.round((total / members.length) * 100) / 100 : 0,
    balances: members.map((m) => ({ ...m, net: balances[m.id] || 0 })),
    settlements: settlements(balances).map((s) => ({
      from: nameOf[s.from],
      to: nameOf[s.to],
      amount: s.amount,
    })),
  });
});

export default router;
