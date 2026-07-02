import React, { useEffect, useRef, useState } from 'react';
import { L, coloredPin } from '../lib/leaflet.js';
import { getSocket } from '../lib/socket.js';
import { useToast } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

export default function LiveMap({ trip }) {
  const { user } = useAuth();
  const toast = useToast();
  const mapRef = useRef(null);
  const map = useRef(null);
  const markers = useRef({});
  const watchId = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [people, setPeople] = useState({});
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const chatEnd = useRef(null);

  useEffect(() => {
    map.current = L.map(mapRef.current).setView([trip.lat || 20.5937, trip.lng || 78.9629], trip.lat ? 12 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map.current);

    const socket = getSocket();
    socket.emit('trip:join', trip.id);

    const upsert = (u) => {
      setPeople((prev) => ({ ...prev, [u.userId]: u }));
      const color = u.avatar_color || '#3b82f6';
      const label = (u.name || '?')[0].toUpperCase();
      if (markers.current[u.userId]) {
        markers.current[u.userId].setLatLng([u.lat, u.lng]);
      } else {
        markers.current[u.userId] = L.marker([u.lat, u.lng], { icon: coloredPin(color, label) })
          .addTo(map.current).bindPopup(u.name + (u.userId === user.id ? ' (you)' : ''));
      }
    };

    socket.on('location:snapshot', (list) => list.forEach(upsert));
    socket.on('location:update', upsert);
    socket.on('chat:message', (m) => setMessages((prev) => [...prev, m]));

    return () => {
      socket.off('location:snapshot'); socket.off('location:update'); socket.off('chat:message');
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      map.current.remove();
    };
  }, [trip.id]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const toggleShare = () => {
    const socket = getSocket();
    if (sharing) {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setSharing(false);
      return;
    }
    if (!navigator.geolocation) return toast('Geolocation not supported');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        socket.emit('location:update', { tripId: trip.id, lat: latitude, lng: longitude });
        map.current.setView([latitude, longitude], 14);
      },
      () => toast('Location permission denied'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharing(true);
    toast('Sharing your live location');
  };

  const send = () => {
    if (!text.trim()) return;
    getSocket().emit('chat:message', { tripId: trip.id, text: text.trim() });
    setText('');
  };

  const list = Object.values(people);

  return (
    <div className="detail-grid" style={{ gridTemplateColumns: '1fr 320px' }}>
      <div>
        <div className="between" style={{ marginBottom: 10 }}>
          <span className="muted">{list.length} sharing location</span>
          <button className={`btn ${sharing ? 'danger' : 'primary'}`} onClick={toggleShare}>
            {sharing ? '⏹ Stop sharing' : '📡 Share my location'}
          </button>
        </div>
        <div ref={mapRef} className="map" />
        <div className="row wrap" style={{ marginTop: 10 }}>
          {list.map((p) => (
            <span key={p.userId} className="pill">
              🟢 {p.name}{p.userId === user.id ? ' (you)' : ''}
            </span>
          ))}
          {list.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No one is sharing yet. Tap “Share my location”.</span>}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 className="section-title">Trip chat</h3>
        <div className="chat-box">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.userId === user.id ? 'me' : ''}`}>
              {m.userId !== user.id && <div style={{ fontSize: 11, opacity: 0.7 }}>{m.name}</div>}
              {m.text}
            </div>
          ))}
          {messages.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Say hi to your crew 👋</p>}
          <div ref={chatEnd} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="btn primary" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
