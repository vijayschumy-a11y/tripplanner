import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Avatar, Modal, useToast, rupee, CATEGORY_ICON } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

const CATS = ['general', 'food', 'transport', 'stay', 'shopping', 'activity', 'fuel'];
const upiLink = (to, amount) =>
  `upi://pay?pa=${encodeURIComponent(to.upi_id)}&pn=${encodeURIComponent(to.name)}&am=${Math.round(amount * 100) / 100}&cu=INR&tn=${encodeURIComponent('TripPlanner settle-up')}`;

export default function Expenses({ tripId, members }) {
  const { user } = useAuth();
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);

  const load = () => {
    api.get(`/expenses/trip/${tripId}`).then((d) => setExpenses(d.expenses));
    api.get(`/expenses/trip/${tripId}/advances`).then((d) => setAdvances(d.advances));
    api.get(`/expenses/trip/${tripId}/summary`).then(setSummary);
  };
  useEffect(() => { load(); }, [tripId]);

  const del = async (id) => {
    try { await api.del(`/expenses/${id}`); load(); toast('Deleted'); }
    catch (e) { toast(e.message); }
  };

  const delAdvance = async (id) => {
    try { await api.del(`/expenses/advances/${id}`); load(); toast('Advance removed'); }
    catch (e) { toast(e.message); }
  };

  return (
    <div className="detail-grid">
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="between">
            <h3 className="section-title" style={{ margin: 0 }}>Settle up</h3>
            {summary && <span className="muted">{rupee(summary.total)} spent{summary.advancesTotal > 0 ? ` · ${rupee(summary.advancesTotal)} kitty` : ''}</span>}
          </div>
          {summary && (
            <>
              <div style={{ margin: '12px 0' }}>
                {summary.balances.map((b) => (
                  <div key={b.id} className="between" style={{ padding: '5px 0' }}>
                    <span className="row" style={{ alignItems: 'center' }}><Avatar user={b} size={26} /> <span style={{ alignSelf: 'center' }}>{b.name}</span></span>
                    <span className={b.net >= 0 ? 'balance-pos' : 'balance-neg'}>
                      {b.net >= 0 ? 'gets ' : 'owes '}{rupee(Math.abs(b.net))}
                    </span>
                  </div>
                ))}
              </div>
              {summary.settlements.length > 0 && (
                <>
                  <h3 className="section-title">Who pays whom</h3>
                  {summary.settlements.map((s, i) => (
                    <div key={i} className="list-item" style={{ fontSize: 14 }}>
                      <div className="grow">
                        <strong>{s.from.name}</strong> → <strong>{s.to.name}</strong>
                        <span className="balance-neg" style={{ marginLeft: 8 }}>{rupee(s.amount)}</span>
                      </div>
                      {s.from.id === user.id && s.to.upi_id && (
                        <a className="btn primary sm" href={upiLink(s.to, s.amount)}>Pay ₹{Math.round(s.amount)}</a>
                      )}
                    </div>
                  ))}
                </>
              )}
              {summary.settlements.length === 0 && <p className="muted">All settled up 🎉</p>}
            </>
          )}
        </div>

        <div className="card">
          <div className="between">
            <h3 className="section-title" style={{ margin: 0 }}>Advances / kitty 💰</h3>
            <button className="btn primary sm" onClick={() => setShowAdvance(true)}>+ Collect advance</button>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Money collected up front (e.g. ₹3000/head for food & stay). Credited to each person in the settle-up.</p>
          {advances.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No advances collected yet.</p>}
          {advances.map((a) => (
            <div key={a.id} className="list-item">
              <div className="avatar" style={{ background: 'var(--surface)' }}>{CATEGORY_ICON[a.category] || '💰'}</div>
              <div className="grow">
                <strong>{rupee(a.per_person)} × {a.count} people</strong>
                <div className="muted" style={{ fontSize: 13 }}>collected by {a.collector_name}{a.note ? ` · ${a.note}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>{rupee(a.per_person * a.count)}</strong>
                <div><button className="btn danger sm" style={{ marginTop: 4 }} onClick={() => delAdvance(a.id)}>✕</button></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="between" style={{ marginBottom: 12 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Expenses</h3>
          <button className="btn primary sm" onClick={() => setShowAdd(true)}>+ Add expense</button>
        </div>
        {expenses.length === 0 && <div className="card"><p className="muted">No expenses yet. Add the first one.</p></div>}
        {expenses.map((e) => (
          <div key={e.id} className="list-item">
            <div className="avatar" style={{ background: 'var(--surface)' }}>{CATEGORY_ICON[e.category] || '💳'}</div>
            <div className="grow">
              <strong>{e.title}</strong>
              <div className="muted" style={{ fontSize: 13 }}>
                {e.payer_name} paid · split {e.split_type} · {e.shares.length} people
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong>{rupee(e.amount)}</strong>
              <div><button className="btn danger sm" style={{ marginTop: 4 }} onClick={() => del(e.id)}>✕</button></div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddExpense tripId={tripId} members={members} me={user}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); toast('Expense added'); }} />
      )}
      {showAdvance && (
        <AddAdvance tripId={tripId} members={members} me={user}
          onClose={() => setShowAdvance(false)}
          onSaved={() => { setShowAdvance(false); load(); toast('Advance recorded'); }} />
      )}
    </div>
  );
}

function AddAdvance({ tripId, members, me, onClose, onSaved }) {
  const toast = useToast();
  const [collector, setCollector] = useState(me.id);
  const [perPerson, setPerPerson] = useState('');
  const [category, setCategory] = useState('stay');
  const [note, setNote] = useState('');
  const [participants, setParticipants] = useState(members.map((m) => m.id));
  const [busy, setBusy] = useState(false);

  const toggle = (id) => setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    const per = Number(perPerson);
    if (!per) return toast('Enter an amount per person');
    if (!participants.length) return toast('Pick at least one person');
    setBusy(true);
    try {
      await api.post(`/expenses/trip/${tripId}/advances`, {
        collector_id: collector, per_person: per, category, note, participants,
      });
      onSaved();
    } catch (e) { toast(e.message); setBusy(false); }
  };

  const total = (Number(perPerson) || 0) * participants.length;

  return (
    <Modal title="Collect an advance" onClose={onClose}>
      <div className="row">
        <div className="field grow"><label>Collected by</label>
          <select value={collector} onChange={(e) => setCollector(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
        <div className="field grow"><label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {['stay', 'food', 'transport', 'general'].map((c) => <option key={c} value={c}>{CATEGORY_ICON[c]} {c}</option>)}
          </select></div>
      </div>
      <div className="field"><label>Amount per person (₹)</label>
        <input className="input" type="number" value={perPerson} onChange={(e) => setPerPerson(e.target.value)} placeholder="3000" /></div>
      <div className="field"><label>Note (optional)</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Advance for food & stay" /></div>
      <div className="field"><label>Collected from</label>
        {members.map((m) => (
          <label key={m.id} className="list-item" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={participants.includes(m.id)} onChange={() => toggle(m.id)} style={{ width: 'auto' }} />
            <span className="grow">{m.name}</span>
            {participants.includes(m.id) && <span className="muted">{rupee(Number(perPerson) || 0)}</span>}
          </label>
        ))}
      </div>
      <button className="btn primary" style={{ width: '100%' }} onClick={save} disabled={busy}>
        {busy ? 'Saving…' : `Record ${rupee(total)} advance`}
      </button>
    </Modal>
  );
}

function AddExpense({ tripId, members, me, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', amount: '', category: 'general', paid_by: me.id, split_type: 'equal' });
  const [participants, setParticipants] = useState(members.map((m) => m.id));
  const [customShares, setCustomShares] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const toggle = (id) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.title || !amount) return toast('Title and amount required');
    setBusy(true);
    try {
      const body = { ...form, amount };
      if (form.split_type === 'custom') {
        body.shares = Object.fromEntries(Object.entries(customShares).map(([k, v]) => [k, Number(v) || 0]));
      } else {
        body.participants = participants;
      }
      await api.post(`/expenses/trip/${tripId}`, body);
      onSaved();
    } catch (e) { toast(e.message); setBusy(false); }
  };

  const eachEqual = participants.length ? (Number(form.amount) / participants.length || 0) : 0;

  return (
    <Modal title="Add expense" onClose={onClose}>
      <div className="field"><label>What for?</label>
        <input className="input" value={form.title} onChange={set('title')} placeholder="Lunch at Saravana Bhavan" /></div>
      <div className="row">
        <div className="field grow"><label>Amount (₹)</label>
          <input className="input" type="number" value={form.amount} onChange={set('amount')} placeholder="1200" /></div>
        <div className="field grow"><label>Category</label>
          <select value={form.category} onChange={set('category')}>
            {CATS.map((c) => <option key={c} value={c}>{CATEGORY_ICON[c]} {c}</option>)}
          </select></div>
      </div>
      <div className="field"><label>Paid by</label>
        <select value={form.paid_by} onChange={set('paid_by')}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select></div>

      <div className="field"><label>Split</label>
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {['equal', 'custom'].map((s) => (
            <div key={s} className={`chip ${form.split_type === s ? 'active' : ''}`} onClick={() => setForm({ ...form, split_type: s })}>
              {s === 'equal' ? 'Split equally' : 'Custom amounts'}
            </div>
          ))}
        </div>

        {form.split_type === 'equal' ? (
          <div>
            {members.map((m) => (
              <label key={m.id} className="list-item" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={participants.includes(m.id)} onChange={() => toggle(m.id)} style={{ width: 'auto' }} />
                <span className="grow">{m.name}</span>
                {participants.includes(m.id) && <span className="muted">{rupee(eachEqual)}</span>}
              </label>
            ))}
          </div>
        ) : (
          <div>
            {members.map((m) => (
              <div key={m.id} className="list-item">
                <span className="grow">{m.name}</span>
                <input className="input" style={{ width: 110 }} type="number" placeholder="0"
                  value={customShares[m.id] || ''} onChange={(e) => setCustomShares({ ...customShares, [m.id]: e.target.value })} />
              </div>
            ))}
            <p className="muted" style={{ fontSize: 12 }}>
              Must add up to {rupee(Number(form.amount) || 0)} · currently {rupee(Object.values(customShares).reduce((a, b) => a + Number(b || 0), 0))}
            </p>
          </div>
        )}
      </div>

      <button className="btn primary" style={{ width: '100%' }} onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save expense'}
      </button>
    </Modal>
  );
}
