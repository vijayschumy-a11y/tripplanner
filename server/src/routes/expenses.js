import { Router } from 'express';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { computeBalances, settlements } from '../lib/settle.js';
import { pushToUsers } from '../lib/push.js';

const router = Router();
router.use(requireAuth);

function isMember(tripId, userId) {
  return db.prepare('SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId);
}

// List expenses for a trip (with their shares)
router.get('/trip/:tripId', async (req, res) => {
  if (!(await isMember(req.params.tripId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const expenses = await db
    .prepare(
      `SELECT e.*, u.name AS payer_name, u.avatar_color AS payer_color
       FROM expenses e JOIN users u ON u.id = e.paid_by
       WHERE e.trip_id = ? ORDER BY e.created_at DESC`
    )
    .all(req.params.tripId);
  const shareRows = await db
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
router.post('/trip/:tripId', async (req, res) => {
  const tripId = req.params.tripId;
  if (!(await isMember(tripId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const { title, amount, category, paid_by, split_type = 'equal', participants, shares } = req.body || {};
  if (!title || !amount || !paid_by) return res.status(400).json({ error: 'title, amount, paid_by required' });

  const members = (await db.prepare('SELECT user_id FROM trip_members WHERE trip_id = ?').all(tripId)).map((r) => r.user_id);
  let shareMap = {}; // userId -> amount owed

  if (split_type === 'custom' && shares) {
    const sum = Object.values(shares).reduce((a, b) => a + Number(b || 0), 0);
    if (Math.abs(sum - amount) > 0.05) return res.status(400).json({ error: 'Custom shares must sum to amount' });
    shareMap = shares;
  } else {
    const people = (participants && participants.length ? participants : members).filter((u) => members.includes(u));
    if (!people.length) return res.status(400).json({ error: 'No participants' });
    const each = Math.round((amount / people.length) * 100) / 100;
    let allocated = 0;
    people.forEach((u, i) => {
      const val = i === people.length - 1 ? Math.round((amount - allocated) * 100) / 100 : each;
      allocated += each;
      shareMap[u] = val;
    });
  }

  const id = nanoid();
  try {
    await db.tx(async (t) => {
      await t.prepare(
        'INSERT INTO expenses (id, trip_id, title, category, amount, paid_by, split_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, tripId, title, category || 'general', amount, paid_by, split_type);
      for (const [uid, val] of Object.entries(shareMap)) {
        await t.prepare('INSERT INTO expense_shares (expense_id, user_id, share) VALUES (?, ?, ?)').run(id, uid, Number(val));
      }
    });
  } catch {
    return res.status(500).json({ error: 'Could not save expense' });
  }

  const others = members.filter((m) => m !== req.user.id);
  pushToUsers(others, { title: '💸 New expense', body: `${title} · ${Math.round(amount)} — added by ${req.user.name}`, url: `/trip/${tripId}`, tag: 'exp-' + tripId });

  res.json({ expense: await db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) });
});

router.delete('/:expenseId', async (req, res) => {
  const exp = await db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.expenseId);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  if (!(await isMember(exp.trip_id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  await db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.expenseId);
  res.json({ ok: true });
});

// ---- Advances / kitty ----
router.get('/trip/:tripId/advances', async (req, res) => {
  if (!(await isMember(req.params.tripId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const advances = await db
    .prepare(
      `SELECT a.*, u.name AS collector_name, u.avatar_color AS collector_color,
              (SELECT COUNT(*) FROM advance_participants p WHERE p.advance_id = a.id) AS count
       FROM advances a JOIN users u ON u.id = a.collector_id
       WHERE a.trip_id = ? ORDER BY a.created_at DESC`
    )
    .all(req.params.tripId);
  res.json({ advances });
});

router.post('/trip/:tripId/advances', async (req, res) => {
  const tripId = req.params.tripId;
  if (!(await isMember(tripId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const { collector_id, per_person, category, note, participants } = req.body || {};
  if (!collector_id || !per_person) return res.status(400).json({ error: 'collector_id and per_person required' });
  const members = (await db.prepare('SELECT user_id FROM trip_members WHERE trip_id = ?').all(tripId)).map((r) => r.user_id);
  const people = (participants && participants.length ? participants : members).filter((u) => members.includes(u));
  if (!people.length) return res.status(400).json({ error: 'No participants' });

  const id = nanoid();
  try {
    await db.tx(async (t) => {
      await t.prepare('INSERT INTO advances (id, trip_id, collector_id, per_person, category, note) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, tripId, collector_id, Number(per_person), category || 'general', note ?? null);
      for (const uid of people) {
        await t.prepare('INSERT INTO advance_participants (advance_id, user_id) VALUES (?, ?)').run(id, uid);
      }
    });
  } catch {
    return res.status(500).json({ error: 'Could not save advance' });
  }
  res.json({ advance: await db.prepare('SELECT * FROM advances WHERE id = ?').get(id) });
});

router.delete('/advances/:advanceId', async (req, res) => {
  const adv = await db.prepare('SELECT * FROM advances WHERE id = ?').get(req.params.advanceId);
  if (!adv) return res.status(404).json({ error: 'Not found' });
  if (!(await isMember(adv.trip_id, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  await db.prepare('DELETE FROM advances WHERE id = ?').run(req.params.advanceId);
  res.json({ ok: true });
});

// Balances + who-owes-whom settlement plan (expenses + advances)
router.get('/trip/:tripId/summary', async (req, res) => {
  const tripId = req.params.tripId;
  if (!(await isMember(tripId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const expenses = await db.prepare('SELECT id, amount, paid_by FROM expenses WHERE trip_id = ?').all(tripId);
  const shares = await db
    .prepare('SELECT s.user_id, s.share FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.trip_id = ?')
    .all(tripId);
  const advances = await db.prepare('SELECT id, collector_id, per_person FROM advances WHERE trip_id = ?').all(tripId);
  const advanceParts = await db
    .prepare('SELECT p.advance_id, p.user_id FROM advance_participants p JOIN advances a ON a.id = p.advance_id WHERE a.trip_id = ?')
    .all(tripId);
  const members = await db
    .prepare(`SELECT u.id, u.name, u.avatar_color, u.avatar, u.upi_id FROM trip_members m JOIN users u ON u.id = m.user_id WHERE m.trip_id = ?`)
    .all(tripId);

  const balances = computeBalances(expenses, shares, advances, advanceParts);
  for (const m of members) if (!(m.id in balances)) balances[m.id] = 0;

  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const advancesTotal = advanceParts.reduce((sum, p) => {
    const a = advances.find((x) => x.id === p.advance_id);
    return sum + (a ? Number(a.per_person) : 0);
  }, 0);
  const nameOf = Object.fromEntries(members.map((m) => [m.id, m]));

  res.json({
    total: Math.round(total * 100) / 100,
    perHead: members.length ? Math.round((total / members.length) * 100) / 100 : 0,
    advancesTotal: Math.round(advancesTotal * 100) / 100,
    balances: members.map((m) => ({ ...m, net: balances[m.id] || 0 })),
    settlements: settlements(balances).map((s) => ({
      from: nameOf[s.from],
      to: nameOf[s.to],
      amount: s.amount,
    })),
  });
});

export default router;
