import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useAuth } from '../App.jsx';

const EMOJIS = [
  '😎', '🔥', '✨', '🚀', '🎉', '🥳', '🙌', '👏', '💯', '⭐', '🤩', '😍', '🥰', '❤️', '🤙', '💪',
  '😂', '🤣', '😜', '🤪', '😝', '😏', '🙃', '🤭', '🫣', '😬', '🤔', '🤯', '🥴', '😴', '🙈', '💩',
  '👻', '🤡', '👽', '🤖', '😹', '🫠', '🥲', '🫡', '🤌', '👀', '🫶', '🤝', '👍', '👎', '🙏', '🫂',
  '✈️', '🏖️', '🏝️', '🗺️', '🧳', '🚗', '🏔️', '🏕️', '🎡', '🌅', '🌈', '📸', '🍕', '🍔', '🌮', '🍜',
  '🍺', '🍻', '🍷', '🥂', '🍹', '☕', '🍦', '🎊', '🎈', '🕶️', '🌴', '🏄', '🧗', '🎯', '🥇', '🫰',
];

export default function Chat({ tripId, members = [] }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

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

  const onChange = (e) => {
    const val = e.target.value;
    setText(val);
    const upto = val.slice(0, e.target.selectionStart);
    const m = /@([\w]*)$/.exec(upto);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const suggestions = mentionQuery != null
    ? members.filter((mem) => mem.name.toLowerCase().includes(mentionQuery)).slice(0, 6)
    : [];

  const insertMention = (name) => {
    const pos = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([\w]*)$/, `@${name} `);
    setText(before + text.slice(pos));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const insertEmoji = (emo) => {
    const pos = inputRef.current?.selectionStart ?? text.length;
    setText(text.slice(0, pos) + emo + text.slice(pos));
    inputRef.current?.focus();
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    getSocket().emit('chat:message', { tripId, text: t });
    setText(''); setShowEmoji(false); setMentionQuery(null);
  };

  const fmtTime = (at) => { try { return new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  // Highlight @mentions of known members
  const names = members.map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const mentionRe = names.length ? new RegExp('@(' + names.join('|') + ')', 'g') : null;
  const render = (txt) => {
    if (!mentionRe) return txt;
    const out = []; let last = 0; let m; mentionRe.lastIndex = 0;
    while ((m = mentionRe.exec(txt))) {
      if (m.index > last) out.push(txt.slice(last, m.index));
      out.push(<span key={m.index} className="mention">@{m[1]}</span>);
      last = m.index + m[0].length;
    }
    if (last < txt.length) out.push(txt.slice(last));
    return out.length ? out : txt;
  };

  return (
    <div className="card" style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      <h3 className="section-title">Trip chat 💬</h3>
      <div className="chat-box" style={{ height: '54vh' }}>
        {messages.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No messages yet. Say hi to your crew 👋</p>}
        {messages.map((m, i) => (
          <div key={m.id || i} className={`chat-msg ${m.userId === user.id ? 'me' : ''}`}>
            {m.userId !== user.id && <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>{m.name}</div>}
            <div>{render(m.text)}</div>
            <div style={{ fontSize: 10, opacity: 0.6, textAlign: 'right' }}>{fmtTime(m.at)}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {suggestions.length > 0 && (
        <div className="card" style={{ padding: 6, marginTop: 8 }}>
          {suggestions.map((mem) => (
            <div key={mem.id} className="list-item" style={{ cursor: 'pointer', margin: 0 }} onClick={() => insertMention(mem.name)}>
              <span>@</span><strong style={{ fontSize: 14 }}>{mem.name}</strong>
            </div>
          ))}
        </div>
      )}

      {showEmoji && (
        <div className="card" style={{ padding: 8, marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
          {EMOJIS.map((e) => (
            <button key={e} className="btn ghost" style={{ fontSize: 20, padding: 4 }} onClick={() => insertEmoji(e)}>{e}</button>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => setShowEmoji((v) => !v)} title="Emojis">😊</button>
        <input
          ref={inputRef}
          className="input"
          value={text}
          onChange={onChange}
          placeholder="Message… use @ to tag someone"
          onKeyDown={(e) => { if (e.key === 'Enter' && !suggestions.length) send(); }}
        />
        <button className="btn primary" onClick={send}>Send</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Saved for everyone · 😊 for emojis · type @ to tag someone</p>
    </div>
  );
}
