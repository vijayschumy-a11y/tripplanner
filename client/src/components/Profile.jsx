import React, { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal, Avatar, useToast } from '../lib/ui.jsx';
import { useAuth } from '../App.jsx';

export default function Profile({ onClose }) {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar || null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose an image');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!name.trim()) return toast('Enter a name');
    setBusy(true);
    try {
      const d = await api.patch('/auth/profile', { name: name.trim(), avatar });
      updateUser(d.user);
      toast('Profile updated');
      onClose();
    } catch (e) { toast(e.message); setBusy(false); }
  };

  return (
    <Modal title="Your profile" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Avatar user={{ ...user, name, avatar }} size={92} />
        <div className="row">
          <button className="btn sm" onClick={() => fileRef.current?.click()}>📷 {avatar ? 'Change photo' : 'Add photo'}</button>
          {avatar && <button className="btn ghost sm" onClick={() => setAvatar(null)}>Remove</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />
      </div>
      <div className="field"><label>Display name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{user.email || user.phone}</div>
      <button className="btn primary" style={{ width: '100%' }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </Modal>
  );
}
