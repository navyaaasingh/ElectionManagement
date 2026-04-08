import React, { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta?.env?.VITE_API_BASE || 'http://localhost:3000';

const card = {
  border: '1px solid #d6dbe6',
  borderRadius: 10,
  padding: 12,
  background: '#fff',
};

export default function WarRoom() {
  const [dashboard, setDashboard] = useState(null);
  const [terminals, setTerminals] = useState(null);
  const [error, setError] = useState('');

  const token = useMemo(() => localStorage.getItem('token') || '', []);

  useEffect(() => {
    let timer;
    const load = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const [dashRes, termRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/operations/dashboard`, { headers }),
          fetch(`${API_BASE}/api/v1/terminal/status`, { headers }),
        ]);
        const [dashJson, termJson] = await Promise.all([dashRes.json(), termRes.json()]);
        setDashboard(dashJson);
        setTerminals(termJson);
        setError('');
      } catch (e) {
        setError(e.message || 'Failed to load War Room');
      }
    };
    load();
    timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [token]);

  const timeline = (dashboard?.anomalyAlerts || []).slice(0, 8);

  return (
    <div style={{ padding: 16, background: '#f5f7fb', minHeight: '100vh' }}>
      <h2 style={{ marginTop: 0 }}>Election War Room</h2>
      {error ? <p style={{ color: '#9b1c1c' }}>{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
        <div style={card}>
          <div>Total Terminals</div>
          <strong>{terminals?.summary?.total ?? '-'}</strong>
        </div>
        <div style={card}>
          <div>Online / Offline</div>
          <strong>{terminals?.summary?.online ?? '-'} / {terminals?.summary?.offline ?? '-'}</strong>
        </div>
        <div style={card}>
          <div>Queued Offline Votes</div>
          <strong>{terminals?.summary?.queuedVotes ?? '-'}</strong>
        </div>
      </div>

      <div style={{ ...card, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Turnout Heatmap (District)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(dashboard?.turnout?.velocityByDistrict || []).map((row) => (
            <div key={row.district_id} style={{ padding: 10, borderRadius: 8, background: '#e9f2ff' }}>
              <div>{row.district_id}</div>
              <strong>{Number(row.votes_per_hour || 0).toFixed(1)} / hr</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Terminal Status Map</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
          {(terminals?.terminals || []).map((t) => (
            <div
              key={t.terminalId}
              style={{
                padding: 8,
                borderRadius: 8,
                border: '1px solid #d6dbe6',
                background: t.status === 'online' ? '#e8f8ef' : '#fdecec',
              }}
            >
              <div style={{ fontSize: 12 }}>{t.terminalId}</div>
              <strong>{t.status}</strong>
              <div style={{ fontSize: 12 }}>Queue: {t.queueLength}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Anomaly Timeline</h3>
        {timeline.length === 0 ? <div>No recent anomaly events.</div> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {timeline.map((item) => (
              <li key={item._id || item.event_id || item.timestamp}>
                {new Date(item.timestamp || Date.now()).toLocaleString()} - {item.event_type || item.action || 'event'}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
