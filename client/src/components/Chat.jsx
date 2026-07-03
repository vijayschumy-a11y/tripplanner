import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useAuth } from '../App.jsx';

export default function Chat({ tripId }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.get(`/trips/${tripId}/messages`).then((d) => {
      if (alive) setMessages(d.messages.map((m) => ({ ...m, userId: m.user_id, at: m.created_at })));
    });
    const socket = getSocket();
    socket.emit('trip:join', tripId);
    const onMsg = (m) => setMessages((prev) => (m.id && prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    socket.on('chat:message', onMsg);
    return () => { alive = false; socket.off('chat:message', onMsg); };
  }, [tripId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    getSocket().emit('chat:message', { tripId, text: t });
    setText('');
  };

  const fmtTime = (at) => { try { return new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      <h3 className="section-title">Trip chat 💬</h3>
      <div className="chat-box" style={{ height: '56vh' }}>
        {messages.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No messages yet. Say hi to your crew 👋</p>}
        {messages.map((m, i) => (
          <div key={m.id || i} className={`chat-msg ${m.userId === user.id ? 'me' : ''}`}>
            {m.userId !== user.id && <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>{m.name}</div>}
            <div>{m.text}</div>
            <div style={{ fontSize: 10, opacity: 0.6, textAlign: 'right' }}>{fmtTime(m.at)}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message everyone on the trip…" onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn primary" onClick={send}>Send</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Messages are saved — your crew sees them whenever they open this tab.</p>
    </div>
  );
}
