import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useAuth } from '../App.jsx';

const EMOJIS = [
  '😎', '🔥', '✨', '🚀', '🎉', '🥳', '🙌', '👏', '💯', '⭐', '🤩', '😍', '🥰', '❤️', '🤙', '💪',
  '😂', '🤣', '😜', '🤪', '😝', '😏', '🙃', '🤭', '🫣', '😬', '🤔', '🤯', '🥴', '😴', '🙈', '💩',
  '👻', '🤡', '👽', '🤖', '😹', '🫠', '🥲', '🫡', '🤌', '👀', '🫶', '🤝', '👍', '👎', '🙏', '🫂',
  '✈️', '🏖️', '🗺️', '🧳', '🚗', '🏔️', '🏕️', '🌅', '🌈', '📸', '🍕', '🍔', '🌮', '🍜', '🍺', '🍻',
];

export default function Chat({ tripId, members = [] }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifType, setGifType] = useState('gifs');
  const [gifQ, setGifQ] = useState('tamil comedy');
  const [gifs, setGifs] = useState([]);
  const [gifState, setGifState] = useState('idle'); // idle | loading | none | off
  const [mentionQuery, setMentionQuery] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

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

  const searchGifs = async () => {
    setGifState('loading');
    try {
      const d = await api.get(`/gifs?q=${encodeURIComponent(gifQ || 'tamil comedy')}&type=${gifType}`);
      if (d.configured === false) { setGifState('off'); return; }
      setGifs(d.results.map((r) => r.url));
      setGifState(d.results.length ? 'idle' : 'none');
    } catch { setGifState('none'); }
  };
  useEffect(() => { if (showGif) searchGifs(); }, [showGif, gifType]);

  const onChange = (e) => {
    const val = e.target.value;
    setText(val);
    const upto = val.slice(0, e.target.selectionStart);
    const m = /@([\w]*)$/.exec(upto);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };
  const suggestions = mentionQuery != null ? members.filter((mem) => mem.name.toLowerCase().includes(mentionQuery)).slice(0, 6) : [];
  const insertMention = (name) => {
    const pos = inputRef.current?.selectionStart ?? text.length;
    setText(text.slice(0, pos).replace(/@([\w]*)$/, `@${name} `) + text.slice(pos));
    setMentionQuery(null); inputRef.current?.focus();
  };
  const insertEmoji = (emo) => {
    const pos = inputRef.current?.selectionStart ?? text.length;
    setText(text.slice(0, pos) + emo + text.slice(pos)); inputRef.current?.focus();
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    getSocket().emit('chat:message', { tripId, text: t, kind: 'text' });
    setText(''); setShowEmoji(false); setMentionQuery(null);
  };
  const sendGif = (url) => { getSocket().emit('chat:message', { tripId, text: url, kind: gifType === 'stickers' ? 'sticker' : 'gif' }); setShowGif(false); };
  const onImage = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 520 / img.width);
        const w = img.width * scale, h = img.height * scale;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        getSocket().emit('chat:message', { tripId, text: c.toDataURL('image/jpeg', 0.72), kind: 'image' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const fmtTime = (at) => { try { return new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const names = members.map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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
    <div className="card" style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 200px)', minHeight: 380 }}>
      <h3 className="section-title">Trip chat 💬</h3>
      <div className="chat-box" style={{ flex: 1, minHeight: 0 }}>
        {messages.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No messages yet. Say hi to your crew 👋</p>}
        {messages.map((m, i) => (
          <div key={m.id || i} className={`chat-msg ${m.userId === user.id ? 'me' : ''}`}>
            {m.userId !== user.id && <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>{m.name}</div>}
            {m.kind && m.kind !== 'text'
              ? <img src={m.text} alt="" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 10, display: 'block' }} loading="lazy" />
              : <div>{render(m.text)}</div>}
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
        <div className="card" style={{ padding: 8, marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, maxHeight: 170, overflowY: 'auto' }}>
          {EMOJIS.map((e) => <button key={e} className="btn ghost" style={{ fontSize: 20, padding: 4 }} onClick={() => insertEmoji(e)}>{e}</button>)}
        </div>
      )}

      {showGif && (
        <div className="card" style={{ padding: 8, marginTop: 8 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <div className="chip-row" style={{ margin: 0 }}>
              <div className={`chip ${gifType === 'gifs' ? 'active' : ''}`} onClick={() => setGifType('gifs')}>GIFs</div>
              <div className={`chip ${gifType === 'stickers' ? 'active' : ''}`} onClick={() => setGifType('stickers')}>Stickers</div>
            </div>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <input className="input" value={gifQ} onChange={(e) => setGifQ(e.target.value)} placeholder="Search (e.g. tamil comedy, vadivelu)" onKeyDown={(e) => e.key === 'Enter' && searchGifs()} />
            <button className="btn" onClick={searchGifs}>Search</button>
          </div>
          {gifState === 'off' && <p className="muted" style={{ fontSize: 13 }}>GIFs aren't set up yet — needs a free Giphy key. (Images & stickers-as-emoji still work.)</p>}
          {gifState === 'loading' && <div className="spinner" />}
          {gifState === 'none' && <p className="muted" style={{ fontSize: 13 }}>No results — try another search.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
            {gifs.map((u, i) => (
              <img key={i} src={u} alt="" style={{ width: '100%', borderRadius: 8, cursor: 'pointer' }} onClick={() => sendGif(u)} loading="lazy" />
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => { setShowEmoji((v) => !v); setShowGif(false); }} title="Emojis">😊</button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Send image">🖼️</button>
        <button className="btn" onClick={() => { setShowGif((v) => !v); setShowEmoji(false); }} title="GIFs & stickers">GIF</button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onImage} />
        <input ref={inputRef} className="input" value={text} onChange={onChange} placeholder="Message… @ to tag" onKeyDown={(e) => { if (e.key === 'Enter' && !suggestions.length) send(); }} />
        <button className="btn primary" onClick={send}>Send</button>
      </div>
    </div>
  );
}
