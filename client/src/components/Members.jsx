import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { Avatar, useToast } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

export default function Members({ tripId, trip, members, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = trip.owner_id === user.id;

  const add = async () => {
    if (!email) return;
    setBusy(true);
    try {
      await api.post(`/trips/${tripId}/members`, { email: email.trim() });
      setEmail('');
      onChange();
      toast('Added to trip');
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (uid) => {
    try { await api.del(`/trips/${tripId}/members/${uid}`); onChange(); }
    catch (e) { toast(e.message); }
  };

  return (
    <div className="detail-grid">
      <div className="card">
        <h3 className="section-title">Invite someone</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Add a travel buddy by their registered email. They'll see the trip, expenses and live map.</p>
        <div className="row">
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@email.com" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn primary" onClick={add} disabled={busy}>Add</button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Demo emails: arjun@demo.in, priya@demo.in, karthik@demo.in</p>
      </div>

      <div className="card">
        <h3 className="section-title">People on this trip ({members.length})</h3>
        {members.map((m) => (
          <div key={m.id} className="list-item">
            <Avatar user={m} />
            <div className="grow">
              <strong>{m.name}{m.id === user.id ? ' (you)' : ''}</strong>
              <div className="muted" style={{ fontSize: 13 }}>{m.email}</div>
            </div>
            {m.role === 'owner' ? <span className="pill">Owner ⭐</span>
              : (isOwner || m.id === user.id) && <button className="btn danger sm" onClick={() => remove(m.id)}>Remove</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
