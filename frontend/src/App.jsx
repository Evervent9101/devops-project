import React, { useEffect, useState } from 'react';

// Same-origin /api: Nginx (prod) or the Vite proxy (dev) forwards it to the backend.
const api = (path, opts) => fetch(`/api${path}`, opts).then((r) => (r.status === 204 ? null : r.json()));

export default function App() {
  const [items, setItems] = useState([]);
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api('/items')
      .then(setItems)
      .catch(() => setError('Backend unreachable'));

  useEffect(() => {
    load();
    api('/info').then(setInfo).catch(() => {});
  }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setName('');
    load();
  };

  const toggle = async (item) => {
    await api(`/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !item.done }),
    });
    load();
  };

  const remove = async (item) => {
    await api(`/items/${item.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <main className="wrap">
      <h1>DevOps Learning App</h1>
      {info && (
        <p className="meta">
          backend {info.version} · build #{info.build} · node {info.node}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <form onSubmit={add} className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New task…" />
        <button type="submit">Add</button>
      </form>

      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <label className={i.done ? 'done' : ''}>
              <input type="checkbox" checked={i.done} onChange={() => toggle(i)} />
              {i.name}
            </label>
            <button className="link" onClick={() => remove(i)}>delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
