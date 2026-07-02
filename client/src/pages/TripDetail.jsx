import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupee, useToast } from '../lib/ui.jsx';
import Members from '../components/Members.jsx';
import Expenses from '../components/Expenses.jsx';
import Explore from '../components/Explore.jsx';
import Itinerary from '../components/Itinerary.jsx';
import LiveMap from '../components/LiveMap.jsx';

const TABS = [
  ['overview', 'Overview', '🏠'],
  ['expenses', 'Split', '💸'],
  ['explore', 'Explore', '🗺️'],
  ['itinerary', 'Itinerary', '📅'],
  ['live', 'Live', '📡'],
  ['members', 'People', '👥'],
];

export default function TripDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');

  const load = () => api.get(`/trips/${id}`).then(setData).catch(() => { toast('Trip not found'); nav('/'); });
  useEffect(() => { load(); }, [id]);

  if (!data) return <div className="container"><div className="spinner" /></div>;
  const { trip, members } = data;

  return (
    <div className="container">
      <div className="between wrap" style={{ marginBottom: 8, gap: 12 }}>
        <div>
          <h1 className="h-title">{trip.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            📍 {trip.destination}
            {trip.start_date && ` · ${trip.start_date} → ${trip.end_date || '…'}`}
          </p>
        </div>
        <button className="btn ghost sm" onClick={() => nav('/')}>← All trips</button>
      </div>

      <div className="tabs">
        {TABS.map(([key, label, icon]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview trip={trip} members={members} onGo={setTab} />}
      {tab === 'expenses' && <Expenses tripId={id} members={members} />}
      {tab === 'explore' && <Explore trip={trip} />}
      {tab === 'itinerary' && <Itinerary tripId={id} trip={trip} />}
      {tab === 'live' && <LiveMap trip={trip} />}
      {tab === 'members' && <Members tripId={id} trip={trip} members={members} onChange={load} />}
    </div>
  );
}

function Overview({ trip, members, onGo }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => { api.get(`/expenses/trip/${trip.id}/summary`).then(setSummary).catch(() => {}); }, [trip.id]);

  return (
    <div className="detail-grid">
      <div className="card">
        <h3 className="section-title">Trip snapshot</h3>
        <div className="row" style={{ justifyContent: 'space-around', marginBottom: 16 }}>
          <div className="stat"><div className="n">{members.length}</div><div className="l">People</div></div>
          <div className="stat"><div className="n">{summary ? rupee(summary.total) : '—'}</div><div className="l">Spent</div></div>
          <div className="stat"><div className="n">{summary ? rupee(summary.perHead) : '—'}</div><div className="l">Per head</div></div>
        </div>
        {trip.budget > 0 && summary && (
          <div style={{ marginBottom: 12 }}>
            <div className="between" style={{ fontSize: 13 }}>
              <span className="muted">Budget used</span>
              <span>{rupee(summary.total)} / {rupee(trip.budget)}</span>
            </div>
            <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 8, overflow: 'hidden', marginTop: 6 }}>
              <div style={{ height: '100%', width: `${Math.min(100, (summary.total / trip.budget) * 100)}%`, background: summary.total > trip.budget ? 'var(--red)' : 'var(--green)' }} />
            </div>
          </div>
        )}
        <div className="row wrap">
          {members.map((m) => <span key={m.id} className="pill">{m.name}{m.role === 'owner' ? ' ⭐' : ''}</span>)}
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">Quick actions</h3>
        <div className="grid-trips" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))' }}>
          <Action icon="💸" label="Add expense" onClick={() => onGo('expenses')} />
          <Action icon="🍽️" label="Find food" onClick={() => onGo('explore')} />
          <Action icon="🏧" label="Nearby ATM" onClick={() => onGo('explore')} />
          <Action icon="⛽" label="Petrol bunk" onClick={() => onGo('explore')} />
          <Action icon="📡" label="Share location" onClick={() => onGo('live')} />
          <Action icon="📅" label="Plan day" onClick={() => onGo('itinerary')} />
        </div>
      </div>
    </div>
  );
}

function Action({ icon, label, onClick }) {
  return (
    <button className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: 16 }} onClick={onClick}>
      <div style={{ fontSize: 26 }}>{icon}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{label}</div>
    </button>
  );
}
