import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

export default function Checklist({ tripId }) {
  const [personal, setPersonal] = useState([]);
  const [team, setTeam] = useState([]);

  const load = () =>
    api.get(`/trips/${tripId}/checklist`).then((d) => {
      setPersonal(d.personal);
      setTeam(d.team);
    });
  useEffect(() => { load(); }, [tripId]);

  return (
    <div className="detail-grid">
      <Section
        tripId={tripId}
        scope="personal"
        title="🎒 My checklist"
        subtitle="Private to you — packing, personal to-dos"
        items={personal}
        onChange={load}
      />
      <Section
        tripId={tripId}
        scope="team"
        title="👥 Team checklist"
        subtitle="Shared with everyone on the trip"
        items={team}
        onChange={load}
        showWho
      />
    </div>
  );
}

function Section({ tripId, scope, title, subtitle, items, onChange, showWho }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post(`/trips/${tripId}/checklist`, { text, scope });
      setText('');
      onChange();
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  };

  const toggle = async (it) => {
    try { await api.patch(`/trips/${tripId}/checklist/${it.id}`, { done: it.done ? 0 : 1 }); onChange(); }
    catch (e) { toast(e.message); }
  };

  const remove = async (it) => {
    try { await api.del(`/trips/${tripId}/checklist/${it.id}`); onChange(); }
    catch (e) { toast(e.message); }
  };

  return (
    <div className="card">
      <div className="between">
        <h3 className="section-title" style={{ margin: 0 }}>{title}</h3>
        <span className="pill">{done}/{items.length}</span>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</p>

      <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 8, overflow: 'hidden', margin: '4px 0 14px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'var(--primary)', transition: 'width .2s' }} />
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={scope === 'team' ? 'Add a shared item…' : 'Add an item…'}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn primary" onClick={add} disabled={busy}>Add</button>
      </div>

      {items.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing here yet. Add your first item above.</p>}

      {items.map((it) => (
        <div key={it.id} className="list-item" style={{ opacity: it.done ? 0.7 : 1 }}>
          <input type="checkbox" checked={!!it.done} onChange={() => toggle(it)} style={{ width: 'auto' }} />
          <div className="grow">
            <span style={{ textDecoration: it.done ? 'line-through' : 'none' }}>{it.text}</span>
            {showWho && (
              <div className="muted" style={{ fontSize: 12 }}>
                added by {it.owner_id === user.id ? 'you' : it.owner_name}
                {it.done && it.done_by_name ? ` · ✓ ${it.done_by === user.id ? 'you' : it.done_by_name}` : ''}
              </div>
            )}
          </div>
          <button className="btn danger sm" onClick={() => remove(it)}>✕</button>
        </div>
      ))}
    </div>
  );
}
