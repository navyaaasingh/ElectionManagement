import { api } from './client.js';

export function verifyBiometric(payload) {
  return api.post('/api/v1/verification/biometric', payload);
}

export function createManualOverride(payload) {
  return api.post('/api/v1/verification/manual-override', payload);
}

export function resolveManualOverride(overrideRequestId, payload) {
  return api.post(`/api/v1/verification/manual-override/${overrideRequestId}/approve`, payload);
}
