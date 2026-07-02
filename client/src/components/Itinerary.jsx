import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/ui.jsx';

export default function Itinerary({ tripId, trip }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ day: trip.start_date || '', time: '', title: '', note: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = () => api.get(`/trips/${tripId}/itinerary`).then((d) => setItems(d.items));
  useEffect(() => { load(); }, [tripId]);

  const add = async () => {
    if (!form.day || !form.title) return toast('Pick a day and title');
    try {
      await api.post(`/trips/${tripId}/itinerary`, form);
      setForm({ ...form, time: '', title: '', note: '' });
      load();
    } catch (e) { toast(e.message); }
  };

  const toggle = async (it) => {
    await api.patch(`/trips/${tripId}/itinerary/${it.id}`, { done: it.done ? 0 : 1 });
    load();
  };
  const del = async (id) => { await api.del(`/trips/${tripId}/itinerary/${id}`); load(); };

  const days = [...new Set(items.map((i) => i.day))].sort();

  return (
    <div className="detail-grid">
      <div className="card">
        <h3 className="section-title">Add to plan</h3>
        <div className="field"><label>Day</label><input className="input" type="date" value={form.day} onChange={set('day')} /></div>
        <div className="row">
          <div className="field" style={{ width: 120 }}><label>Time</label><input className="input" type="time" value={form.time} onChange={set('time')} /></div>
          <div className="field grow"><label>Activity</label><input className="input" value={form.title} onChange={set('title')} placeholder="Visit Charminar" /></div>
        </div>
        <div className="field"><label>Note</label><textarea rows={2} value={form.note} onChange={set('note')} placeholder="Optional details" /></div>
        <button className="btn primary" style={{ width: '100%' }} onClick={add}>Add activity</button>
      </div>

      <div>
        {days.length === 0 && <div className="card"><p className="muted">No plan yet. Add your first activity.</p></div>}
        {days.map((day) => (
          <div key={day} className="card" style={{ marginBottom: 14 }}>
            <h3 className="section-title" style={{ marginBottom: 10 }}>📅 {new Date(day).toDateString()}</h3>
            {items.filter((i) => i.day === day).map((it) => (
              <div key={it.id} className="list-item">
                <input type="checkbox" checked={!!it.done} onChange={() => toggle(it)} style={{ width: 'auto' }} />
                <div className="grow">
                  <strong style={{ textDecoration: it.done ? 'line-through' : 'none', opacity: it.done ? 0.6 : 1 }}>
                    {it.time && <span className="pill" style={{ marginRight: 8 }}>{it.time}</span>}
                    {it.title}
                  </strong>
                  {it.note && <div className="muted" style={{ fontSize: 13 }}>{it.note}</div>}
                </div>
                <button className="btn danger sm" onClick={() => del(it.id)}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
