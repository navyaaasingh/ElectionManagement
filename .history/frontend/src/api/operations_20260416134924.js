import { api } from './client.js';

export function getOperationsDashboard() {
  return api.get('/api/v1/operations/dashboard');
}

export function getTurnoutMetrics() {
  return api.get('/api/v1/operations/turnout');
}

export function exportAuditLogs(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const base = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const token = localStorage.getItem('auth_token');
  const url = `${base}/api/v1/operations/audit/export${qs ? `?${qs}` : ''}`;
  return fetch(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    return res.text();
  });
}

export function runWhatIfSimulation(payload) {
  return api.post('/api/v1/operations/simulate', payload);
}
