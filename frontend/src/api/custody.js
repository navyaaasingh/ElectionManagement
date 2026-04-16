import { api } from './client.js';

export function getCustodyEvents(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/api/v1/custody/events${qs ? `?${qs}` : ''}`);
}

export function createCustodyEvent(payload) {
  return api.post('/api/v1/custody/events', payload);
}
