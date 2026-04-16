import { api } from './client.js';

export function createSupervisorAssignment(payload) {
  return api.post('/api/v1/supervisor/assignments', payload);
}

export function startBoothSession(payload) {
  return api.post('/api/v1/supervisor/sessions/start', payload);
}

export function pauseBoothSession(sessionId, payload = {}) {
  return api.post(`/api/v1/supervisor/sessions/${sessionId}/pause`, payload);
}

export function resumeBoothSession(sessionId, payload = {}) {
  return api.post(`/api/v1/supervisor/sessions/${sessionId}/resume`, payload);
}

export function stopBoothSession(sessionId, payload = {}) {
  return api.post(`/api/v1/supervisor/sessions/${sessionId}/stop`, payload);
}

export function getBoothSessionQueue(sessionId) {
  return api.get(`/api/v1/supervisor/sessions/${sessionId}/queue`);
}
