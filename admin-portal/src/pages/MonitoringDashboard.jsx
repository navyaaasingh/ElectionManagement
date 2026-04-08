import React, { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta?.env?.VITE_API_BASE || 'http://localhost:3000';

const terminalColor = (status, queueLength) => {
  if (status !== 'online') return '#ef4444';
  if ((queueLength || 0) > 10) return '#f59e0b';
  return '#10b981';
};

export default function MonitoringDashboard() {
  const [termStatus, setTermStatus] = useState(null);
  const [ops, setOps] = useState(null);
  const [mlHealth, setMlHealth] = useState(null);
  const [error, setError] = useState('');
  const token = useMemo(() => localStorage.getItem('token') || '', []);

  useEffect(() => {
    let timer;
    const load = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const [t, o, ml] = await Promise.all([
          fetch(`${API_BASE}/api/v1/terminal/status`, { headers }),
          fetch(`${API_BASE}/api/v1/operations/dashboard`, { headers }),
          fetch(`${API_BASE}/api/v1/operations/ml-health`, { headers }),
        ]);
        const [tj, oj, mj] = await Promise.all([t.json(), o.json(), ml.json()]);
        setTermStatus(tj);
        setOps(oj);
        setMlHealth(mj?.mlHealth || null);
        setError('');
      } catch (e) {
        setError(e.message || 'Failed to load monitoring');
      }
    };
    load();
    timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [token]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Monitoring Dashboard</h2>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

      <h3>Terminal Grid</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
        {(termStatus?.terminals || []).map((t) => (
          <div key={t.terminalId} style={{ border: `2px solid ${terminalColor(t.status, t.queueLength)}`, borderRadius: 8, padding: 8 }}>
            <div style={{ fontSize: 12 }}>{t.terminalId}</div>
            <div>{t.status}</div>
            <div style={{ fontSize: 12 }}>Queue {t.queueLength}</div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 20 }}>Vote Velocity</h3>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', minHeight: 140, border: '1px solid #ddd', padding: 10, borderRadius: 8 }}>
        {(ops?.turnout?.velocityByDistrict || []).slice(0, 10).map((v) => {
          const height = Math.max(8, Math.min(120, Number(v.votes_per_hour || 0)));
          return (
            <div key={v.district_id} style={{ textAlign: 'center' }}>
              <div style={{ width: 28, height, background: '#2563eb', borderRadius: 4 }} />
              <div style={{ fontSize: 10 }}>{v.district_id}</div>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 20 }}>Fabric / ML Health</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
          <div>Fabric Circuit</div>
          <strong>{(ops?.criticalAlerts || []).some((a) => a.type?.includes('TERMINAL') === false) ? 'CHECK ALERTS' : 'NORMAL'}</strong>
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
          <div>ML Service</div>
          <strong>{mlHealth?.healthy ? 'HEALTHY' : 'UNHEALTHY'}</strong>
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
          <div>ML Latency</div>
          <strong>{mlHealth?.latencyMs ?? '-'} ms</strong>
        </div>
      </div>
    </div>
  );
}
