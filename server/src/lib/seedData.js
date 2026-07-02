// Reusable demo seeding. Safe to call on every boot — it only writes when the DB is empty.
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db from '../db.js';

const DEMO = [
  { name: 'Arjun', email: 'arjun@demo.in', color: '#2563eb' },
  { name: 'Priya', email: 'priya@demo.in', color: '#dc2626' },
  { name: 'Karthik', email: 'karthik@demo.in', color: '#16a34a' },
];

export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return { seeded: false };

  const password = bcrypt.hashSync('password', 10);
  const ids = DEMO.map((d) => {
    const id = nanoid();
    db.prepare('INSERT INTO users (id, name, email, password, avatar_color) VALUES (?, ?, ?, ?, ?)')
      .run(id, d.name, d.email, password, d.color);
    return id;
  });

  const tripId = nanoid();
  db.prepare(
    `INSERT INTO trips (id, name, destination, lat, lng, start_date, end_date, budget, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(tripId, 'Ooty Long Weekend', 'Ooty, Tamil Nadu', 11.4102, 76.695, '2026-08-15', '2026-08-18', 40000, ids[0]);
  ids.forEach((id, i) =>
    db.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)')
      .run(tripId, id, i === 0 ? 'owner' : 'member')
  );

  const mkExpense = (title, amount, payer, cat) => {
    const eid = nanoid();
    db.prepare('INSERT INTO expenses (id, trip_id, title, category, amount, paid_by, split_type) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(eid, tripId, title, cat, amount, payer, 'equal');
    const each = Math.round((amount / ids.length) * 100) / 100;
    ids.forEach((id) => db.prepare('INSERT INTO expense_shares (expense_id, user_id, share) VALUES (?, ?, ?)').run(eid, id, each));
  };
  mkExpense('Cab Chennai → Ooty', 9000, ids[0], 'transport');
  mkExpense('Homestay (2 nights)', 12000, ids[1], 'stay');
  mkExpense('Dinner at Earl Secret', 2400, ids[2], 'food');

  const mkItin = (day, time, title, note) =>
    db.prepare('INSERT INTO itinerary (id, trip_id, day, time, title, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nanoid(), tripId, day, time, title, note);
  mkItin('2026-08-15', '09:00', 'Drive to Ooty', 'Breakfast stop at Mettupalayam');
  mkItin('2026-08-15', '16:00', 'Ooty Lake boating', null);
  mkItin('2026-08-16', '08:00', 'Nilgiri Mountain Railway', 'Book toy train tickets early');
  mkItin('2026-08-16', '13:00', 'Botanical Garden', null);

  return { seeded: true, tripId };
}
