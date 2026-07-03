import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { Avatar, useToast } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

const ROLE_BADGE = { owner: 'Owner ⭐', 'sub-admin': 'Sub-admin 🛡️' };

export default function Members({ tripId, trip, members, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const [friendPhone, setFriendPhone] = useState('');
  const isOwner = trip.owner_id === user.id;
  const myRole = members.find((m) => m.id === user.id)?.role;
  const isAdmin = myRole === 'owner' || myRole === 'sub-admin';

  const inviteLink = `${window.location.origin}/join/${trip.invite_code}`;
  const inviteMsg = `You're invited to "${trip.name}" on TripPlanner 🧭\nTap to join: ${inviteLink}`;
  const shareWhatsApp = (to) =>
    window.open(`https://wa.me/${(to || '').replace(/\D/g, '')}?text=${encodeURIComponent(inviteMsg)}`, '_blank');
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteLink); toast('Invite link copied'); }
    catch { toast('Copy failed — long-press the link'); }
  };

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

  const setRole = async (uid, role) => {
    try {
      await api.patch(`/trips/${tripId}/members/${uid}/role`, { role });
      onChange();
      toast(role === 'sub-admin' ? 'Made sub-admin 🛡️' : 'Role removed');
    } catch (e) { toast(e.message); }
  };

  return (
    <div className="detail-grid">
      <div className="card">
        <h3 className="section-title">Invite someone</h3>
        {isAdmin ? (
          <>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Send an invite link — friends can join even before they've signed up.</p>
            <button className="btn primary" style={{ width: '100%', background: '#25D366', borderColor: 'transparent' }} onClick={() => shareWhatsApp()}>
              💬 Invite on WhatsApp
            </button>
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input" type="tel" value={friendPhone} onChange={(e) => setFriendPhone(e.target.value)} placeholder="Friend's number (optional)" />
              <button className="btn" onClick={() => shareWhatsApp(friendPhone)} disabled={!friendPhone.trim()}>Send</button>
            </div>
            <button className="btn ghost sm" style={{ width: '100%', marginTop: 8 }} onClick={copyLink}>🔗 Copy invite link</button>

            <h3 className="section-title" style={{ marginTop: 18 }}>Or add a registered user</h3>
            <div className="row">
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@email.com" onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="btn" onClick={add} disabled={busy}>Add</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Demo emails: arjun@demo.in, priya@demo.in, karthik@demo.in</p>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>Only the owner or a sub-admin can add or manage people.</p>
        )}
        {isOwner && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            🛡️ Tip: make a trusted member a <strong>sub-admin</strong> so they can add people and manage the trip with you.
          </p>
        )}
      </div>

      <div className="card">
        <h3 className="section-title">People on this trip ({members.length})</h3>
        {members.map((m) => (
          <div key={m.id} className="list-item">
            <Avatar user={m} />
            <div className="grow">
              <strong>{m.name}{m.id === user.id ? ' (you)' : ''}</strong>
              <div className="muted" style={{ fontSize: 13 }}>{m.email || m.phone || ''}</div>
            </div>
            {ROLE_BADGE[m.role] && <span className="pill">{ROLE_BADGE[m.role]}</span>}
            {/* Owner can promote/demote non-owner members */}
            {isOwner && m.role !== 'owner' && (
              m.role === 'sub-admin'
                ? <button className="btn sm" onClick={() => setRole(m.id, 'member')}>Remove admin</button>
                : <button className="btn sm" onClick={() => setRole(m.id, 'sub-admin')}>Make sub-admin</button>
            )}
            {m.role !== 'owner' && (isAdmin || m.id === user.id) && (
              <button className="btn danger sm" onClick={() => remove(m.id)}>Remove</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
